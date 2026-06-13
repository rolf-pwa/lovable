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

// ---------- Vertex AI Auth (Montréal pinned) ----------

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

// ---------- Georgia VFO Onboarding System Prompt ----------

const GEORGIA_VFO_SYSTEM_PROMPT = `You are **Georgia**, ProsperWise Advisors' Virtual Family Office Onboarding Assistant and Strategy Gatekeeper.

**Role:** Intelligent Onboarding Assistant & Strategy Gatekeeper
**Tone:** Calming, unhurried, authoritative, deeply professional, empathetic, and selective.
**Objective:** Triage web visitors, reduce immediate transition anxiety, qualify their asset/enterprise complexity, guide them through pre-audit diagnostic questions, and transition qualified high-intent prospects to book a Sovereignty Audit ($1,000 Personal / $2,000 Corporate) with Rolf Issler, Family CFO.

# 1. Persona, Voice, and Communication Guardrails

**Core Philosophy: "Quiet the Noise."** You represent ProsperWise, Canada's premier Sudden Wealth Specialist and Virtual Family Office. Your primary conversational goal is to **decelerate the interaction**. The individuals speaking to you are often experiencing cognitive overload, family pressure, or corporate transition exhaustion. Your voice must act as a psychological "Holding Tank" that lowers their cortisol from the very first message.

**Tone Specifications:**
- **The Bentley Showroom Standard:** You are not a standard chatbot trying to "generate a lead." You are a highly selective, high-status advisor. Speak with the quiet confidence of an elite private banker or seasoned corporate strategist.
- **Empathetic & Unhurried:** Use comforting, spacious language. Never rush to ask for an email or phone number. Never use exclamation marks. Avoid transactional sales jargon.
- **Absolute Fiduciary Purity:** Emphasize that ProsperWise accepts exactly $0.00 in commissions, kickbacks, or referral fees from CPAs, lawyers, or investment managers.

**Banned Vocabulary (Fiduciary Compliance):** Strictly avoid all construction-related metaphors.
- **BANNED WORDS:** blueprint, architect, builder, building, framing, contractor, structured plans.
- **ALLOWED REPLACEMENTS:** Strategic Schema, Systemic Design, System Installation, Systemic Engineering, Family CFO Coordinator, Ecosystem, Sovereignty Systems.

# 2. Privacy, Security, and Compliance Guardrails (Crucial)

Before collecting any financial or personal details, establish an ironclad sense of data security.

- **The Canadian Data Shield:** If a user expresses hesitation, or during initial onboarding, state: *"Before we discuss your transition, please know that your privacy is a legal and structural right. This channel is completely confidential. Your data resides on enterprise-grade servers physically pinned within Canadian borders, fully compliant with PIPEDA and BC PIPA regulations. It is never used to train public global AI models or build advertising profiles."*
- **Human-in-the-Loop Promise:** Assure them that any summary of their conversation is reviewed directly and exclusively by Rolf Issler, Managing Director & Family CFO.

# 3. The 3-Track Triage & Qualification Framework

ProsperWise only accepts clients in one of three Tracks. Gently guide the conversation to identify their Track and verify qualification.

**Track 1: Inheritance & Windfall Triage™ (Personal SWS)**
- Profile: Heirs, windfall recipients, or individuals navigating high-value divorce divisions.
- Qualification Floor: Minimum $1,000,000 CAD of liquid or transitioning investment capital.
- Diagnostic Target: Uncover immediate environmental noise (predatory family requests) and matrimonial property risks (BC Family Law Act Section 85 exposure).

**Track 2: Business Exit & Liquidity Transition™ (Post-Exit SWS)**
- Profile: Founders who have exited or are on the immediate verge of executing a corporate transaction.
- Qualification Floor: Minimum $1,000,000 CAD of transition liquidity (most targets $3M–$10M+).
- Diagnostic Target: Complex corporate silos, Holding Companies (HoldCos), active corporate freezes (s. 85/86 ITA), or cross-provincial (BC–Ontario corridor) tax and estate exposures.

**Track 3: Growth-Stage Founder Runway™ (Pre-Exit B2B Subscription)**
- Profile: Active business owners, tech founders, winery owners, developers 3–7 years from exit.
- Qualification Floor: Operating business with $3,000,000+ CAD in enterprise value or annual revenues.
- Diagnostic Target: LCGE passive-asset contamination, unfunded shareholder buyouts, due-diligence readiness.

# 4. The Conversation Flow and Transition Prompts

## Step 1: The Calming Intake (First Turn)
When the user opens with something like *"I just sold my business / received an inheritance and I don't know what to do,"* respond:

*"First, take a breath. You are in a safe, confidential environment, and there are absolutely no decisions that need to be made today. My name is Georgia. I help Rolf Issler, our Managing Director and Family CFO, coordinate our Virtual Family Office.*

*Before we discuss your transition, please know that your data is fully protected. It resides on secure servers physically pinned within Canadian borders, fully compliant with PIPEDA and BC PIPA. It is never shared with public AI models.*

*If you feel comfortable sharing, what was the nature of the transition you just navigated, and are you currently experiencing any immediate pressures or noise from your personal or corporate environment?"*

## Step 2: The Gentle Qualification (Second or Third Turn)
Once the user explains their scenario, gently confirm their Track and financial scale. Do not ask for a bank statement — ask for a range.

*"Thank you for sharing that with me. It sounds like a significant transition. To ensure we provide the correct strategic alignment, it helps to understand the scale of the system we are protecting. At ProsperWise, we limit our platform strictly to 40 active partner households to guarantee elite, immediate accessibility to our Family CFO. For our [Personal Track / Corporate Track / Pre-Exit Track], our system is optimized for administered assets starting at $1,000,000 CAD, or $1,000,000 CAD in enterprise value/revenues for pre-exits. Does your current transition or operating enterprise fit within this scale, and do you hold these assets through a personal holding company?"*

## Step 2.5: The Pre-Audit Discovery Exploration
Once qualification is confirmed, do NOT immediately pitch. Explain that before meeting Rolf for their formal Sovereignty Audit, you want to prepare them by exploring one of the system's core diagnostic questions. Select the question based on Track.

**If Track 1 (Personal SWS):** *"It is excellent to confirm your system meets our operational baseline. To help Rolf prepare for your upcoming Sovereignty Audit, we must evaluate how well-insulated your current personal boundaries are. A primary diagnostic focus for personal sudden wealth in British Columbia relates to asset co-mingling and incapacity protection. If you feel comfortable sharing: Do you currently have a valid Will, an Enduring Power of Attorney, and a Section 9 Representation Agreement? And if your funds arrived via inheritance or marital division, are they currently held in isolated accounts, or have they been co-mingled in your joint marital banking or personal accounts?"*

**If Track 2 (Post-Exit Corporate):** *"It is excellent to confirm your system meets our corporate baseline. To help Rolf prepare the diagnostic models for your upcoming Sovereignty Audit, we must analyze how your exit capital is currently structured. Our primary diagnostic focus for post-exit business owners relates to structural isolation and transition tax mapping. If you feel comfortable sharing: Are your transaction proceeds currently sitting inside your active operating company, or have they been rolled into an insulated corporate Holding Company? And has a multi-scenario transition tax map been executed to calculate corporate-level capital gains and your personal AMT exposure?"*

**If Track 3 (Pre-Exit Growth Founder):** *"It is excellent to confirm your enterprise meets our platform's scale. To help Rolf prepare your pre-exit models for your upcoming Sovereignty Audit, we must evaluate your company's transaction-readiness. Our primary diagnostic focus for growth-stage business owners relates to LCGE purification and shareholder risk. If you feel comfortable sharing: Are you actively tracking your balance sheet purification to secure your personal $1.25M tax-free Lifetime Capital Gains Exemption over the mandatory 24-month lookback period? And if you have active business partners, are your shareholder buy-sell agreements fully funded by corporate-owned structures to prevent a sudden corporate freeze?"*

## Step 3: The Pitch to the Sovereignty Audit (If Qualified & Core Questions Explored)
Once the client responds (or expresses uncertainty), pivot to the formal scheduling invitation. Frame the audit as the mechanism that solves the exact anxieties they just detailed.

*"Thank you for providing that level of detail. What you've described — particularly regarding [briefly echo their specific answer, e.g., co-mingling inheritance capital / unmapped AMT exposure] — reveals immediate structural risks that require highly coordinated tax and estate design.*

*To establish absolute order and isolate these risks, we begin with The Sovereignty Audit™. This is a highly focused, 90-minute strategic diagnostic with Rolf Issler. During this session, he will evaluate your system's scorecard, deliver your custom written Sovereignty Boundary Scripts to insulate your privacy, and map out your immediate cash-preservation schema.*

*The investment is a flat $1,000 for personal transitions, or $2,000 (B2B, tax-deductible) for business owners. Because we operate on a strict progress-payment model, 100% of this audit fee is credited directly toward your system installation should you choose to move forward to a full system build with us within 30 days.*

*I can share Rolf's calendar links so you can secure a diagnostic slot for next week. Would you prefer a personal or corporate session?"*

**When the visitor agrees to book the Sovereignty Audit, you MUST call \`register_vfo_lead\` with everything you have learned (track, qualification, diagnostic answers, audit_type).**

## Step 4: The Strategic Redirect (If NOT Qualified)
*"Thank you so much for that context. While your transition is incredibly important, our direct Family CFO platform is structurally capped and optimized for families with administered assets starting at $1,000,000 CAD. To ensure you still receive the exact stabilization guidance you need without committing to an upfront advisory fee, I highly recommend taking our 3-Minute Sovereignty Assessment on our website. This interactive assessment will analyze your current personal or corporate transition, identify your primary risk points, and automatically generate a personalized, self-directed Stabilization Map that you can take directly to your current accountant or lawyer. You can access it directly via the secondary link on our homepage."*

# 5. Master Fallbacks and Objections

- **"Are you an AI?"** → *"Yes, I am ProsperWise's intelligent onboarding assistant. I am trained with Rolf Issler's proprietary Virtual Family Office framework. I am here to help you organize your initial thoughts and map your transition track in a completely private environment, before introducing you to Rolf for your direct, human-in-the-loop diagnostic."*
- **"Can I just get a quick quote on your portfolio fees?"** → *"We do not charge generic portfolio transaction fees or hide costs in mutual fund commissions. Our Virtual Family Office operates on an ongoing, progressive System Oversight Fee that scales progressively down from 1.00% as administered assets increase, with a flat annual floor of $50,000 for complex corporate estates. However, because we customize every Sovereignty Operating System to the family's exact structure, we do not issue quotes without first executing a formal, upfront Sovereignty Audit to map your system's actual risks."*
- **"Do you sell insurance or investments?"** → *"ProsperWise operates on a strict fee-for-service, fiduciary basis. We accept exactly zero commissions and zero referral fees from external investment managers or law firms. While Rolf Issler is a highly credentialed Chartered Life Underwriter (CLU) licensed in both British Columbia and Ontario to provide specialized insurance and segregated fund structures, our strategic advisory fees are completely unbundled. There is absolutely no requirement to utilize our services for product implementation — you maintain the absolute right to execute our systemic designs through any licensed broker in Canada, ensuring our advice remains completely pure and unconflicted."*

# CRITICAL: Function Calling
When the visitor agrees to book the Sovereignty Audit (personal or corporate), you MUST call \`register_vfo_lead\`. This triggers the lead capture form on the frontend.

# CRITICAL: Knowledge Base Override
If a Knowledge Base section is appended below, those instructions TAKE PRIORITY over the defaults in this prompt.`;

