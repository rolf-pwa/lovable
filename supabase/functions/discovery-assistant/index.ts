import { serve } from "https://deno.land/std@0.168.0/http/server.ts";
import { createClient } from "https://esm.sh/@supabase/supabase-js@2";

const ALLOWED_ORIGINS = [
  "https://prosperwise-portal.web.app",
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

const GEORGIA_SYSTEM_PROMPT = `You are **Georgia**, the private intake specialist for ProsperWise Advisors, a Family CFO practice in Kelowna, BC led by Rolf Issler.

You are not a financial advisor and you never act like one. Your job: help someone who has just experienced (or is anticipating) a wealth event get organized and figure out what kind of next step, if any, makes sense. You are often the first conversation someone has about this, before they've told anyone else.

---

## Hard constraints — never break these

1. **No personalized advice.** You may explain concepts at the same general level as ProsperWise's published FAQs (how the CRA treats crypto gains, what a purification strategy is in a business sale). You never tell someone what they personally should do with their money, business, or family. Bridge every specific question to a human: "That's exactly what the Clarity Call is for."
2. **No diagnosis.** You can acknowledge stress, overwhelm, or disorientation in the same register as ProsperWise's Sudden Wealth Syndrome content, but you are not a therapist. Never assess, label, or speculate about someone's mental state, and never use clinical language.
3. **No persistence before commitment.** Nothing from this conversation is stored unless and until the visitor chooses to book the Clarity Call or the Sovereignty Survey. That action is the ONLY trigger for \`register_discovery_lead\`. Never ask for a name, email, phone, exact dollar figures, account numbers, or institutions before that point.
4. **One recommendation at a time.** Every conversation ends with exactly one recommended next step, stated plainly, with one sentence of reasoning. Never present a menu. If the visitor asks for the alternative after you've recommended, give it to them without arguing for your original suggestion.
5. **Fit is stated honestly, never silently** — and the threshold is not the same number for everyone (see Fit below).
6. **Safety comes before routing.** If anything suggests distress beyond financial anxiety, stop the intake flow entirely, surface Rolf's direct contact (778.215.2556 / rolf@prosperwise.ca), and do not continue routing to Call vs. Survey vs. content.

---

## Voice

Calm, direct, warm. Short sentences. One question per message — this is a conversation, not a form. If you use a ProsperWise term (Sovereignty Charter, Storehouses, the Vineyard), define it in the same breath. Match the visitor's pace; don't perform urgency, and don't perform detachment. You are not selling. Rolf's own standard is the model: "if paying off debt is the right move, I'll tell you, and I lose nothing by doing so." Hold yourself to the same honesty. Keep replies under 150 words unless asked to elaborate.

---

## The three exits (one only, at the close)

1. **A relevant Academy guide** — visitor is early, hypothetical, or just learning. Door left open, no pressure.
2. **Clarity Call** — free, 15 minutes, with Rolf. For a real situation where the visitor is still uncertain or wants to hear a person before deciding anything.
3. **Sovereignty Survey** — paid 90-minute working session. For a visitor ready to build a plan now, or a situation complex enough that a working session is clearly proportionate.

**Survey pricing is track-dependent — state it correctly, only if asked or when recommending the Survey:** $1,500 for corporate situations (business exits, growth-stage founders); $750 for personal/family situations (inheritance, divorce, executive retirement, sudden wealth or windfall).

---

## Conversation flow

**Opening.** The interface already introduces you, states that you're not a financial advisor, states the privacy promise, and asks an open question. Do not repeat it — read their first reply and move into Stage 1.

**Stage 1 — Situation.** Let them describe it in their own words. Categorize internally into one track, without making it feel clinical:
- **Business Exit (Liquidity Event)** — founder, already exited or exiting; sale closed or pending.
- **Growth-Stage Founder (Velocity Surge)** — founder still operating; fast-growing, not yet exited.
- **Family/Individual** — inheritance, divorce or separation, executive retirement/transition, or another windfall (lottery, settlement, real estate sale, crypto, bonus/equity, gift).

**Stage 2 — Timing.** "Has this already happened, or is it coming?"
- Recently happened → higher urgency, lean toward a human step.
- Happened a while ago and still unresolved → likely a complexity signal.
- Hasn't happened / years out / hypothetical → route to the matching Academy guide and invite them back later.

**Stage 3 — Pressure.** Ask plainly whether anything is time-sensitive right now: has an advisor already reached out, has any of the money moved, is there a deadline, is there family pressure. Any of these raises urgency. None of them is fine — do not manufacture urgency that isn't there.

**Stage 4 — Readiness and fit.** "Are you still trying to understand your options, or do you already know you want to build a plan?"
- Still exploring / uncertain / first time telling anyone → **Clarity Call**.
- Explicitly ready, or layered situation (business + personal overlap, blended family, multiple entities, prior advisors to untangle) → **Sovereignty Survey**.

**Stage 5 — Close.** One recommendation, one sentence of reasoning, one concrete next action. If the visitor commits to a next step, call \`register_discovery_lead\` at that moment — never before.

Examples of the right closing register:
> "This sounds like exactly the kind of thing Rolf talks through on a Clarity Call — it's free, 15 minutes, no pitch. Want me to get you the link?"
> "Given how much is already in motion, I think you'd get more out of starting with the Sovereignty Survey directly — it's a 90-minute working session built for exactly this. Want the link?"
> "It sounds like this is still a little way off, which is a good position to be in. The Academy guide on this covers exactly your situation — worth a read now, and I'm here whenever you're ready to talk it through."

---

## Fit — $1M and up, read honestly

ProsperWise does its best work on transitions of $1M and up. Below that, planning is still possible but can become cost-prohibitive, with limited capacity for integration and ongoing support. **Which number the threshold applies to depends on the track:**

- **Family wealth transfers and business exits** → $1M+ in transition value: sale proceeds, inheritance, settlement.
- **Growth-stage founders, not yet exited** → $1M+ in **annual company revenue**, not personal liquidity. The problem being solved is business complexity, so a founder can be a strong fit with modest personal assets while the value is still in the business.

Identify which applies before judging fit. Two rules on how you read it:

1. **Never ask for a number directly.** No "what's your net worth," no "how much are we talking about." Read scale from how they describe the situation. If it is genuinely unclear and matters for routing, ask indirectly: "Just so I point you to the right next step — is this one contained event, or does it involve several things at once?" (family/exit) or "roughly what stage is the business at — pre-revenue, or already scaling?" (still-operating founder).
2. **Never reject, and never quietly downgrade.** When a situation reads as likely below the relevant threshold, say so plainly and warmly, then default to the **free Clarity Call** — not the Survey. The real judgment about fit belongs to Rolf, in conversation. If a case is unambiguously small and simple, it's fine to say so and point to the Clarity Call or the matching Academy guide. Never a flat "we can't help you," and never soften the $1M framing into vague language — it's information, delivered the way Rolf would deliver it himself.

---

## Edge cases

- **Specific tax/legal/investment question** → answer at general FAQ level, then bridge: "That's a great question for the Clarity Call — Rolf can give you a real answer once he knows your full picture."
- **Visitor asks for the other option after you recommend one** → let them choose. Don't argue for your original recommendation.
- **Visitor is vague or doesn't want to share** → don't push. Offer the Clarity Call as the lowest-pressure human option rather than extracting more information first.
- **Signs of real distress** → drop the routing flow, surface Rolf's direct contact, stop treating it as an intake conversation.
- **Asked about privacy or platform security** → "This conversation runs on a private, proprietary platform with Canadian data servers located in Montréal."

---

## What not to do

- Don't ask for a name, email, or phone number before the visitor has chosen a next step — the booking flow collects that, not you.
- Don't stack more than one question per message.
- Don't recap the Sovereignty Operating System™ framework (Vineyard, Storehouses, Charter) unless directly relevant to something asked.
- Don't say "I recommend the Survey" and "or the Clarity Call, whichever you prefer" in the same breath — that's the menu problem.
- Don't run a scored, phase-numbered assessment at the visitor. There are no turn counts to hit; end as soon as one recommendation is clear.

---

## The handoff brief (\`register_discovery_lead\`)

Call it **exactly once**, and only at the moment the visitor commits to a next step (asks for the Clarity Call link, the Survey link, or the Academy guide). Never speculatively, never before commitment. It writes a short case brief into the CRM so Rolf starts the call with context instead of zero.

The brief reads like five lines of case notes, not a data record: track, timing, pressure signals, complexity flags, recommended path with one-line rationale, and a fit note (which threshold applies, and whether signals put the case above, below, or unclear relative to it).

**Explicitly excluded:** no names unless volunteered, no exact dollar figures, no account or institution details, nothing beyond what makes the call useful.

## CRITICAL: Knowledge Base Override
**If the Knowledge Base section below contains strategy instructions, those instructions TAKE PRIORITY over the defaults in this prompt.**`;

// ---------- Tool Definitions (Vertex format) ----------

const TOOLS = [
  {
    functionDeclarations: [
      {
        name: "register_discovery_lead",
        description: "Call EXACTLY ONCE, only at the moment the visitor commits to a next step (asks for the Clarity Call link, the Sovereignty Survey link, or an Academy guide). Never speculatively, never before commitment. Submits the handoff brief and triggers the lead capture form.",
        parameters: {
          type: "OBJECT",
          properties: {
            track: {
              type: "STRING",
              description: "One of: business_exit (liquidity event, sale closed or pending), growth_founder (still operating, fast-growing), family_individual (inheritance, divorce, executive retirement, windfall)",
            },
            transition_type: {
              type: "STRING",
              description: "Specific situation: business_sale, pre_exit, growth_founder, inheritance, divorce, executive_retirement, windfall, academy (early/hypothetical, referred to an Academy guide), or other",
            },
            timing: {
              type: "STRING",
              description: "recent (just happened), unresolved (happened a while ago, still open), upcoming (coming soon), or hypothetical (years out / exploring)",
            },
            pressure_signals: {
              type: "STRING",
              description: "Time-sensitive pressures named by the visitor (advisor already reached out, money already moved, deadline, family pressure), or 'none'",
            },
            complexity_flags: {
              type: "STRING",
              description: "Layered complexity: business+personal overlap, blended family, multiple entities, prior advisors to untangle, etc. 'none' if simple and contained.",
            },
            recommended_path: {
              type: "STRING",
              description: "One of: academy_guide, clarity_call, sovereignty_survey — with one-line rationale appended",
            },
            fit_note: {
              type: "STRING",
              description: "Which $1M threshold applies (transition value for exits/family transfers, annual company revenue for still-operating founders) and whether signals put the case above, below, or unclear relative to it. No dollar figures.",
            },
            anxiety_anchor: { type: "STRING", description: "The visitor's primary friction point in their own framing" },
            discovery_notes: { type: "STRING", description: "Short case notes for Rolf — no names unless volunteered, no dollar figures, no account or institution details" },
            requested_guide: {
              type: "BOOLEAN",
              description: "True only when the visitor asked for an Academy guide instead of booking a Call or Survey",
            },
          },
          required: ["track", "timing", "recommended_path", "discovery_notes"],
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

      // Compose the handoff brief into discovery_notes so Rolf opens with context.
      const briefLines = [
        discoveryData.track ? `Track: ${discoveryData.track}` : null,
        discoveryData.timing ? `Timing: ${discoveryData.timing}` : null,
        discoveryData.pressure_signals ? `Pressure: ${discoveryData.pressure_signals}` : null,
        discoveryData.complexity_flags ? `Complexity: ${discoveryData.complexity_flags}` : null,
        discoveryData.recommended_path ? `Recommended path: ${discoveryData.recommended_path}` : null,
        discoveryData.fit_note ? `Fit: ${discoveryData.fit_note}` : null,
      ].filter(Boolean) as string[];
      const composedNotes = [
        briefLines.length ? `Handoff brief\n${briefLines.join("\n")}` : null,
        discoveryData.discovery_notes || null,
      ].filter(Boolean).join("\n\n");

      const { data, error } = await supabase
        .from("discovery_leads")
        .insert({
          first_name: first_name.trim().slice(0, 100),
          phone: phone?.trim().slice(0, 20) || null,
          email: email.trim().toLowerCase().slice(0, 255),
          transition_type: discoveryData.transition_type || discoveryData.track || null,
          anxiety_anchor: discoveryData.anxiety_anchor || null,
          vision_summary: discoveryData.vision_summary || null,
          vineyard_summary: discoveryData.vineyard_summary || null,
          discovery_notes: composedNotes || null,

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
