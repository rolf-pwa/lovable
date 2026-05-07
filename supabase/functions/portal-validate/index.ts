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
    "Access-Control-Allow-Headers": "authorization, x-client-info, apikey, content-type",
  };
}

const GOOGLE_CLIENT_ID = Deno.env.get("GOOGLE_CLIENT_ID")!;
const GOOGLE_CLIENT_SECRET = Deno.env.get("GOOGLE_CLIENT_SECRET")!;

async function getValidGoogleToken(supabase: any, userId: string): Promise<string | null> {
  const { data, error } = await supabase
    .from("google_tokens")
    .select("*")
    .eq("user_id", userId)
    .maybeSingle();

  if (error || !data) return null;

  if (new Date(data.token_expiry) <= new Date()) {
    try {
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
      if (tokens.error) return null;

      const newExpiry = new Date(Date.now() + tokens.expires_in * 1000).toISOString();
      await supabase
        .from("google_tokens")
        .update({ access_token: tokens.access_token, token_expiry: newExpiry })
        .eq("user_id", userId);

      return tokens.access_token;
    } catch {
      return null;
    }
  }

  return data.access_token;
}

async function fetchCalendarEvents(accessToken: string, contactEmail: string): Promise<any[]> {
  try {
    const timeMin = new Date().toISOString();
    const timeMax = new Date(Date.now() + 30 * 86400000).toISOString();

    const calRes = await fetch(
      `https://www.googleapis.com/calendar/v3/calendars/primary/events?` +
      new URLSearchParams({
        timeMin,
        timeMax,
        maxResults: "20",
        singleEvents: "true",
        orderBy: "startTime",
        q: contactEmail,
      }),
      { headers: { Authorization: `Bearer ${accessToken}` } }
    );

    if (!calRes.ok) return [];

    const data = await calRes.json();
    return (data.items || []).filter((event: any) =>
      event.attendees?.some((a: any) =>
        a.email?.toLowerCase() === contactEmail.toLowerCase()
      ) ||
      event.organizer?.email?.toLowerCase() === contactEmail.toLowerCase() ||
      event.creator?.email?.toLowerCase() === contactEmail.toLowerCase()
    );
  } catch {
    return [];
  }
}

// Fetch vineyard + storehouse data for a list of contact IDs
async function fetchAssetsForContacts(supabase: any, contactIds: string[]) {
  if (contactIds.length === 0) return { vineyard: [], storehouses: [] };
  const [vRes, sRes] = await Promise.all([
    supabase.from("vineyard_accounts").select("*").in("contact_id", contactIds).order("created_at"),
    supabase.from("storehouses").select("*").in("contact_id", contactIds).order("storehouse_number"),
  ]);
  return { vineyard: vRes.data || [], storehouses: sRes.data || [] };
}

// Build hierarchy data based on family_role
async function buildHierarchy(supabase: any, contact: any) {
  const role = contact.family_role;
  const familyId = contact.family_id;
  const householdId = contact.household_id;

  if (role === "head_of_family" && familyId) {
    // Fetch all households, respecting hof_visible flag
    const { data: allHouseholds } = await supabase
      .from("households")
      .select("id, label, address, hof_visible")
      .eq("family_id", familyId)
      .order("label");

    // HoF can always see their own household; others only if hof_visible is true
    const households = (allHouseholds || []).filter((h: any) =>
      h.id === householdId || h.hof_visible === true
    );

    const householdIds = households.map((h: any) => h.id);

    // Fetch all contacts in these households
    const { data: allMembers } = await supabase
      .from("contacts")
      .select("id, first_name, last_name, family_role, is_minor, household_id, email")
      .in("household_id", householdIds.length > 0 ? householdIds : ["__none__"]);

    const memberIds = (allMembers || []).map((m: any) => m.id);
    const assets = await fetchAssetsForContacts(supabase, memberIds);

    // Group by household
    const householdsWithMembers = households.map((hh: any) => {
      const members = (allMembers || []).filter((m: any) => m.household_id === hh.id);
      return {
        id: hh.id,
        label: hh.label,
        address: hh.address,
        members: members.map((m: any) => ({
          ...m,
          vineyard_accounts: assets.vineyard.filter((v: any) => v.contact_id === m.id),
          storehouses: assets.storehouses.filter((s: any) => s.contact_id === m.id),
        })),
      };
    });

    return { level: "family", households: householdsWithMembers };
  }

  if ((role === "head_of_family" || role === "head_of_household" || role === "spouse" || role === "beneficiary") && householdId) {
    // Head of household, spouse, or beneficiary: see household members
    const { data: members } = await supabase
      .from("contacts")
      .select("id, first_name, last_name, family_role, is_minor, email")
      .eq("household_id", householdId)
      .neq("id", contact.id);

    const memberIds = (members || []).map((m: any) => m.id);
    const assets = await fetchAssetsForContacts(supabase, memberIds);

    return {
      level: role === "head_of_family" ? "family" : "household",
      members: (members || []).map((m: any) => ({
        ...m,
        vineyard_accounts: assets.vineyard.filter((v: any) => v.contact_id === m.id),
        storehouses: assets.storehouses.filter((s: any) => s.contact_id === m.id),
      })),
    };
  }

  return { level: "individual" };
}