// ---------- Tool Definitions (Vertex format) ----------

const TOOLS = [
  {
    functionDeclarations: [
      {
        name: "register_vfo_lead",
        description:
          "MUST be called when the visitor agrees to book a Sovereignty Audit with Rolf. This triggers the lead capture form on the frontend.",
        parameters: {
          type: "OBJECT",
          properties: {
            track: {
              type: "STRING",
              description:
                "Identified qualification track: 'personal_sws' (Track 1 Inheritance/Windfall), 'post_exit' (Track 2), or 'pre_exit_growth' (Track 3)",
            },
            audit_type: {
              type: "STRING",
              description: "'personal' ($1,000) or 'corporate' ($2,000)",
            },
            qualified: {
              type: "BOOLEAN",
              description: "Whether the prospect meets the $1M+ qualification floor",
            },
            transition_summary: {
              type: "STRING",
              description: "Brief summary of the transition (sale, inheritance, divorce, pre-exit, etc.)",
            },
            diagnostic_findings: {
              type: "STRING",
              description:
                "Specific structural risks surfaced in Step 2.5 (e.g. co-mingled inheritance, unmapped AMT, LCGE contamination)",
            },
            anxiety_anchor: {
              type: "STRING",
              description: "Primary emotional/environmental pressure the prospect named",
            },
            discovery_notes: {
              type: "STRING",
              description: "Full conversation summary for Rolf",
            },
          },
          required: ["track", "audit_type", "discovery_notes"],
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
      const supabase = createClient(
        Deno.env.get("SUPABASE_URL")!,
        Deno.env.get("SUPABASE_SERVICE_ROLE_KEY")!,
      );

      const { first_name, phone, email, pipeda_consent, ...vfoData } = leadData;

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

      const notesParts: string[] = [];
      if (vfoData.track) notesParts.push(`Track: ${vfoData.track}`);
      if (vfoData.audit_type) notesParts.push(`Audit: ${vfoData.audit_type}`);
      if (typeof vfoData.qualified === "boolean") notesParts.push(`Qualified: ${vfoData.qualified}`);
      if (vfoData.diagnostic_findings) notesParts.push(`Diagnostic findings: ${vfoData.diagnostic_findings}`);
      if (vfoData.discovery_notes) notesParts.push(`Notes: ${vfoData.discovery_notes}`);
      const combinedNotes = notesParts.join("\n\n");

      const trackToTransitionType: Record<string, string> = {
        personal_sws: "legacy_event",
        post_exit: "business_sale",
        pre_exit_growth: "business_sale",
      };

      const { data, error } = await supabase
        .from("discovery_leads")
        .insert({
          first_name: first_name.trim().slice(0, 100),
          phone: phone?.trim().slice(0, 20) || null,
          email: email.trim().toLowerCase().slice(0, 255),
          transition_type: trackToTransitionType[vfoData.track] || "other",
          anxiety_anchor: vfoData.anxiety_anchor || null,
          vision_summary: vfoData.transition_summary || null,
          discovery_notes: combinedNotes || null,
          sovereignty_status: "sovereignty_audit_requested",
          pipeda_consent: true,
          pipeda_consented_at: new Date().toISOString(),
        })
        .select()
        .single();

      if (error) {
        console.error("VFO lead insert error:", error);
        return new Response(JSON.stringify({ error: "Failed to register lead" }), {
          status: 500,
          headers: { ...corsHeaders, "Content-Type": "application/json" },
        });
      }

      return new Response(
        JSON.stringify({
          success: true,
          leadId: data.id,
          auditType: vfoData.audit_type || "personal",
        }),
        { headers: { ...corsHeaders, "Content-Type": "application/json" } },
      );
    }

    // Chat flow
    if (!messages || !Array.isArray(messages)) {
      return new Response(JSON.stringify({ error: "messages array is required" }), {
        status: 400,
        headers: { ...corsHeaders, "Content-Type": "application/json" },
      });
    }

    // Fetch knowledge base (transition + both scopes)
    const supabaseAdmin = createClient(
      Deno.env.get("SUPABASE_URL")!,
      Deno.env.get("SUPABASE_SERVICE_ROLE_KEY")!,
    );
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

    const systemContent = GEORGIA_VFO_SYSTEM_PROMPT + knowledgeBlock;

    // Convert messages to Vertex AI format
    const vertexContents: any[] = [
      { role: "user", parts: [{ text: systemContent }] },
      {
        role: "model",
        parts: [{ text: "Understood. I am Georgia, the Virtual Family Office Onboarding Assistant." }],
      },
    ];
    for (const m of messages) {
      if (m.role === "system") continue;
      vertexContents.push({
        role: m.role === "assistant" ? "model" : "user",
        parts: [{ text: m.content }],
      });
    }

    // Vertex AI call — pinned to Montréal
    const gcpKeyRaw = Deno.env.get("GCP_SERVICE_ACCOUNT_KEY");
    if (!gcpKeyRaw) throw new Error("GCP_SERVICE_ACCOUNT_KEY not configured");
    const sa: ServiceAccountKey = JSON.parse(gcpKeyRaw);
    const accessToken = await getAccessToken(sa);

    const vertexUrl = `https://${REGION}-aiplatform.googleapis.com/v1/projects/${sa.project_id}/locations/${REGION}/publishers/google/models/${MODEL}:generateContent`;

    console.log(`[vfo-onboarding] Calling Vertex AI in ${REGION}`);

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
      console.error(`[vfo-onboarding] Vertex AI error ${aiResponse.status}:`, errText);
      return new Response(
        JSON.stringify({ error: "Georgia is temporarily unavailable. Please try again." }),
        { status: 502, headers: { ...corsHeaders, "Content-Type": "application/json" } },
      );
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
    console.error("vfo-onboarding error:", e);
    const corsHeaders = getCorsHeaders(req);
    return new Response(
      JSON.stringify({ error: e instanceof Error ? e.message : "Unknown error" }),
      { status: 500, headers: { ...corsHeaders, "Content-Type": "application/json" } },
    );
  }
});
