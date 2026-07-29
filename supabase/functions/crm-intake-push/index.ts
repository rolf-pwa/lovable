import { serve } from "https://deno.land/std@0.168.0/http/server.ts";
import { createClient } from "https://esm.sh/@supabase/supabase-js@2";

const corsHeaders = {
  "Access-Control-Allow-Origin": "*",
  "Access-Control-Allow-Headers": "authorization, x-client-info, apikey, content-type",
};

const CATEGORIES = [
  "00_Vault_Control",
  "01_Identities",
  "02_Financial",
  "03_Legal_Entity",
  "04_Asset_Specific",
  "05_Income_Tax",
  "06_Insurance",
  "07_Estate_Planning",
  "08_Medical",
  "09_Miscellaneous",
  "10_Corporate_Entities",
];

const STRUCTURES: Record<string, string> = {
  opco: "OTHER",
  holdco: "OTHER",
  trust: "TRUST",
  partnership: "PARTNERSHIP",
  other: "OTHER",
};

function initialsOf(first?: string | null, last?: string | null) {
  const f = (first || "").trim();
  const l = (last || "").trim();
  const s = `${f.charAt(0)}${l.charAt(0)}`.toUpperCase();
  return s || "XX";
}

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

serve(async (req) => {
  if (req.method === "OPTIONS") return new Response("ok", { headers: corsHeaders });

  const json = (body: unknown, status = 200) =>
    new Response(JSON.stringify(body), {
      status,
      headers: { ...corsHeaders, "Content-Type": "application/json" },
    });

  try {
    const secret = Deno.env.get("CRM_INTAKE_WEBHOOK_SECRET");
    const agentUrl = Deno.env.get("CRM_INTAKE_AGENT_URL");
    if (!secret || !agentUrl) {
      return json({ error: "Intake agent is not configured (missing secret or URL)." }, 500);
    }

    // ---- Staff auth -------------------------------------------------------
    const authHeader = req.headers.get("Authorization") || "";
    const supabaseUser = createClient(
      Deno.env.get("SUPABASE_URL")!,
      Deno.env.get("SUPABASE_ANON_KEY")!,
      { global: { headers: { Authorization: authHeader } } },
    );
    const { data: userData, error: userErr } = await supabaseUser.auth.getUser();
    if (userErr || !userData?.user) return json({ error: "Unauthorized" }, 401);

    const body = await req.json().catch(() => ({}));
    const householdId: string | undefined = body?.household_id;
    if (!householdId || typeof householdId !== "string") {
      return json({ error: "household_id is required" }, 400);
    }

    const admin = createClient(
      Deno.env.get("SUPABASE_URL")!,
      Deno.env.get("SUPABASE_SERVICE_ROLE_KEY")!,
    );

    // ---- Gather the CRM record -------------------------------------------
    const { data: household, error: hhErr } = await admin
      .from("households")
      .select("id, label, address, family_id")
      .eq("id", householdId)
      .single();
    if (hhErr || !household) return json({ error: "Household not found" }, 404);

    const { data: family } = await admin
      .from("families")
      .select("id, name")
      .eq("id", household.family_id)
      .maybeSingle();

    const { data: contacts } = await admin
      .from("contacts")
      .select("id, first_name, last_name, full_name, family_role")
      .eq("household_id", householdId);

    const members = (contacts || []).map((c: any) => {
      const parts = (c.full_name || "").trim().split(/\s+/);
      const firstName = c.first_name || parts[0] || "Unknown";
      const lastName = c.last_name || parts.slice(1).join(" ") || "Member";
      return {
        crmMemberId: c.id,
        firstName,
        lastName,
        initials: initialsOf(firstName, lastName),
        role: c.family_role || "Member",
      };
    });

    if (members.length === 0) {
      return json({ error: "Household has no members to push." }, 400);
    }

    const memberIds = (contacts || []).map((c: any) => c.id);
    const initialsById = new Map(
      (contacts || []).map((c: any, i: number) => [c.id, members[i].initials]),
    );

    const [{ data: vineyard }, { data: storehouses }, { data: tank }, { data: shareholders }] =
      await Promise.all([
        admin.from("vineyard_accounts").select("id, contact_id, institution, account_type").in("contact_id", memberIds),
        admin.from("storehouses").select("id, contact_id, label, storehouse_type, asset_type").in("contact_id", memberIds),
        admin.from("holding_tank").select("id, contact_id, institution, account_type").in("contact_id", memberIds).neq("status", "moved"),
        admin.from("shareholders").select("contact_id, corporation_id, ownership_percentage").in("contact_id", memberIds).eq("is_active", true),
      ]);

    const corpIds = [...new Set((shareholders || []).map((s: any) => s.corporation_id))].filter(Boolean);
    const [{ data: corps }, { data: insurance }] = await Promise.all([
      corpIds.length
        ? admin.from("corporations").select("id, name, corporation_type, jurisdiction").in("id", corpIds)
        : Promise.resolve({ data: [] as any[] }),
      admin
        .from("insurance_policies")
        .select("id, contact_id, corporation_id, carrier, policy_type")
        .or(
          `contact_id.in.(${memberIds.join(",")})${corpIds.length ? `,corporation_id.in.(${corpIds.join(",")})` : ""}`,
        ),
    ]);

    const knownItems: any[] = [];
    const pushItem = (
      name: string | null | undefined,
      category: string,
      contactId?: string | null,
      subType?: string | null,
    ) => {
      const clean = (name || "").trim();
      if (!clean || !CATEGORIES.includes(category)) return;
      knownItems.push({
        name: clean,
        category,
        ...(contactId && initialsById.get(contactId) ? { ownerInitials: initialsById.get(contactId) } : {}),
        ...(subType ? { subType: String(subType) } : {}),
      });
    };

    (vineyard || []).forEach((v: any) =>
      pushItem(`${v.institution || "Account"}${v.account_type ? ` — ${v.account_type}` : ""}`, "02_Financial", v.contact_id, v.account_type),
    );
    (tank || []).forEach((t: any) =>
      pushItem(`${t.institution || "Account"}${t.account_type ? ` — ${t.account_type}` : ""}`, "02_Financial", t.contact_id, t.account_type),
    );
    (storehouses || []).forEach((s: any) => {
      const isRealEstate = /real estate|residence|property/i.test(
        `${s.asset_type || ""} ${s.storehouse_type || ""}`,
      );
      pushItem(s.label || s.storehouse_type, isRealEstate ? "04_Asset_Specific" : "02_Financial", s.contact_id, s.storehouse_type);
    });
    (insurance || []).forEach((p: any) =>
      pushItem(`${p.carrier || "Policy"}${p.policy_type ? ` — ${p.policy_type}` : ""}`, "06_Insurance", p.contact_id, p.policy_type),
    );

    const corporateEntities = (corps || []).map((c: any) => ({
      name: c.name,
      structure: STRUCTURES[String(c.corporation_type || "other").toLowerCase()] || "OTHER",
      ...(c.jurisdiction ? { taxId: undefined } : {}),
      shareholders: (shareholders || [])
        .filter((s: any) => s.corporation_id === c.id)
        .map((s: any) => ({
          crmMemberId: s.contact_id,
          ...(s.ownership_percentage != null ? { ownershipPercent: Number(s.ownership_percentage) } : {}),
        })),
    }));

    const callbackUrl = `${Deno.env.get("SUPABASE_URL")}/functions/v1/crm-intake-callback`;

    const payload = {
      crmFamilyId: household.family_id,
      familyName: family?.name || "Unassigned Family",
      crmHouseholdId: household.id,
      householdName: household.label || "Household",
      members,
      ...(knownItems.length ? { knownItems } : {}),
      ...(corporateEntities.length ? { corporateEntities } : {}),
      callbackUrl,
    };

    const rawBody = JSON.stringify(payload);
    const signature = await hmacHex(secret, rawBody);

    const { data: logRow } = await admin
      .from("crm_intake_pushes")
      .insert({
        household_id: household.id,
        family_id: household.family_id,
        status: "sent",
        request_payload: payload,
        pushed_by: userData.user.id,
      })
      .select("id")
      .single();

    const target = agentUrl.replace(/\/+$/, "") + "/api/public/crm/intake";
    console.log(`[crm-intake-push] POST ${target} (household ${household.id})`);

    const fail = async (message: string, status: number, extra: Record<string, unknown> = {}) => {
      console.error(`[crm-intake-push] ${message}`);
      if (logRow?.id) {
        const { error: upErr } = await admin
          .from("crm_intake_pushes")
          .update({ status: "failed", error: message, ...extra })
          .eq("id", logRow.id);
        if (upErr) console.error("[crm-intake-push] log update failed", upErr.message);
      }
      return json({ error: message }, status);
    };

    let res: Response;
    try {
      res = await fetch(target, {
        method: "POST",
        headers: {
          "Content-Type": "application/json",
          "X-CRM-Signature": `sha256=${signature}`,
        },
        body: rawBody,
        redirect: "manual",
        signal: AbortSignal.timeout(25_000),
      });
    } catch (fetchErr) {
      const reason = fetchErr instanceof Error ? fetchErr.name : "";
      const message =
        reason === "TimeoutError" || reason === "AbortError"
          ? `Intake agent did not respond within 25s (${target})`
          : `Could not reach intake agent at ${target}: ${
            fetchErr instanceof Error ? fetchErr.message : String(fetchErr)
          }`;
      return await fail(message, 504);
    }

    // A redirect means we hit a website (e.g. a Lovable preview auth bridge), not the API.
    if (res.status >= 300 && res.status < 400) {
      const loc = res.headers.get("location") || "(no location)";
      return await fail(
        `Intake agent URL redirected (${res.status} -> ${loc}). CRM_INTAKE_AGENT_URL must point at the agent's deployed API host, not a preview/site URL.`,
        502,
      );
    }

    const contentType = res.headers.get("content-type") || "";
    const text = await res.text();
    console.log(`[crm-intake-push] agent responded ${res.status} (${contentType || "no content-type"})`);

    let parsed: unknown = text.slice(0, 2000);
    let isJson = false;
    try {
      parsed = JSON.parse(text);
      isJson = true;
    } catch { /* keep truncated raw text */ }

    if (!res.ok) {
      return await fail(`HTTP ${res.status} from intake agent`, res.status, {
        response_body: { raw: parsed },
      });
    }

    if (!isJson) {
      return await fail(
        `Intake agent returned ${contentType || "non-JSON"} instead of a JSON acknowledgement — the configured URL is serving a web page, not the intake API.`,
        502,
        { response_body: { raw: parsed } },
      );
    }

    if (logRow?.id) {
      const { error: upErr } = await admin
        .from("crm_intake_pushes")
        .update({ status: "accepted", response_body: { raw: parsed } })
        .eq("id", logRow.id);
      if (upErr) console.error("[crm-intake-push] log update failed", upErr.message);
    }

    return json({ success: true, itemsSent: knownItems.length, members: members.length, response: parsed });
  } catch (e) {
    console.error("crm-intake-push error", e);
    return json({ error: e instanceof Error ? e.message : "Unexpected error" }, 500);
  }
});