// Fetch Quarterly Reviews pinned from the "Sovereignty Charter Sources" Drive folder.
// Returns rows with a 24h signed URL when stored in the private bucket; falls back to the Drive link.
async function fetchQuarterlyReviews(supabase: any, contactIds: string[]) {
  if (!contactIds || contactIds.length === 0) return [];
  const { data, error } = await supabase
    .from("sovereignty_charter_sources")
    .select("id, contact_id, title, file_name, source_url, storage_bucket, storage_path, external_modified_at, created_at")
    .in("contact_id", contactIds)
    .eq("source_kind", "quarterly_review")
    .order("external_modified_at", { ascending: false, nullsFirst: false })
    .order("created_at", { ascending: false });
  if (error || !data) return [];

  const enriched = await Promise.all(
    data.map(async (row: any) => {
      let signed_url: string | null = null;
      if (row.storage_bucket && row.storage_path) {
        const { data: signed } = await supabase.storage
          .from(row.storage_bucket)
          .createSignedUrl(row.storage_path, 60 * 60 * 24);
        signed_url = signed?.signedUrl || null;
      }
      return {
        id: row.id,
        contact_id: row.contact_id,
        title: row.title || row.file_name || "Quarterly Governance Review",
        file_name: row.file_name,
        signed_url,
        drive_url: row.source_url || null,
        review_date: row.external_modified_at || row.created_at,
      };
    }),
  );
  return enriched;
}

