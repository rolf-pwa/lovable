import { serve } from "https://deno.land/std@0.168.0/http/server.ts";
import { createClient } from "https://esm.sh/@supabase/supabase-js@2";
import { pushHouseholdToIntakeAgent } from "../_shared/intake-push.ts";

const corsHeaders = {
  "Access-Control-Allow-Origin": "*",
  "Access-Control-Allow-Headers": "authorization, x-client-info, apikey, content-type",
};

serve(async (req) => {
  if (req.method === "OPTIONS") return new Response("ok", { headers: corsHeaders });

  const json = (body: unknown, status = 200) =>
    new Response(JSON.stringify(body), {
      status,
      headers: { ...corsHeaders, "Content-Type": "application/json" },
    });

  try {
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

    // Staff pushes are always honoured (this is also the retry path), so we do
    // not short-circuit on a previous push here.
    const result = await pushHouseholdToIntakeAgent(admin, householdId, userData.user.id);
    if (!result.ok) return json({ error: result.error }, result.status);

    return json({
      success: true,
      itemsSent: result.itemsSent,
      members: result.members,
      response: result.response,
    });
  } catch (e) {
    console.error("crm-intake-push error", e);
    return json({ error: e instanceof Error ? e.message : "Unexpected error" }, 500);
  }
});
