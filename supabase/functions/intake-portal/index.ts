// Intake Portal Proxy — Montreal-pinned bridge between the client portal and
// the Sovereignty Intake Agent's token-scoped vault API.
//
// The agent's share token NEVER reaches the browser. Clients authenticate with
// their existing portal token (x-portal-token); this function resolves their
// household, looks up households.intake_share_token, and proxies:
//   action=manifest  → GET  <agent>/api/public/vault/<token>/manifest
//   multipart upload → POST <agent>/api/public/vault/<token>/upload

import { serve } from "https://deno.land/std@0.168.0/http/server.ts";
import { createClient } from "https://esm.sh/@supabase/supabase-js@2";

const SUPABASE_URL = Deno.env.get("SUPABASE_URL")!;
const SUPABASE_SERVICE_ROLE_KEY = Deno.env.get("SUPABASE_SERVICE_ROLE_KEY")!;

const ALLOWED_ORIGINS = [
  "https://prosperwise.lovable.app",
  "https://app.prosperwise.ca",
  "https://id-preview--339dfc8f-3e82-4b05-8a36-a9f66fc58449.lovable.app",
];

function getCorsHeaders(req: Request) {
  const origin = req.headers.get("Origin") || "";
  const allowed = ALLOWED_ORIGINS.includes(origin) ? origin : ALLOWED_ORIGINS[0];
  return {
    "Access-Control-Allow-Origin": allowed,
    "Access-Control-Allow-Headers":
      "authorization, x-client-info, apikey, content-type, x-portal-token",
    "Access-Control-Allow-Methods": "POST, OPTIONS",
  };
}

const admin = createClient(SUPABASE_URL, SUPABASE_SERVICE_ROLE_KEY);

function agentBase(): string | null {
  const raw = Deno.env.get("CRM_INTAKE_AGENT_URL");
  if (!raw) return null;
  return raw
    .trim()
    .replace(/\/+$/, "")
    .replace(/\/api\/public\/crm\/intake$/i, "");
}

interface Resolved {
  householdId: string;
  shareToken: string | null;
  manifestUrl: string | null;
  uploadUrl: string | null;
}

async function resolveHousehold(req: Request): Promise<Resolved | null> {
  const portalToken = req.headers.get("x-portal-token");
  if (!portalToken) return null;
  const { data: tok } = await admin
    .from("portal_tokens")
    .select("contact_id, expires_at, revoked")
    .eq("token", portalToken)
    .maybeSingle();
  if (!tok || tok.revoked || new Date(tok.expires_at) <= new Date()) return null;

  const { data: contact } = await admin
    .from("contacts")
    .select("household_id")
    .eq("id", tok.contact_id)
    .maybeSingle();
  if (!contact?.household_id) return null;

  const { data: hh } = await admin
    .from("households")
    .select("id, intake_share_token, intake_manifest_url, intake_upload_url")
    .eq("id", contact.household_id)
    .maybeSingle();
  if (!hh) return null;
  return {
    householdId: hh.id,
    shareToken: hh.intake_share_token ?? null,
    manifestUrl: hh.intake_manifest_url ?? null,
    uploadUrl: hh.intake_upload_url ?? null,
  };
}