serve(async (req) => {
  const corsHeaders = getCorsHeaders(req);
if (req.method === "OPTIONS") return new Response(null, { headers: corsHeaders });

  try {
    const { token } = await req.json();
    if (!token) {
      return new Response(JSON.stringify({ error: "Token required" }), {
        status: 400,
        headers: { ...corsHeaders, "Content-Type": "application/json" },
      });
    }

    const supabase = createClient(
      Deno.env.get("SUPABASE_URL")!,
      Deno.env.get("SUPABASE_SERVICE_ROLE_KEY")!
    );

    // Validate token
    const { data: portalToken, error: tokenError } = await supabase
      .from("portal_tokens")
      .select("*")
      .eq("token", token)
      .eq("revoked", false)
      .maybeSingle();

    if (tokenError || !portalToken) {
      return new Response(JSON.stringify({ error: "Invalid or expired link" }), {
        status: 403,
        headers: { ...corsHeaders, "Content-Type": "application/json" },
      });
    }

    if (new Date(portalToken.expires_at) < new Date()) {
      return new Response(JSON.stringify({ error: "This link has expired" }), {
        status: 403,
        headers: { ...corsHeaders, "Content-Type": "application/json" },
      });
    }

    const contactId = portalToken.contact_id;
    const advisorUserId = portalToken.created_by;

    // Fetch all portal data in parallel
    const [contactRes, accountsRes, storehousesRes, auditRes, requestsRes, holdingTankRes, charterRes] = await Promise.all([
      supabase.from("contacts").select("*").eq("id", contactId).maybeSingle(),
      supabase.from("vineyard_accounts").select("*").eq("contact_id", contactId).order("created_at"),
      supabase.from("storehouses").select("*").eq("contact_id", contactId).order("storehouse_number"),
      supabase.from("sovereignty_audit_trail").select("*").eq("contact_id", contactId).order("created_at", { ascending: false }).limit(50),
      supabase.from("portal_requests").select("*, messages:portal_request_messages(*)").eq("contact_id", contactId).order("created_at", { ascending: false }),
      supabase.from("holding_tank").select("*").eq("contact_id", contactId).eq("status", "holding").order("created_at"),
      supabase.from("sovereignty_charters").select("id, title, draft_status, ratified_at, last_generated_at").eq("contact_id", contactId).maybeSingle(),
    ]);

    // Fetch family, household, and household members if available
    let family = null;
    let household = null;
    let householdMembers: any[] = [];

    const familyId = contactRes.data?.family_id;
    const householdId = contactRes.data?.household_id;

    if (familyId || householdId) {
      const extraQueries: any[] = [];
      
      if (familyId) {
        extraQueries.push(
          supabase.from("families").select("id, name, charter_document_url, fee_tier, total_family_assets").eq("id", familyId).maybeSingle()
        );
      } else {
        extraQueries.push(Promise.resolve({ data: null }));
      }

      if (householdId) {
        extraQueries.push(
          supabase.from("households").select("id, label, address").eq("id", householdId).maybeSingle()
        );
        extraQueries.push(
          supabase.from("contacts").select("id, first_name, last_name, family_role, is_minor").eq("household_id", householdId).neq("id", contactId)
        );
      } else {
        extraQueries.push(Promise.resolve({ data: null }));
        extraQueries.push(Promise.resolve({ data: [] }));
      }

      const [familyRes, householdRes, membersRes] = await Promise.all(extraQueries);
      family = familyRes.data;
      household = householdRes.data;
      householdMembers = membersRes.data || [];
    }

    // Build hierarchy data based on role
    const hierarchy = contactRes.data ? await buildHierarchy(supabase, contactRes.data) : { level: "individual" };

    // Fetch household-wide holding tank by contact membership (not household_id field which may be stale)
    let householdHoldingTank: any[] = [];
    if (householdId) {
      const hhMemberIds = [contactId, ...householdMembers.map((m: any) => m.id)];
      const { data: hhHolding } = await supabase
        .from("holding_tank")
        .select("*")
        .in("contact_id", hhMemberIds)
        .eq("status", "holding")
        .order("created_at");
      householdHoldingTank = hhHolding || [];
    }

    // Fetch corporations via shareholders for all household members + self
    let corporations: any[] = [];
    const allMemberIds = [contactId, ...householdMembers.map((m: any) => m.id)];
    const { data: shareholders } = await supabase
      .from("shareholders")
      .select("contact_id, corporation_id, ownership_percentage, share_class, role_title")
      .in("contact_id", allMemberIds)
      .eq("is_active", true);

    if (shareholders && shareholders.length > 0) {
      const corpIds = [...new Set(shareholders.map((s: any) => s.corporation_id))];
      const [corpsRes, corpVineyardRes] = await Promise.all([
        supabase.from("corporations").select("id, name, corporation_type, jurisdiction").in("id", corpIds),
        supabase.from("corporate_vineyard_accounts").select("*").in("corporation_id", corpIds),
      ]);

      corporations = (corpsRes.data || []).map((corp: any) => ({
        ...corp,
        shareholders: shareholders.filter((s: any) => s.corporation_id === corp.id),
        vineyard_accounts: (corpVineyardRes.data || []).filter((v: any) => v.corporation_id === corp.id),
        total_assets: (corpVineyardRes.data || [])
          .filter((v: any) => v.corporation_id === corp.id)
          .reduce((sum: number, v: any) => sum + (Number(v.current_value) || 0), 0),
      }));
    }

    // Fetch calendar events if contact has an email
    let meetings: any[] = [];
    const contactEmail = contactRes.data?.email;
    if (contactEmail) {
      const googleToken = await getValidGoogleToken(supabase, advisorUserId);
      if (googleToken) {
        meetings = await fetchCalendarEvents(googleToken, contactEmail);
      }
    }

    // Pinned Quarterly Reviews (synced from "Sovereignty Charter Sources" Drive folder)
    const reviewMemberIds = [contactId, ...householdMembers.map((m: any) => m.id)];
    const quarterly_reviews = await fetchQuarterlyReviews(supabase, reviewMemberIds);

    return new Response(JSON.stringify({
      contact: contactRes.data,
      vineyard_accounts: accountsRes.data || [],
      storehouses: storehousesRes.data || [],
      holding_tank: (() => {
        const individual = holdingTankRes.data || [];
        const individualIds = new Set(individual.map((r: any) => r.id));
        const merged = [...individual, ...householdHoldingTank.filter((r: any) => !individualIds.has(r.id))];
        return merged;
      })(),
      audit_trail: auditRes.data || [],
      portal_requests: requestsRes.data || [],
      meetings,
      family,
      household,
      household_members: householdMembers,
      hierarchy,
      corporations,
      charter: charterRes.data,
      quarterly_reviews,
    }), {
      headers: { ...corsHeaders, "Content-Type": "application/json" },
    });
  } catch (e) {
    console.error("Portal validate error:", e);
    return new Response(JSON.stringify({ error: "Server error" }), {
      status: 500,
      headers: { ...corsHeaders, "Content-Type": "application/json" },
    });
  }
});
