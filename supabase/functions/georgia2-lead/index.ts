import { serve } from "https://deno.land/std@0.168.0/http/server.ts";
import { createClient } from "https://esm.sh/@supabase/supabase-js@2";
import { z } from "https://esm.sh/zod@3.25.76";

function getCorsHeaders(req: Request) {
  const origin = req.headers.get("Origin") || "";
  const allowedSuffixes = [
    "prosperwise.ca",
    "prosperwise.lovable.app",
    ".lovable.app",
    ".lovableproject.com",
    "localhost",
  ];
  const allow =
    !origin ||
    allowedSuffixes.some((s) => origin.endsWith(s) || origin.includes(s))
      ? origin || "*"
      : "*";
  return {
    "Access-Control-Allow-Origin": allow,
    "Access-Control-Allow-Headers":
      "authorization, x-client-info, apikey, content-type",
    "Access-Control-Allow-Methods": "POST, OPTIONS",
    Vary: "Origin",
  };
}

const BodySchema = z.object({
  session_key: z.string().min(6).max(128),
  first_name: z.string().trim().min(1).max(80),
  email: z.string().trim().email().max(255),
  mobile: z.string().trim().max(40).nullable().optional(),
  domain: z.enum(["corporate", "personal"]),
  catalyst: z.string().min(1).max(64),
  chosen_pathway: z.enum([
    "vfo_stabilization",
    "vfo_catalyst_guide",
    "standalone_build",
    "academy_pass",
  ]),
  scale: z.number().min(0).max(1_000_000_000),
  answers: z.record(z.string(), z.any()).default({}),
});

serve(async (req) => {
  const corsHeaders = getCorsHeaders(req);
  if (req.method === "OPTIONS") return new Response("ok", { headers: corsHeaders });

  try {
    const raw = await req.json();
    const parsed = BodySchema.safeParse(raw);
    if (!parsed.success) {
      return new Response(
        JSON.stringify({ error: parsed.error.flatten().fieldErrors }),
        { status: 400, headers: { ...corsHeaders, "Content-Type": "application/json" } }
      );
    }

    const supabase = createClient(
      Deno.env.get("SUPABASE_URL")!,
      Deno.env.get("SUPABASE_SERVICE_ROLE_KEY")!
    );

    const data = parsed.data;

    // Insert the lead
    const { data: lead, error: insertErr } = await supabase
      .from("georgia2_leads")
      .insert({
        session_key: data.session_key,
        first_name: data.first_name,
        email: data.email,
        mobile: data.mobile || null,
        domain: data.domain,
        catalyst: data.catalyst,
        chosen_pathway: data.chosen_pathway,
        scale: data.scale,
        answers: data.answers,
      })
      .select("id")
      .single();
    if (insertErr) throw insertErr;

    // Mark session as captured
    await supabase
      .from("georgia2_sessions")
      .upsert(
        {
          session_key: data.session_key,
          lead_captured: true,
          reached_lead_capture: true,
          final_phase: "complete",
          chosen_pathway: data.chosen_pathway,
          domain: data.domain,
          catalyst: data.catalyst,
          scale: data.scale,
          answers: data.answers,
          last_activity_at: new Date().toISOString(),
          ended_at: new Date().toISOString(),
        },
        { onConflict: "session_key" }
      );

    // Best-effort staff notification via existing staff_notifications table
    try {
      await supabase.from("staff_notifications").insert({
        title: `Georgia 2.0 lead · ${data.first_name}`,
        body: `${data.domain} / ${data.catalyst} · $${data.scale.toLocaleString()} · ${data.chosen_pathway}`,
        kind: "georgia2_lead",
        link: "/leads",
        metadata: { lead_id: lead.id, email: data.email },
      });
    } catch (notifyErr) {
      console.warn("staff_notifications insert failed (non-fatal):", notifyErr);
    }

    return new Response(
      JSON.stringify({ success: true, lead_id: lead.id, chosen_pathway: data.chosen_pathway }),
      { status: 200, headers: { ...corsHeaders, "Content-Type": "application/json" } }
    );
  } catch (error) {
    console.error("georgia2-lead error", error);
    return new Response(
      JSON.stringify({ error: error instanceof Error ? error.message : "Unknown error" }),
      { status: 500, headers: { ...corsHeaders, "Content-Type": "application/json" } }
    );
  }
});
