// Intake Portal — client-facing bridge for the Sovereignty Intake Agent.
//
// Two runtime modes:
//   INTAKE_AGENT_MODE=proxy  (default)  → forwards manifest/upload to the external agent.
//   INTAKE_AGENT_MODE=inhouse           → manifest, upload, and classification run inside this project.
//
// In in-house mode the external agent's share token NEVER reaches the browser.
// Clients authenticate with their existing portal token (x-portal-token); this
// function resolves their household and either proxies to the external agent or
// serves a manifest built from local tables (intake_classifications,
// intake_checklist_templates) and uploads files into the household's vault
// Shoebox for AI classification.

import { serve } from "https://deno.land/std@0.168.0/http/server.ts";
import { createClient } from "https://esm.sh/@supabase/supabase-js@2";
import {
  generateVertexContent,
  parseServiceAccountKey,
} from "../_shared/vertex-ai.ts";

const SUPABASE_URL = Deno.env.get("SUPABASE_URL")!;
const SUPABASE_SERVICE_ROLE_KEY = Deno.env.get("SUPABASE_SERVICE_ROLE_KEY")!;
const SUPABASE_ANON_KEY = Deno.env.get("SUPABASE_ANON_KEY")!;

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

const MODE = Deno.env.get("INTAKE_AGENT_MODE") ?? "proxy";
const VERTEX_MODEL = "gemini-2.5-flash";
const CLASSIFY_CONFIDENCE_THRESHOLD = 0.6;

interface Resolved {
  householdId: string;
  contactId: string;
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
    contactId: tok.contact_id,
    shareToken: hh.intake_share_token ?? null,
    manifestUrl: hh.intake_manifest_url ?? null,
    uploadUrl: hh.intake_upload_url ?? null,
  };
}

// ═════════════════════════════════════════════════════════════════════════════
//  PROXY MODE — existing external-agent passthrough
// ═════════════════════════════════════════════════════════════════════════════

function agentBase(): string | null {
  const raw = Deno.env.get("CRM_INTAKE_AGENT_URL");
  if (!raw) return null;
  return raw
    .trim()
    .replace(/\/+$/, "")
    .replace(/\/api\/public\/crm\/intake$/i, "");
}

