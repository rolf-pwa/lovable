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

// ---------- Vertex AI Auth ----------

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
  const enc = (obj: unknown) => btoa(JSON.stringify(obj)).replace(/\+/g, "-").replace(/\//g, "_").replace(/=+$/, "");
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
  const signatureBuffer = await crypto.subtle.sign("RSASSA-PKCS1-v1_5", cryptoKey, new TextEncoder().encode(unsigned));
  const signature = btoa(String.fromCharCode(...new Uint8Array(signatureBuffer)))
    .replace(/\+/g, "-")
    .replace(/\//g, "_")
    .replace(/=+$/, "");
  const jwt = `${unsigned}.${signature}`;
  const res = await fetch(sa.token_uri, {
    method: "POST",
    headers: { "Content-Type": "application/x-www-form-urlencoded" },
    body: new URLSearchParams({ grant_type: "urn:ietf:params:oauth:grant-type:jwt-bearer", assertion: jwt }),
  });
  const data = await res.json();
  if (data.error) throw new Error(`Token exchange failed: ${data.error_description || data.error}`);
  return data.access_token;
}

// ---------- Georgia System Prompt ----------

const GUIDE_URL = "https://7366e113-7ee0-46e7-801d-1f0d0f13fc18.usrfiles.com/ugd/7366e1_844e26acbc3742";

const GEORGIA_SYSTEM_PROMPT = `You are **Georgia**, ProsperWise's AI Transition Assistant.

## STEP 0 — ROUTING (ALWAYS FIRST)

Determine whether the conversation is about a **personal wealth transition** or a **business wealth transition**.

- **Personal** (inheritance, divorce, windfall, sudden liquidity, retirement) → Route to **Track A (SWS / trauma-informed)**
- **Business** (sale, exit, succession, liquidity event, founder capital) → Route to **Track B (Concierge)**

The automatic greeting already asks personal vs business. Do not re-ask. Read the first reply and route immediately. Only clarify once if genuinely ambiguous.

**Minimum qualification:** $1M CAD in investable / transitioning assets. Below $1M, trigger the **Academy Referral Protocol** (not the Sovereignty Clarity Call).

Confirm scale gently before going deep, once the situation is named:
"To make sure I point you toward the right next step — are we roughly in the seven-figure range or above? Our work is designed for transitions of about $1M and up."

---

## Track A — PERSONAL Wealth Transition

**Tone:** Warm, reflective, trauma-informed. Move at the visitor's pace, never yours. No jargon. One question at a time. Reflect before you probe. Validate before you question. Never present lists or options. Never mention fees, products, or the engagement details.

**Strict multi-phase flow (14 turns maximum). Follow IN ORDER.**

### Phase 1 — Opening (Turns 1–3)
- No money questions first.
- Reflect what the visitor said. Normalise it (reference Sudden Wealth Syndrome if appropriate).
- Establish rapport and context. First question is about *them*, not the money:
  "Before we talk about anything practical — how are you doing right now? Not financially. Just... how are you doing?"

### Phase 2 — Exploration (Turns 4–8)
Explore the **4 risk dimensions** most relevant to the visitor's event type. Follow the thread they open — do not run through all four mechanically.

1. **Decision Readiness** — "Have you been able to make any decisions about the money yet — or does even thinking about it feel stuck?"
2. **Noise Exposure** — "Have the people around you been a source of support, or has it added to the noise?"
3. **Structural Safety** — "Do you have a sense of where the money is sitting right now — is it somewhere safe while you figure things out?"
4. **Tax Exposure** — "Has anyone helped you think through the tax side of this yet, or has that been part of the uncertainty?"

**Event type focus:**
| Visitor Event | Focus Dimensions |
|---|---|
| Sudden wealth event | All 4 dimensions |
| Business sale / liquidity event | Structural Safety, Tax Exposure |
| Inheritance | Decision Readiness, Noise Exposure |
| Retirement / executive transition | Tax Exposure, Structural Safety |
| Divorce | Decision Readiness, Structural Safety |

### Phase 3 — Assessment (Turns 9–12)
- Score each dimension silently, **1–3**.
- Deliver the assessment without alarming language. Build insight, not fear.
- Structure:
  "Thank you for sharing all of that with me. It sounds like [mirror the primary emotion]. Underneath that, there seem to be some real [name the 1–2 most acute risks]. None of this is unusual, and there is a very clear path through it. The timing of the first step does matter."

"The timing does matter" is the ONLY urgency signal. Use once, here, never repeat.

### Phase 4 — Handoff (Turns 13–14)
- Call \`register_discovery_lead\` **before** delivering the handoff message.
- Deliver the following **verbatim closing message**, adapted only for the visitor's event type:

> "Based on what you've shared, there are [1–2 specific risk dimensions identified] that are worth addressing properly — and soon. The best next step is a **Sovereignty Clarity Call** with Rolf Issler — it's 15 minutes, no cost, and no obligation. You'll leave knowing exactly whether a Sovereignty Audit makes sense for your situation.
>
> Rolf works with families navigating exactly what you're going through. [Insert calendar booking link here.]
>
> Would you like me to send you the link now?"

- Do **not** describe Sovereignty Audit pricing in Phase 4.
- Do **not** use the word "sales" or imply a purchase decision is required.
- The **Sovereignty Clarity Call** is the ONLY next step offered in Phase 4. Do not offer the Sovereignty Audit directly.

---

## Track B — BUSINESS Wealth Transition

**Tone:** Concierge persona. Polished, discreet, direct, business-focused. **No therapy language.** No "take a breath" / "safe space." 2–4 sentences per reply. One question at a time.

**Phase flow (6 turns maximum):**

### Phase 1 — Context (Turns 1–2)
- Establish the nature of the business event (sale, exit, succession, liquidity event).
- One clarifying question per turn maximum.

### Phase 2 — Risk Mapping (Turns 3–4)
- Focus on **Structural Safety** and **Tax Exposure** only.
- Identify the most pressing structural or tax vulnerability.

### Phase 3 — Handoff (Turns 5–6)
- Call \`register_discovery_lead\` **before** delivering the handoff message.
- Deliver the following **verbatim closing message**:

> "There are some meaningful planning considerations here that are worth a direct conversation. The right next step is a **Sovereignty Clarity Call** with Rolf Issler — 15 minutes, no cost, structured specifically around business transitions.
>
> https://calendar.google.com/calendar/u/0/appointments/schedules/AcZssZ1sjX9SS8Z7UEvF2Kmj2KpfIXIo_5QVxd-vm26u2H8PZYHHZWP9sGJf8y9cQm3KIuo6unxpp3hO
>
> Want me to send you that link?"

---

## Critical Rules

| Rule | Detail |
|------|--------|
| Never skip phases | All phases must be completed in order |
| Never mention Rolf until final Phase | Maintain assistant persona until handoff |
| \`register_discovery_lead\` required | Must be called before any handoff or guide request |
| One next step only | The Sovereignty Clarity Call is the **only** conversion action offered at handoff — never offer the Sovereignty Audit directly |
| Response length | All responses under **150 words** unless asked for elaboration |
| No pricing in conversation | Never state Sovereignty Audit or VFO pricing in the conversation |

---

## Academy Referral Protocol

**Trigger:** Below $1M CAD investable assets (either track).

**Action:** Deliver verbatim referral message, then call \`register_discovery_lead\` with:
- \`transition_type = "academy"\`
- \`requested_guide = true\`

**Verbatim message:**
> "It sounds like you're in an important early stage of this transition. The ProsperWise Academy has a free guide that's specifically written for where you are right now — I'd be glad to point you there. Would that be helpful?"

Wait for affirmative reply before calling the function. Do NOT paste the Academy URL in the chat — the interface reveals it after the form is completed.

---

## Privacy Response Protocol

When asked about data privacy or platform security, state confidently:
> "This conversation runs on a private, proprietary platform with Canadian data servers located in Montréal."

---

## Crisis Protocol
If a visitor expresses acute distress or crisis, gently redirect: "What you're sharing sounds really heavy. Is there someone with you right now, or someone you can call?"

---

## CRITICAL: Function Calling
When you reach handoff (Track A Phase 4, Track B Phase 3) or the Academy Referral affirmative, you MUST call \`register_discovery_lead\` **before** the verbatim closing message. This triggers the lead capture form on the frontend. Do NOT skip the function call.

## CRITICAL: Knowledge Base Override
**If the Knowledge Base section below contains strategy instructions, those instructions TAKE PRIORITY over the defaults in this prompt.**`;

// ---------- Tool Definitions (Vertex format) ----------

const TOOLS = [
  {
    functionDeclarations: [
      {
        name: "register_discovery_lead",
          description: "MUST be called ONLY when the visitor has explicitly agreed to book a Sovereignty Audit with Rolf OR has explicitly asked to receive the complimentary guide. For corporate/business visitors, vague interest or questions about the audit do NOT count — only clear affirmative booking language triggers this. This triggers the lead capture form.",
        parameters: {
          type: "OBJECT",
          properties: {
            transition_type: {
              type: "STRING",
              description: "Type of transition: business_sale, divorce, legacy_event, academy (for visitors below the $1M threshold being referred to the ProsperWise Academy), or other",
            },
            anxiety_anchor: { type: "STRING", description: "The prospect's primary friction point or anxiety" },
            vision_summary: { type: "STRING", description: "Their 3-year sovereignty vision summary" },
            vineyard_summary: { type: "STRING", description: "Summary of vineyard audit findings" },
            discovery_notes: { type: "STRING", description: "Full conversation summary" },
            requested_guide: {
              type: "BOOLEAN",
              description: "True only when the visitor asked to receive the complimentary guide instead of booking a session",
            },
          },
          required: ["transition_type", "discovery_notes"],
        },
      },
    ],
  },
];

// ---------- Main ----------

serve(async (req) => {
  const corsHeaders = getCorsHeaders(req);
  if (req.method === "OPTIONS") {
    return new Response(null, { headers: corsHeaders });
  }

  try {
    const { messages, action, leadData } = await req.json();

    // Handle lead registration action
    if (action === "register_lead") {
      const supabase = createClient(Deno.env.get("SUPABASE_URL")!, Deno.env.get("SUPABASE_SERVICE_ROLE_KEY")!);

      const { first_name, phone, email, pipeda_consent, ...discoveryData } = leadData;

      if (!first_name || !email) {
        return new Response(JSON.stringify({ error: "First name and email are required" }), {
          status: 400,
          headers: { ...corsHeaders, "Content-Type": "application/json" },
        });
      }
      if (!pipeda_consent) {
        return new Response(JSON.stringify({ error: "PIPEDA consent is required" }), {
          status: 400,
          headers: { ...corsHeaders, "Content-Type": "application/json" },
        });
      }

      const emailRegex = /^[^\s@]+@[^\s@]+\.[^\s@]+$/;
      if (!emailRegex.test(email)) {
        return new Response(JSON.stringify({ error: "Invalid email address" }), {
          status: 400,
          headers: { ...corsHeaders, "Content-Type": "application/json" },
        });
      }

      const { data, error } = await supabase
        .from("discovery_leads")
        .insert({
          first_name: first_name.trim().slice(0, 100),
          phone: phone?.trim().slice(0, 20) || null,
          email: email.trim().toLowerCase().slice(0, 255),
          transition_type: discoveryData.transition_type || null,
          anxiety_anchor: discoveryData.anxiety_anchor || null,
          vision_summary: discoveryData.vision_summary || null,
          vineyard_summary: discoveryData.vineyard_summary || null,
          discovery_notes: discoveryData.discovery_notes || null,
          sovereignty_status: "transition_session_requested",
          pipeda_consent: true,
          pipeda_consented_at: new Date().toISOString(),
        })
        .select()
        .single();

      if (error) {
        console.error("Lead insert error:", error);
        return new Response(JSON.stringify({ error: "Failed to register lead" }), {
          status: 500,
          headers: { ...corsHeaders, "Content-Type": "application/json" },
        });
      }

      // Fire-and-forget: auto-draft Stabilization Map
      try {
        const fnUrl = `${Deno.env.get("SUPABASE_URL")}/functions/v1/stabilization-map-generate`;
        fetch(fnUrl, {
          method: "POST",
          headers: {
            "Content-Type": "application/json",
            Authorization: `Bearer ${Deno.env.get("SUPABASE_SERVICE_ROLE_KEY")}`,
          },
          body: JSON.stringify({ leadId: data.id }),
        }).catch((e) => console.error("Auto-draft map trigger failed:", e));
      } catch (e) {
        console.error("Map trigger setup error:", e);
      }

      const normalizedNotes = `${discoveryData.discovery_notes || ""}`.toLowerCase();
      const isAcademyReferral = `${discoveryData.transition_type || ""}`.toLowerCase() === "academy"
        || normalizedNotes.includes("academy");
      const requestedGuide = Boolean(
        discoveryData.requested_guide === true ||
        discoveryData.requested_guide === "true" ||
        isAcademyReferral ||
        normalizedNotes.includes("first 90 days") ||
        normalizedNotes.includes("guide") ||
        normalizedNotes.includes("quiet period")
      );

      const ACADEMY_URL = "https://www.prosperwise.ca/academy";
      const guideUrl = requestedGuide
        ? (isAcademyReferral ? ACADEMY_URL : GUIDE_URL)
        : null;

      return new Response(JSON.stringify({
        success: true,
        leadId: data.id,
        requestedGuide,
        guideUrl,
        academyReferral: isAcademyReferral,
        academyUrl: isAcademyReferral ? ACADEMY_URL : null,
      }), {
        headers: { ...corsHeaders, "Content-Type": "application/json" },
      });
    }

    // Chat flow
    if (!messages || !Array.isArray(messages)) {
      return new Response(JSON.stringify({ error: "messages array is required" }), {
        status: 400,
        headers: { ...corsHeaders, "Content-Type": "application/json" },
      });
    }

    // Fetch knowledge base
    const supabaseAdmin = createClient(Deno.env.get("SUPABASE_URL")!, Deno.env.get("SUPABASE_SERVICE_ROLE_KEY")!);
    const { data: kbEntries } = await supabaseAdmin
      .from("knowledge_base")
      .select("title, content, category, target")
      .eq("is_active", true)
      .in("target", ["transition", "both"])
      .order("category");

    let knowledgeBlock = "";
    if (kbEntries && kbEntries.length > 0) {
      knowledgeBlock =
        "\n\n## Knowledge Base\n" +
        kbEntries.map((e: any) => `### ${e.title} [${e.category}]\n${e.content}`).join("\n\n");
    }

    const systemContent = GEORGIA_SYSTEM_PROMPT + knowledgeBlock;

    // Convert messages to Vertex AI format
    const vertexContents: any[] = [
      { role: "user", parts: [{ text: systemContent }] },
      { role: "model", parts: [{ text: "Understood. I am Georgia, the Transition Assistant." }] },
    ];
    for (const m of messages) {
      if (m.role === "system") continue;
      vertexContents.push({
        role: m.role === "assistant" ? "model" : "user",
        parts: [{ text: m.content }],
      });
    }

    // Vertex AI call — pinned to Montreal
    const gcpKeyRaw = Deno.env.get("GCP_SERVICE_ACCOUNT_KEY");
    if (!gcpKeyRaw) throw new Error("GCP_SERVICE_ACCOUNT_KEY not configured");
    const sa: ServiceAccountKey = JSON.parse(gcpKeyRaw);
    const accessToken = await getAccessToken(sa);

    const vertexUrl = `https://${REGION}-aiplatform.googleapis.com/v1/projects/${sa.project_id}/locations/${REGION}/publishers/google/models/${MODEL}:generateContent`;

    console.log(`[discovery-assistant] Calling Vertex AI in ${REGION}`);

    const aiResponse = await fetch(vertexUrl, {
      method: "POST",
      headers: {
        "Content-Type": "application/json",
        Authorization: `Bearer ${accessToken}`,
      },
      body: JSON.stringify({
        contents: vertexContents,
        tools: TOOLS,
        generationConfig: { temperature: 0.6, maxOutputTokens: 2048 },
      }),
    });

    if (!aiResponse.ok) {
      const errText = await aiResponse.text();
      console.error(`[discovery-assistant] Vertex AI error ${aiResponse.status}:`, errText);
      const isRateLimit = aiResponse.status === 429 || errText.toLowerCase().includes("resource_exhausted") || errText.toLowerCase().includes("quota");
      if (isRateLimit) {
        return new Response(JSON.stringify({ fallback: true, text: "Georgia is briefly at capacity right now. Please wait a moment and try again — she's here when you're ready." }), {
          status: 200,
          headers: { ...corsHeaders, "Content-Type": "application/json" },
        });
      }
      return new Response(JSON.stringify({ error: "Georgia is temporarily unavailable. Please try again." }), {
        status: 502,
        headers: { ...corsHeaders, "Content-Type": "application/json" },
      });
    }

    const result = await aiResponse.json();
    const candidate = result.candidates?.[0];
    const parts = candidate?.content?.parts || [];

    let text = "";
    const functionCalls: Array<{ name: string; args: any }> = [];

    for (const part of parts) {
      if (part.text) text += part.text;
      if (part.functionCall) {
        functionCalls.push({ name: part.functionCall.name, args: part.functionCall.args || {} });
      }
    }

    return new Response(JSON.stringify({ text, functionCalls }), {
      headers: { ...corsHeaders, "Content-Type": "application/json" },
    });
  } catch (e) {
    console.error("discovery-assistant error:", e);
    const corsHeaders = getCorsHeaders(req);
    return new Response(JSON.stringify({ error: e instanceof Error ? e.message : "Unknown error" }), {
      status: 500,
      headers: { ...corsHeaders, "Content-Type": "application/json" },
    });
  }
});
