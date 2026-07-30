import { serve } from "https://deno.land/std@0.168.0/http/server.ts";
import { createClient } from "https://esm.sh/@supabase/supabase-js@2";

const corsHeaders = {
  "Access-Control-Allow-Origin": "*",
  "Access-Control-Allow-Headers": "content-type, x-crm-signature",
};

async function hmacHex(secret: string, message: string) {
  const key = await crypto.subtle.importKey(
    "raw",
    new TextEncoder().encode(secret),
    { name: "HMAC", hash: "SHA-256" },
    false,
    ["sign"],
  );
  const sig = await crypto.subtle.sign("HMAC", key, new TextEncoder().encode(message));
  return Array.from(new Uint8Array(sig))
    .map((b) => b.toString(16).padStart(2, "0"))
    .join("");
}

function timingSafeEqual(a: string, b: string) {
  if (a.length !== b.length) return false;
  let out = 0;
  for (let i = 0; i < a.length; i++) out |= a.charCodeAt(i) ^ b.charCodeAt(i);
  return out === 0;
}

serve(async (req) => {
  if (req.method === "OPTIONS") return new Response("ok", { headers: corsHeaders });

  const json = (body: unknown, status = 200) =>
    new Response(JSON.stringify(body), {
      status,
      headers: { ...corsHeaders, "Content-Type": "application/json" },
    });

  try {
    const secret = Deno.env.get("CRM_INTAKE_WEBHOOK_SECRET");
    if (!secret) return json({ error: "Not configured" }, 500);

    const rawBody = await req.text();
    const header = req.headers.get("X-CRM-Signature") || req.headers.get("x-crm-signature") || "";
    const provided = header.replace(/^sha256=/i, "").trim().toLowerCase();
    const expected = await hmacHex(secret, rawBody);
    if (!provided || !timingSafeEqual(provided, expected)) {
      return json({ error: "Unauthorized" }, 401);
    }

    let payload: any;
    try {
      payload = JSON.parse(rawBody);
    } catch {
      return json({ error: "Invalid JSON" }, 400);
    }

    const householdId = payload?.crmHouseholdId;
    if (!householdId || typeof householdId !== "string") {
      return json({ error: "crmHouseholdId is required" }, 400);
    }

    const admin = createClient(
      Deno.env.get("SUPABASE_URL")!,
      Deno.env.get("SUPABASE_SERVICE_ROLE_KEY")!,
    );

    // The agent may signal success either as { status: "provisioned" } or
    // { event: "vault.provisioned" }, and names the household root
    // "vaultRoot*" rather than "householdFolder*".
    const provisioned =
      payload?.status === "provisioned" || payload?.event === "vault.provisioned";
    const status = provisioned ? "provisioned" : "failed";
    const householdFolderUrl: string | null =
      payload?.householdFolderUrl ?? payload?.vaultRootUrl ?? null;
    const familyFolderUrl: string | null = payload?.familyFolderUrl ?? null;
    const vaultRootFolderId: string | null =
      payload?.vaultRootFolderId ??
      payload?.householdFolderId ??
      (householdFolderUrl
        ? String(householdFolderUrl).match(/folders\/([A-Za-z0-9_-]+)/)?.[1] ?? null
        : null);

    const { data: latest } = await admin
      .from("crm_intake_pushes")
      .select("id")
      .eq("household_id", householdId)
      .order("created_at", { ascending: false })
      .limit(1)
      .maybeSingle();

    const record = {
      household_id: householdId,
      family_id: payload?.crmFamilyId ?? null,
      status,
      callback_payload: payload,
      family_folder_url: familyFolderUrl,
      household_folder_url: householdFolderUrl,
      error: payload?.error ?? null,
    };

    if (latest?.id) {
      await admin.from("crm_intake_pushes").update(record).eq("id", latest.id);
    } else {
      await admin.from("crm_intake_pushes").insert(record);
    }

    // Persist the Drive root + token-scoped intake endpoints on the household.
    // Runs on every callback (not just `provisioned`) so a re-issued share token
    // still lands.
    {
      const patch: Record<string, string> = {};
      if (provisioned && vaultRootFolderId) patch.vault_root_folder_id = vaultRootFolderId;

      // If the agent's folder tree already contains a Shoebox, link it now.
      const folders: any[] = Array.isArray(payload?.folders) ? payload.folders : [];
      const shoebox = folders.find((f) => /shoebox/i.test(String(f?.path ?? f?.name ?? "")));
      if (shoebox?.driveFolderId) patch.vault_shoebox_folder_id = shoebox.driveFolderId;

      // Share token + ready-made endpoints power the client-portal intake panel
      // (server-side only — never exposed to the browser). The agent has shipped
      // these at a few nesting levels across spec revisions, so check all of them.
      const nests = [payload, payload?.vault, payload?.data, payload?.intake, payload?.portal]
        .filter((n) => n && typeof n === "object");
      const pick = (...keys: string[]) => {
        for (const n of nests) {
          for (const k of keys) {
            const v = (n as any)[k];
            if (v) return String(v);
          }
        }
        return null;
      };

      const shareToken = pick("shareToken", "share_token", "householdShareToken");
      const manifestUrl = pick("manifestUrl", "manifest_url");
      const uploadUrl = pick("uploadUrl", "upload_url");

      if (shareToken) patch.intake_share_token = shareToken;
      if (manifestUrl) patch.intake_manifest_url = manifestUrl;
      if (uploadUrl) patch.intake_upload_url = uploadUrl;

      // Fill in a missing sibling endpoint from whichever one we did receive.
      const base = (manifestUrl ?? uploadUrl ?? "").replace(/\/(manifest|upload)\/?$/, "");
      if (base) {
        if (!manifestUrl) patch.intake_manifest_url = `${base}/manifest`;
        if (!uploadUrl) patch.intake_upload_url = `${base}/upload`;
      }

      console.log(
        `[crm-intake-callback] household ${householdId} patch: ${
          Object.keys(patch).join(", ") || "(none)"
        }${shareToken ? "" : " — no shareToken in payload"}`,
      );

      if (Object.keys(patch).length > 0) {
        await admin.from("households").update(patch).eq("id", householdId);
      }

      // If the agent's tree has no Shoebox, vault-service creates and caches one
      // on first access (getShoeboxFolderId / ensureShoebox).
    }




    return json({ success: true });
  } catch (e) {
    console.error("crm-intake-callback error", e);
    return json({ error: e instanceof Error ? e.message : "Unexpected error" }, 500);
  }
});