async function handleProxyManifest(
  req: Request,
  cors: Record<string, string>,
  resolved: Resolved,
): Promise<Response> {
  const base = agentBase();
  const tokenPath = resolved.shareToken ? encodeURIComponent(resolved.shareToken) : null;
  const manifestUrl =
    resolved.manifestUrl ?? (base && tokenPath ? `${base}/api/public/vault/${tokenPath}/manifest` : null);
  const uploadUrl =
    resolved.uploadUrl ?? (base && tokenPath ? `${base}/api/public/vault/${tokenPath}/upload` : null);

  const contentType = req.headers.get("content-type") ?? "";

  // ── Upload passthrough (multipart/form-data with a single `file` field) ──
  if (contentType.includes("multipart/form-data")) {
    const form = await req.formData();
    const file = form.get("file");
    if (!(file instanceof File)) {
      return new Response(JSON.stringify({ error: "Missing file" }), {
        status: 400,
        headers: { ...cors, "Content-Type": "application/json" },
      });
    }
    if (file.size > 25 * 1024 * 1024) {
      return new Response(JSON.stringify({ error: "File exceeds 25MB" }), {
        status: 413,
        headers: { ...cors, "Content-Type": "application/json" },
      });
    }
    if (!uploadUrl) {
      return new Response(JSON.stringify({ error: "Intake agent not configured" }), {
        status: 503,
        headers: { ...cors, "Content-Type": "application/json" },
      });
    }

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
    return new Response(JSON.stringify(body), {
      status: res.ok ? 200 : res.status,
      headers: { ...cors, "Content-Type": "application/json" },
    });
  }

  // ── Manifest ──
  const payload = await req.json().catch(() => ({}));
  const action = (payload as { action?: string })?.action ?? "manifest";
  if (action !== "manifest") {
    return new Response(JSON.stringify({ error: "Unknown action" }), {
      status: 400,
      headers: { ...cors, "Content-Type": "application/json" },
    });
  }
  if (!manifestUrl) {
    return new Response(JSON.stringify({ error: "Intake agent not configured" }), {
      status: 503,
      headers: { ...cors, "Content-Type": "application/json" },
    });
  }

  const res = await fetch(manifestUrl, { headers: { Accept: "application/json" } });

  const text = await res.text();
  let manifest: Record<string, unknown>;
  try {
    manifest = JSON.parse(text);
  } catch {
    console.error("[IntakePortal] non-JSON manifest:", text.slice(0, 300));
    return new Response(JSON.stringify({ error: "Unexpected response from intake agent" }), {
      status: 502,
      headers: { ...cors, "Content-Type": "application/json" },
    });
  }
  if (!res.ok) {
    return new Response(
      JSON.stringify({ enabled: false, reason: "agent_error", status: res.status }),
      { status: 200, headers: { ...cors, "Content-Type": "application/json" } },
    );
  }

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

  const normalizeRequirement = (it: any): "required" | "optional" | null => {
    const raw = String(
      it?.requirement ?? it?.priority ?? it?.necessity ??
        (it?.required === true ? "required" : it?.required === false ? "optional" : it?.optional === true ? "optional" : ""),
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

  return new Response(
    JSON.stringify({
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
    }),
    { headers: { ...cors, "Content-Type": "application/json" } },
  );
}

// ═════════════════════════════════════════════════════════════════════════════
//  IN-HOUSE MODE — local manifest, upload, and Vertex AI classification
// ═════════════════════════════════════════════════════════════════════════════

async function getValidGoogleToken(): Promise<string | null> {
  const { data } = await admin
    .from("google_tokens")
    .select("access_token, token_expiry, refresh_token, user_id")
    .order("updated_at", { ascending: false })
    .limit(1)
    .maybeSingle();
  if (!data) return null;
  if (new Date(data.token_expiry) <= new Date(Date.now() + 60_000)) {
    const GOOGLE_CLIENT_ID = Deno.env.get("GOOGLE_CLIENT_ID")!;
    const GOOGLE_CLIENT_SECRET = Deno.env.get("GOOGLE_CLIENT_SECRET")!;
    const res = await fetch("https://oauth2.googleapis.com/token", {
      method: "POST",
      headers: { "Content-Type": "application/x-www-form-urlencoded" },
      body: new URLSearchParams({
        client_id: GOOGLE_CLIENT_ID,
        client_secret: GOOGLE_CLIENT_SECRET,
        refresh_token: data.refresh_token,
        grant_type: "refresh_token",
      }),
    });
    const tokens = await res.json();
    if (tokens.error) {
      console.error("[IntakePortal] token refresh failed", tokens);
      return null;
    }
    const newExpiry = new Date(Date.now() + tokens.expires_in * 1000).toISOString();
    await admin
      .from("google_tokens")
      .update({ access_token: tokens.access_token, token_expiry: newExpiry })
      .eq("user_id", data.user_id);
    return tokens.access_token;
  }
  return data.access_token;
}

async function callVaultService(
  action: string,
  body: Record<string, unknown>,
  portalToken: string,
): Promise<any> {
  const res = await fetch(`${SUPABASE_URL}/functions/v1/vault-service`, {
    method: "POST",
    headers: {
      "Content-Type": "application/json",
      "x-portal-token": portalToken,
    },
    body: JSON.stringify({ action, ...body }),
  });
  const text = await res.text();
  let json: any = {};
  try {
    json = JSON.parse(text);
  } catch {
    json = { raw: text };
  }
  if (!res.ok) {
    throw new Error(json?.error || `vault-service ${action} failed (${res.status})`);
  }
  return json;
}

function arrayBufferToBase64(buffer: ArrayBuffer): string {
  const bytes = new Uint8Array(buffer);
  let binary = "";
  for (let i = 0; i < bytes.byteLength; i++) {
    binary += String.fromCharCode(bytes[i]);
  }
  return btoa(binary);
}

async function classifyDocument(
  classificationId: string,
  fileName: string,
  driveFileId: string,
  mimeType: string,
  householdId: string,
) {
  try {
    const sa = await parseServiceAccountKey(Deno.env.get("GCP_SERVICE_ACCOUNT_KEY"));

    // Load active checklist templates to ground the model's category choice.
    const { data: templates } = await admin
      .from("intake_checklist_templates")
      .select("id, name, category, requirement")
      .eq("is_active", true)
      .order("sort_order");

    const categories = (templates ?? []).map((t: any) => ({
      id: t.id,
      name: t.name,
      category: t.category,
      requirement: t.requirement,
    }));

    const categoryList = categories.length
      ? categories.map((c) => `- "${c.name}" (category: ${c.category ?? "other"})`).join("\n")
      : "- Statement / Tax / Identity / Legal / Insurance / Corporate / Other";

    const prompt = `You are a document classifier for a Canadian family-office intake vault.

File name: "${fileName}"
MIME type: ${mimeType}

Choose the single best matching document type from this checklist:
${categoryList}

Respond ONLY with a JSON object in this exact shape (no markdown, no commentary):
{
  "matchedName": "exact name from the checklist, or 'Other'",
  "category": "best category label",
  "confidence": 0.0 to 1.0,
  "reviewRequired": true or false
}

Set reviewRequired=true if the file name is vague, ambiguous, or the confidence is below 0.7.`;

    const result = await generateVertexContent(
      sa,
      VERTEX_MODEL,
      [{ role: "user", parts: [{ text: prompt }] }],
      { responseMimeType: "application/json" },
    );

    const textPart = result.candidates?.[0]?.content?.parts?.find((p: any) => typeof p.text === "string");
    const rawText = textPart?.text ?? "";
    let parsed: any = {};
    try {
      // Strip markdown fences if the model added them.
      const cleaned = rawText.replace(/^```json\s*/i, "").replace(/\s*```$/i, "").trim();
      parsed = JSON.parse(cleaned);
    } catch {
      parsed = {};
    }

    const matchedTemplate = categories.find((c) =>
      String(parsed.matchedName || "").toLowerCase() === c.name.toLowerCase()
    );

    const confidence = typeof parsed.confidence === "number" ? parsed.confidence : 0;
    const reviewRequired = !!parsed.reviewRequired || confidence < CLASSIFY_CONFIDENCE_THRESHOLD;
    const status = reviewRequired ? "needs_review" : "filed";

    await admin
      .from("intake_classifications")
      .update({
        predicted_category: parsed.category || parsed.matchedName || "Other",
        confidence,
        status,
        review_required: reviewRequired,
        matched_checklist_template_id: matchedTemplate?.id ?? null,
        updated_at: new Date().toISOString(),
      })
      .eq("id", classificationId);

    console.log(`[IntakePortal] classified ${classificationId} as ${parsed.matchedName} (${confidence})`);
  } catch (e) {
    console.error(`[IntakePortal] classification failed for ${classificationId}:`, e);
    await admin
      .from("intake_classifications")
      .update({
        status: "needs_review",
        review_required: true,
        predicted_category: "Other",
        updated_at: new Date().toISOString(),
      })
      .eq("id", classificationId);
  }
}

async function handleInhouseUpload(
  req: Request,
  cors: Record<string, string>,
  resolved: Resolved,
): Promise<Response> {
  const form = await req.formData();
  const file = form.get("file");
  if (!(file instanceof File)) {
    return new Response(JSON.stringify({ error: "Missing file" }), {
      status: 400,
      headers: { ...cors, "Content-Type": "application/json" },
    });
  }
  if (file.size > 25 * 1024 * 1024) {
    return new Response(JSON.stringify({ error: "File exceeds 25MB" }), {
      status: 413,
      headers: { ...cors, "Content-Type": "application/json" },
    });
  }

  const portalToken = req.headers.get("x-portal-token")!;

  // Ensure the household vault root exists before uploading.
  const { data: hh } = await admin
    .from("households")
    .select("vault_root_folder_id")
    .eq("id", resolved.householdId)
    .maybeSingle();
  if (!hh?.vault_root_folder_id) {
    return new Response(JSON.stringify({ error: "Vault not provisioned" }), {
      status: 400,
      headers: { ...cors, "Content-Type": "application/json" },
    });
  }

  // Get or create the Shoebox folder via vault-service.
  const shoebox = await callVaultService("ensureShoebox", {}, portalToken);
  const folderId = shoebox.folderId;
  if (!folderId) {
    return new Response(JSON.stringify({ error: "Could not prepare upload folder" }), {
      status: 500,
      headers: { ...cors, "Content-Type": "application/json" },
    });
  }

  // Upload the file to Drive through vault-service (reuses its firewall + audit).
  const base64 = arrayBufferToBase64(await file.arrayBuffer());
  const upload = await callVaultService(
    "uploadFile",
    {
      folderId,
      fileName: file.name,
      mimeType: file.type || "application/octet-stream",
      base64,
      contactId: resolved.contactId,
    },
    portalToken,
  );

  if (!upload.fileId) {
    return new Response(JSON.stringify({ error: "Upload to vault failed" }), {
      status: 500,
      headers: { ...cors, "Content-Type": "application/json" },
    });
  }

  // Record the pending classification.
  const { data: classification } = await admin
    .from("intake_classifications")
    .insert({
      household_id: resolved.householdId,
      file_name: file.name,
      drive_file_id: upload.fileId,
      mime_type: file.type || "application/octet-stream",
      size_bytes: file.size,
      status: "pending",
    })
    .select("id")
    .single();

  // Classify asynchronously so the upload response returns immediately.
  // @ts-ignore EdgeRuntime is provided by Supabase Edge Functions runtime
  if (typeof EdgeRuntime !== "undefined") {
    EdgeRuntime.waitUntil(
      classifyDocument(
        classification!.id,
        file.name,
        upload.fileId,
        file.type || "application/octet-stream",
        resolved.householdId,
      ),
    );
  } else {
    // Local / test fallback — run in background without blocking response.
    classifyDocument(
      classification!.id,
      file.name,
      upload.fileId,
      file.type || "application/octet-stream",
      resolved.householdId,
    ).catch(console.error);
  }

  return new Response(
    JSON.stringify({
      success: true,
      fileId: upload.fileId,
      classificationId: classification!.id,
      status: "pending",
    }),
    { headers: { ...cors, "Content-Type": "application/json" } },
  );
}

async function handleInhouseManifest(
  req: Request,
  cors: Record<string, string>,
  resolved: Resolved,
): Promise<Response> {
  const { data: household } = await admin
    .from("households")
    .select("id, label, family_id, families(name)")
    .eq("id", resolved.householdId)
    .maybeSingle();
  const familyName = (household as any)?.families?.name ?? "Family";
  const householdName = household?.label ?? "Household";

  const [{ data: templates }, { data: classifications }] = await Promise.all([
    admin
      .from("intake_checklist_templates")
      .select("id, name, category, requirement")
      .eq("is_active", true)
      .order("sort_order"),
    admin
      .from("intake_classifications")
      .select("*")
      .eq("household_id", resolved.householdId)
      .order("created_at", { ascending: false }),
  ]);

  const activeTemplates = (templates ?? []) as any[];
  const classRows = (classifications ?? []) as any[];

  // Match each classification to the best template by name similarity.
  const matchedByTemplate = new Map<string, any[]>();
  for (const cls of classRows) {
    const lowerFile = String(cls.file_name).toLowerCase();
    let best: any = null;
    let bestScore = 0;
    for (const t of activeTemplates) {
      const nameTokens = String(t.name).toLowerCase().split(/\s+/);
      let score = 0;
      for (const token of nameTokens) {
        if (token.length > 2 && lowerFile.includes(token)) score += 1;
      }
      if (String(cls.predicted_category).toLowerCase() === String(t.name).toLowerCase()) score += 5;
      if (cls.matched_checklist_template_id === t.id) score += 10;
      if (score > bestScore) {
        bestScore = score;
        best = t;
      }
    }
    if (best) {
      const list = matchedByTemplate.get(best.id) ?? [];
      list.push(cls);
      matchedByTemplate.set(best.id, list);
    }
  }

  const checklist = activeTemplates.map((t) => {
    const matches = matchedByTemplate.get(t.id) ?? [];
    const filed = matches.filter((c) => c.status === "filed").length;
    const pending = matches.filter((c) => c.status === "pending").length;
    const needsReview = matches.filter((c) => c.status === "needs_review").length;

    let status = "waiting";
    if (filed > 0) status = "filed";
    else if (needsReview > 0) status = "needs_review";
    else if (pending > 0) status = "pending";

    return {
      name: t.name,
      category: t.category ?? null,
      ownerInitials: null,
      subType: null,
      status,
      receivedCount: matches.length,
      requirement: t.requirement === "required" ? "required" : "optional",
    };
  });

  const requiredItems = checklist.filter((i) => i.requirement === "required");
  const requiredSatisfied = requiredItems.filter((i) => i.status === "filed").length;
  const totalItems = checklist.length;
  const satisfiedTotal = checklist.filter((i) => i.status === "filed").length;
  const processingCount = classRows.filter((c) => c.status === "pending").length;
  const needsReviewCount = classRows.filter((c) => c.status === "needs_review").length;
  const uploadedFiles = classRows.length;

  const percent = totalItems > 0 ? Math.round((satisfiedTotal / totalItems) * 100) : 0;
  const criticalComplete = requiredItems.length > 0 && requiredSatisfied === requiredItems.length;
  const complete = criticalComplete && processingCount === 0 && needsReviewCount === 0;

  const uploads: any[] = classRows.map((c) => ({
    fileName: c.file_name,
    folderName: "00 Shoebox (Client Uploads)",
    createdAt: c.created_at,
    classification: {
      status: c.status,
      category: c.predicted_category ?? null,
      typeTag: c.mime_type ?? null,
      identifier: c.drive_file_id ?? null,
    },
  }));

  return new Response(
    JSON.stringify({
      enabled: true,
      familyName,
      householdName,
      status: complete ? "complete" : "in_progress",
      ready: true,
      completion: {
        status: complete ? "complete" : "in_progress",
        expectedItems: totalItems,
        uploadedFiles,
        percent,
        lastUploadAt: classRows[0]?.created_at ?? null,
        classification: {
          pending: processingCount,
          filed: classRows.filter((c) => c.status === "filed").length,
          needsReview: needsReviewCount,
          failed: 0,
        },
        audit: {
          criticalTotal: requiredItems.length,
          criticalSatisfied: requiredSatisfied,
          total: totalItems,
          satisfiedTotal,
          percent,
          criticalComplete,
          processing: processingCount,
          missingCritical: requiredItems
            .filter((i) => i.status !== "filed")
            .map((i) => i.name),
          missingRecommended: checklist
            .filter((i) => i.requirement !== "required" && i.status !== "filed")
            .map((i) => i.name),
        },
      },
      checklist,
      uploads,
      limits: { maxBytes: 25 * 1024 * 1024, allowedTypes: [] },
    }),
    { headers: { ...cors, "Content-Type": "application/json" } },
  );
}

// ═════════════════════════════════════════════════════════════════════════════
//  ENTRYPOINT
// ═════════════════════════════════════════════════════════════════════════════

serve(async (req) => {
  const cors = getCorsHeaders(req);
  if (req.method === "OPTIONS") return new Response("ok", { headers: cors });

  const json = (body: unknown, status = 200) =>
    new Response(JSON.stringify(body), {
      status,
      headers: { ...cors, "Content-Type": "application/json" },
    });

  try {
    const resolved = await resolveHousehold(req);
    if (!resolved) return json({ error: "Unauthorized" }, 401);

    // If the household is still linked to an external agent, keep using the
    // proxy even when the global mode is in-house. Staff can clear the
    // intake_share_token/intake_manifest_url to switch a household over.
    const householdLinkedExternally = !!(
      resolved.shareToken || resolved.manifestUrl || resolved.uploadUrl
    );
    const effectiveMode = MODE === "inhouse" && !householdLinkedExternally ? "inhouse" : "proxy";

    if (effectiveMode === "proxy") {
      if (!householdLinkedExternally) {
        return json({ enabled: false, reason: "not_linked" });
      }
      return await handleProxyManifest(req, cors, resolved);
    }

    // In-house mode
    const contentType = req.headers.get("content-type") ?? "";
    if (contentType.includes("multipart/form-data")) {
      return await handleInhouseUpload(req, cors, resolved);
    }

    const payload = await req.json().catch(() => ({}));
    const action = (payload as { action?: string })?.action ?? "manifest";
    if (action !== "manifest") return json({ error: "Unknown action" }, 400);
    return await handleInhouseManifest(req, cors, resolved);
  } catch (e) {
    console.error("[IntakePortal] error:", e);
    return json({ error: e instanceof Error ? e.message : "Unexpected error" }, 500);
  }
});
