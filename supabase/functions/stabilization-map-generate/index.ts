import { serve } from "https://deno.land/std@0.168.0/http/server.ts";
import { createClient } from "https://esm.sh/@supabase/supabase-js@2";

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
      "authorization, x-client-info, apikey, content-type, x-supabase-client-platform, x-supabase-client-platform-version, x-supabase-client-runtime, x-supabase-client-runtime-version",
  };
}

// ---------- Vertex AI ----------
const REGION = "northamerica-northeast1";
const MODEL = "gemini-2.5-flash";

interface ServiceAccountKey {
  type: string;
  project_id: string;
  private_key: string;
  client_email: string;
  token_uri: string;
}

async function getAccessToken(sa: ServiceAccountKey): Promise<string> {
  const now = Math.floor(Date.now() / 1000);
  const header = { alg: "RS256", typ: "JWT" };
  const payload = {
    iss: sa.client_email,
    scope: "https://www.googleapis.com/auth/cloud-platform",
    aud: sa.token_uri,
    iat: now,
    exp: now + 3600,
  };
  const enc = (obj: unknown) =>
    btoa(JSON.stringify(obj)).replace(/\+/g, "-").replace(/\//g, "_").replace(/=+$/, "");
  const unsigned = `${enc(header)}.${enc(payload)}`;
  const pemBody = sa.private_key
    .replace(/-----BEGIN PRIVATE KEY-----/, "")
    .replace(/-----END PRIVATE KEY-----/, "")
    .replace(/\s/g, "");
  const binaryKey = Uint8Array.from(atob(pemBody), (c) => c.charCodeAt(0));
  const cryptoKey = await crypto.subtle.importKey(
    "pkcs8",
    binaryKey,
    { name: "RSASSA-PKCS1-v1_5", hash: "SHA-256" },
    false,
    ["sign"],
  );
  const signatureBuffer = await crypto.subtle.sign(
    "RSASSA-PKCS1-v1_5",
    cryptoKey,
    new TextEncoder().encode(unsigned),
  );
  const signature = btoa(String.fromCharCode(...new Uint8Array(signatureBuffer)))
    .replace(/\+/g, "-")
    .replace(/\//g, "_")
    .replace(/=+$/, "");
  const jwt = `${unsigned}.${signature}`;
  const res = await fetch(sa.token_uri, {
    method: "POST",
    headers: { "Content-Type": "application/x-www-form-urlencoded" },
    body: new URLSearchParams({
      grant_type: "urn:ietf:params:oauth:grant-type:jwt-bearer",
      assertion: jwt,
    }),
  });
  const data = await res.json();
  if (data.error) throw new Error(`Token exchange failed: ${data.error_description || data.error}`);
  return data.access_token;
}

// ---------- Extraction Prompt ----------

const EXTRACTION_PROMPT = `You are an expert ProsperWise stabilization analyst. You are drafting a one-page **Stabilization Map** that Rolf Issler will review with the client in their first live Stabilization Session.

You will receive:
1. The raw intake data captured by Georgia (the AI Transition Assistant) — transition type, anxiety anchor, vision, vineyard summary, and full discovery notes.
2. The client's first name.

Your job: fill every field of the Stabilization Map with concrete, client-specific content derived STRICTLY from the intake.

## Rules
- **Never fabricate** numbers, dates, firm names, or facts not present in the intake. If unknown, say so ("amount unspecified", "tax advisor not yet engaged", etc.).
- **Write in the Sanctuary voice** — calm, direct, non-alarmist, professional. No jargon. No exclamations.
- **Each risk and next step MUST be a single line, max ~60 characters**, following the template style ("Short noun phrase — concrete consequence or action").
- **Always fill all 5 risks and all 5 next steps**. If the intake is sparse, extrapolate the most likely SWS-stage risks for the event type.
- **Status fields** MUST use the exact enum values:
  - storehouse_status: "Not Established" | "Partial" | "Established"
  - solicitation_status: "Not Established" | "Partial" | "Established"
  - sovereignty_charter_status: "Not Started" | "In Progress" | "Complete"
  - tax_status: "Not Assessed" | "In Progress" | "Assessed"
- **event_type** must be one of: "Business Exit" | "Inheritance" | "Sudden Windfall" | "Taxable Event".
- **situation_summary**: 1–2 sentences summarising the triggering event in the style: "You completed/received [event] on [date if known]. [Current state of the capital or situation]."
- **urgency_flag**: 1 sentence describing what is currently absent or exposed — governance gaps, active solicitation pressure, missing Quiet Period, etc.
- **Detail fields** (storehouse_detail, solicitation_detail, sovereignty_charter_detail, tax_detail): one short sentence each, describing the current state and why.
- **logic_trace**: 2–4 sentences explaining, for Rolf's eyes only, why you chose the risks, next steps, and status levels from the intake.

## Output
Call the \`populate_stabilization_map\` function with all fields filled.`;

const TOOL_SCHEMA = {
  functionDeclarations: [
    {
      name: "populate_stabilization_map",
      description: "Populate every field of the Stabilization Map from the Georgia intake.",
      parameters: {
        type: "OBJECT",
        properties: {
          event_type: {
            type: "STRING",
            description: "One of: Business Exit, Inheritance, Sudden Windfall, Taxable Event",
          },
          situation_summary: { type: "STRING" },
          urgency_flag: { type: "STRING" },
          risk_1: { type: "STRING" },
          risk_2: { type: "STRING" },
          risk_3: { type: "STRING" },
          risk_4: { type: "STRING" },
          risk_5: { type: "STRING" },
          next_step_1: { type: "STRING" },
          next_step_2: { type: "STRING" },
          next_step_3: { type: "STRING" },
          next_step_4: { type: "STRING" },
          next_step_5: { type: "STRING" },
          storehouse_status: { type: "STRING" },
          storehouse_detail: { type: "STRING" },
          solicitation_status: { type: "STRING" },
          solicitation_detail: { type: "STRING" },
          sovereignty_charter_status: { type: "STRING" },
          sovereignty_charter_detail: { type: "STRING" },
          tax_status: { type: "STRING" },
          tax_detail: { type: "STRING" },
          logic_trace: { type: "STRING" },
        },
        required: [
          "event_type",
          "situation_summary",
          "urgency_flag",
          "risk_1",
          "risk_2",
          "risk_3",
          "risk_4",
          "risk_5",
          "next_step_1",
          "next_step_2",
          "next_step_3",
          "next_step_4",
          "next_step_5",
          "storehouse_status",
          "storehouse_detail",
          "solicitation_status",
          "solicitation_detail",
          "sovereignty_charter_status",
          "sovereignty_charter_detail",
          "tax_status",
          "tax_detail",
          "logic_trace",
        ],
      },
    },
  ],
};

// ---------- Main ----------

serve(async (req) => {
  const corsHeaders = getCorsHeaders(req);
  if (req.method === "OPTIONS") {
    return new Response(null, { headers: corsHeaders });
  }

  try {
    // Auth: require either service-role bearer (internal calls) or @prosperwise.ca staff JWT.
    const authHeader = req.headers.get("Authorization") || "";
    const token = authHeader.replace(/^Bearer\s+/i, "").trim();
    const serviceKey = Deno.env.get("SUPABASE_SERVICE_ROLE_KEY")!;
    if (!token) {
      return new Response(JSON.stringify({ error: "Unauthorized" }), {
        status: 401, headers: { ...corsHeaders, "Content-Type": "application/json" },
      });
    }
    if (token !== serviceKey) {
      const supabaseUserClient = createClient(
        Deno.env.get("SUPABASE_URL")!,
        Deno.env.get("SUPABASE_ANON_KEY")!,
        { global: { headers: { Authorization: `Bearer ${token}` } } }
      );
      const { data: userData, error: userErr } = await supabaseUserClient.auth.getUser();
      const email = userData?.user?.email?.toLowerCase() || "";
      if (userErr || !userData?.user || !email.endsWith("@prosperwise.ca")) {
        return new Response(JSON.stringify({ error: "Forbidden" }), {
          status: 403, headers: { ...corsHeaders, "Content-Type": "application/json" },
        });
      }
    }

    const body = await req.json();
    const { leadId, mapId, contactId } = body as { leadId?: string; mapId?: string; contactId?: string };

    if (!leadId && !mapId && !contactId) {
      return new Response(
        JSON.stringify({ error: "leadId, contactId, or mapId is required" }),
        { status: 400, headers: { ...corsHeaders, "Content-Type": "application/json" } },
      );
    }

    const supabase = createClient(
      Deno.env.get("SUPABASE_URL")!,
      serviceKey,
    );

    // Resolve the lead (from either leadId, mapId, or contactId)
    let resolvedLeadId = leadId;
    let existingMapId = mapId;

    if (mapId && !resolvedLeadId) {
      const { data: existing } = await supabase
        .from("stabilization_maps")
        .select("lead_id")
        .eq("id", mapId)
        .maybeSingle();
      resolvedLeadId = existing?.lead_id || undefined;
    }

    // If only contactId provided, find existing map (or seed one from the contact directly)
    if (!resolvedLeadId && !existingMapId && contactId) {
      const { data: existingForContact } = await supabase
        .from("stabilization_maps")
        .select("id, lead_id")
        .eq("contact_id", contactId)
        .order("created_at", { ascending: false })
        .limit(1)
        .maybeSingle();

      if (existingForContact?.id) {
        existingMapId = existingForContact.id;
        resolvedLeadId = existingForContact.lead_id || undefined;
      }

      // No map yet? Bootstrap from contact data without requiring a lead
      if (!existingMapId) {
        const { data: contact } = await supabase
          .from("contacts")
          .select("first_name, last_name")
          .eq("id", contactId)
          .single();
        if (!contact) {
          return new Response(
            JSON.stringify({ error: "Contact not found" }),
            { status: 404, headers: { ...corsHeaders, "Content-Type": "application/json" } },
          );
        }
        const { data: inserted, error: insErr } = await supabase
          .from("stabilization_maps")
          .insert({
            contact_id: contactId,
            client_first_name: contact.first_name || "",
            client_last_name: contact.last_name || "",
            session_date: new Date().toISOString().slice(0, 10),
            generation_status: "ready",
            situation_summary: "Manually authored — no lead intake on file. Edit fields directly.",
          })
          .select("id")
          .single();
        if (insErr || !inserted) throw new Error("Failed to seed map for contact");
        return new Response(
          JSON.stringify({ success: true, mapId: inserted.id, seeded: true }),
          { headers: { ...corsHeaders, "Content-Type": "application/json" } },
        );
      }
    }

    if (!resolvedLeadId) {
      return new Response(
        JSON.stringify({ error: "Lead not found for this map" }),
        { status: 404, headers: { ...corsHeaders, "Content-Type": "application/json" } },
      );
    }

    const { data: lead, error: leadError } = await supabase
      .from("discovery_leads")
      .select("*")
      .eq("id", resolvedLeadId)
      .single();

    if (leadError || !lead) {
      return new Response(
        JSON.stringify({ error: "Lead not found" }),
        { status: 404, headers: { ...corsHeaders, "Content-Type": "application/json" } },
      );
    }

    // Parse first/last name
    const rawName = (lead.first_name || "").trim();
    const nameParts = rawName.split(/\s+/);
    const clientFirstName = nameParts[0] || rawName;
    const clientLastName = nameParts.slice(1).join(" ") || "";

    // Upsert the map row as pending (so the UI can reflect state)
    if (!existingMapId) {
      // Check if one already exists for this lead
      const { data: existingForLead } = await supabase
        .from("stabilization_maps")
        .select("id")
        .eq("lead_id", resolvedLeadId)
        .order("created_at", { ascending: false })
        .limit(1)
        .maybeSingle();
      existingMapId = existingForLead?.id;
    }

    if (!existingMapId) {
      const { data: inserted, error: insErr } = await supabase
        .from("stabilization_maps")
        .insert({
          lead_id: resolvedLeadId,
          client_first_name: clientFirstName,
          client_last_name: clientLastName,
          session_date: new Date().toISOString().slice(0, 10),
          generation_status: "generating",
        })
        .select("id")
        .single();
      if (insErr || !inserted) throw new Error("Failed to create map record");
      existingMapId = inserted.id;
    } else {
      await supabase
        .from("stabilization_maps")
        .update({
          client_first_name: clientFirstName,
          client_last_name: clientLastName,
          generation_status: "generating",
          generation_error: null,
        })
        .eq("id", existingMapId);
    }

    // Build extraction user message
    const intake = [
      `Client first name: ${clientFirstName}`,
      `Transition type: ${lead.transition_type || "(not specified)"}`,
      `Anxiety anchor: ${lead.anxiety_anchor || "(not specified)"}`,
      `Vision summary: ${lead.vision_summary || "(not specified)"}`,
      `Vineyard summary: ${lead.vineyard_summary || "(not specified)"}`,
      `Discovery notes: ${lead.discovery_notes || "(not specified)"}`,
    ].join("\n");

    // Call Vertex AI
    const gcpKeyRaw = Deno.env.get("GCP_SERVICE_ACCOUNT_KEY");
    if (!gcpKeyRaw) throw new Error("GCP_SERVICE_ACCOUNT_KEY not configured");
    const sa: ServiceAccountKey = JSON.parse(gcpKeyRaw);
    const accessToken = await getAccessToken(sa);

    const vertexUrl =
      `https://${REGION}-aiplatform.googleapis.com/v1/projects/${sa.project_id}/locations/${REGION}/publishers/google/models/${MODEL}:generateContent`;

    console.log(`[stabilization-map-generate] Calling Vertex AI for lead ${resolvedLeadId}`);

    const aiRes = await fetch(vertexUrl, {
      method: "POST",
      headers: { "Content-Type": "application/json", Authorization: `Bearer ${accessToken}` },
      body: JSON.stringify({
        contents: [
          { role: "user", parts: [{ text: EXTRACTION_PROMPT }] },
          { role: "model", parts: [{ text: "Understood. Provide the intake and I will populate the map." }] },
          { role: "user", parts: [{ text: intake }] },
        ],
        tools: [TOOL_SCHEMA],
        toolConfig: {
          functionCallingConfig: { mode: "ANY", allowedFunctionNames: ["populate_stabilization_map"] },
        },
        generationConfig: { temperature: 0.3, maxOutputTokens: 2048 },
      }),
    });

    if (!aiRes.ok) {
      const errText = await aiRes.text();
      console.error(`[stabilization-map-generate] Vertex error ${aiRes.status}:`, errText);
      await supabase
        .from("stabilization_maps")
        .update({ generation_status: "failed", generation_error: `Vertex AI ${aiRes.status}` })
        .eq("id", existingMapId!);
      return new Response(
        JSON.stringify({ error: "AI generation failed", mapId: existingMapId }),
        { status: 502, headers: { ...corsHeaders, "Content-Type": "application/json" } },
      );
    }

    const result = await aiRes.json();
    const parts = result.candidates?.[0]?.content?.parts || [];
    const fnCall = parts.find((p: any) => p.functionCall)?.functionCall;

    if (!fnCall || !fnCall.args) {
      console.error("[stabilization-map-generate] No function call returned", JSON.stringify(result).slice(0, 500));
      await supabase
        .from("stabilization_maps")
        .update({ generation_status: "failed", generation_error: "AI did not return structured data" })
        .eq("id", existingMapId!);
      return new Response(
        JSON.stringify({ error: "AI did not return structured data", mapId: existingMapId }),
        { status: 502, headers: { ...corsHeaders, "Content-Type": "application/json" } },
      );
    }

    const args = fnCall.args;

    // Enum guards
    const normEnum = (val: string, allowed: string[], fallback: string) =>
      allowed.includes(val) ? val : fallback;

    const update = {
      event_type: normEnum(
        args.event_type,
        ["Business Exit", "Inheritance", "Sudden Windfall", "Taxable Event"],
        "Business Exit",
      ),
      situation_summary: String(args.situation_summary || "").slice(0, 1200),
      urgency_flag: String(args.urgency_flag || "").slice(0, 1200),
      risk_1: String(args.risk_1 || "").slice(0, 200),
      risk_2: String(args.risk_2 || "").slice(0, 200),
      risk_3: String(args.risk_3 || "").slice(0, 200),
      risk_4: String(args.risk_4 || "").slice(0, 200),
      risk_5: String(args.risk_5 || "").slice(0, 200),
      next_step_1: String(args.next_step_1 || "").slice(0, 200),
      next_step_2: String(args.next_step_2 || "").slice(0, 200),
      next_step_3: String(args.next_step_3 || "").slice(0, 200),
      next_step_4: String(args.next_step_4 || "").slice(0, 200),
      next_step_5: String(args.next_step_5 || "").slice(0, 200),
      storehouse_status: normEnum(
        args.storehouse_status,
        ["Not Established", "Partial", "Established"],
        "Not Established",
      ),
      storehouse_detail: String(args.storehouse_detail || "").slice(0, 500),
      solicitation_status: normEnum(
        args.solicitation_status,
        ["Not Established", "Partial", "Established"],
        "Not Established",
      ),
      solicitation_detail: String(args.solicitation_detail || "").slice(0, 500),
      sovereignty_charter_status: normEnum(
        args.sovereignty_charter_status,
        ["Not Started", "In Progress", "Complete"],
        "Not Started",
      ),
      sovereignty_charter_detail: String(args.sovereignty_charter_detail || "").slice(0, 500),
      tax_status: normEnum(
        args.tax_status,
        ["Not Assessed", "In Progress", "Assessed"],
        "Not Assessed",
      ),
      tax_detail: String(args.tax_detail || "").slice(0, 500),
      logic_trace: String(args.logic_trace || "").slice(0, 4000),
      generation_status: "ready",
      generation_error: null,
    };

    const { error: updErr } = await supabase
      .from("stabilization_maps")
      .update(update)
      .eq("id", existingMapId!);

    if (updErr) {
      console.error("[stabilization-map-generate] Update error:", updErr);
      throw updErr;
    }

    return new Response(
      JSON.stringify({ success: true, mapId: existingMapId }),
      { headers: { ...corsHeaders, "Content-Type": "application/json" } },
    );
  } catch (e) {
    console.error("stabilization-map-generate error:", e);
    return new Response(
      JSON.stringify({ error: e instanceof Error ? e.message : "Unknown error" }),
      { status: 500, headers: { ...corsHeaders, "Content-Type": "application/json" } },
    );
  }
});