serve(async (req) => {
  const cors = getCorsHeaders(req);
  if (req.method === "OPTIONS") return new Response("ok", { headers: cors });

  const json = (body: unknown, status = 200) =>
    new Response(JSON.stringify(body), {
      status,
      headers: { ...cors, "Content-Type": "application/json" },
    });

  try {
    const base = agentBase();
    const resolved = await resolveHousehold(req);
    if (!resolved) return json({ error: "Unauthorized" }, 401);
    if (!resolved.shareToken && !resolved.manifestUrl) {
      // Not yet linked — the portal simply hides the intake panel.
      return json({ enabled: false, reason: "not_linked" });
    }

    // Prefer the agent's ready-made endpoints; fall back to composing them.
    const tokenPath = resolved.shareToken ? encodeURIComponent(resolved.shareToken) : null;
    const manifestUrl =
      resolved.manifestUrl ?? (base && tokenPath ? `${base}/api/public/vault/${tokenPath}/manifest` : null);
    const uploadUrl =
      resolved.uploadUrl ?? (base && tokenPath ? `${base}/api/public/vault/${tokenPath}/upload` : null);
    if (!manifestUrl || !uploadUrl) return json({ error: "Intake agent not configured" }, 503);


    const contentType = req.headers.get("content-type") ?? "";

    // ── Upload passthrough (multipart/form-data with a single `file` field) ──
    if (contentType.includes("multipart/form-data")) {
      const form = await req.formData();
      const file = form.get("file");
      if (!(file instanceof File)) return json({ error: "Missing file" }, 400);
      if (file.size > 25 * 1024 * 1024) return json({ error: "File exceeds 25MB" }, 413);

      const out = new FormData();
      out.append("file", file, file.name);
      const res = await fetch(uploadUrl, { method: "POST", body: out });

      const text = await res.text();
      let body: unknown;
      try {
        body = JSON.parse(text);
      } catch {
        body = { error: "Unexpected response from intake agent" };
      }
      return json(body, res.ok ? 200 : res.status);
    }

    // ── Manifest ──
    const payload = await req.json().catch(() => ({}));
    const action = (payload as { action?: string })?.action ?? "manifest";
    if (action !== "manifest") return json({ error: "Unknown action" }, 400);

    const res = await fetch(manifestUrl, { headers: { Accept: "application/json" } });

    const text = await res.text();
    let manifest: Record<string, unknown>;
    try {
      manifest = JSON.parse(text);
    } catch {
      console.error("[IntakePortal] non-JSON manifest:", text.slice(0, 300));
      return json({ error: "Unexpected response from intake agent" }, 502);
    }
    if (!res.ok) return json({ enabled: false, reason: "agent_error", status: res.status }, 200);

    // Strip anything that could leak Drive internals to the browser.
    const {
      familyName,
      householdName,
      status,
      ready,
      completion,
      uploads,
      limits,
      items,
      knownItems,
      folders,
    } = manifest as Record<string, any>;

    // Checklist: prefer the agent's Spec v2 audit checklist (AI-detected document
    // completeness). `critical` items are Required, the rest Optional. Vault
    // folders that carry no requirement are internal structure and stay hidden.
    const normalizeRequirement = (it: any): "required" | "optional" | null => {
      const raw = String(
        it?.requirement ?? it?.priority ?? it?.necessity ?? (it?.required === true ? "required" : it?.required === false ? "optional" : it?.optional === true ? "optional" : ""),
      )
        .trim()
        .toLowerCase();
      if (["required", "mandatory", "must", "high"].includes(raw)) return "required";
      if (["optional", "nice_to_have", "nice-to-have", "recommended", "low"].includes(raw)) {
        return "optional";
      }
      return null;
    };

    const auditItems = Array.isArray((completion as any)?.audit?.items)
      ? (completion as any).audit.items
      : [];

    const checklist = auditItems.length
      ? auditItems.map((it: any) => ({
          name: it?.label ?? it?.key ?? "Document",
          category: it?.category ?? null,
          ownerInitials: null,
          subType: null,
          status: it?.satisfied ? "filed" : "waiting",
          receivedCount: typeof it?.matches === "number" ? it.matches : undefined,
          requirement: it?.critical ? "required" : "optional",
        }))
      : (Array.isArray(items) ? items : Array.isArray(knownItems) ? knownItems : [])
          .map((it: any) => ({
            name: it?.name ?? it?.label ?? "Document",
            category: it?.category ?? null,
            ownerInitials: it?.ownerInitials ?? null,
            subType: it?.subType ?? null,
            status: it?.status ?? (it?.received ? "received" : "waiting"),
            receivedCount: typeof it?.receivedCount === "number" ? it.receivedCount : undefined,
            requirement: normalizeRequirement(it),
          }))
          .filter((it: any) => it.requirement !== null);



    return json({
      enabled: true,
      familyName,
      householdName,
      status,
      ready,
      completion: completion ?? null,
      checklist,
      uploads: Array.isArray(uploads)
        ? uploads.map((u: any) => ({
            fileName: u?.fileName,
            folderName: u?.folderName,
            createdAt: u?.createdAt,
            classification: u?.classification
              ? {
                  status: u.classification.status,
                  category: u.classification.category,
                  typeTag: u.classification.typeTag,
                  identifier: u.classification.identifier,
                }
              : null,
          }))
        : [],
      limits: limits ?? null,
    });
  } catch (e) {
    console.error("[IntakePortal] error", e);
    return json({ error: (e as Error).message ?? "Unexpected error" }, 500);
  }
});
