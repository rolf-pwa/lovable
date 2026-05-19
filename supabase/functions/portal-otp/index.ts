import { serve } from "https://deno.land/std@0.168.0/http/server.ts";
import { createClient } from "https://esm.sh/@supabase/supabase-js@2";
import {
  mintTrustedDevice,
  validateTrustedDevice,
  revokeAllDevices,
} from "../_shared/trusted-device.ts";

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

async function fetchMeetingsForContact(supabase: any, contactEmail: string | null): Promise<any[]> {
  if (!contactEmail) return [];
  // Try all advisors' Google tokens to find calendar events
  const { data: tokenRows } = await supabase
    .from("google_tokens")
    .select("user_id")
    .limit(5);
  
  for (const row of (tokenRows || [])) {
    const googleToken = await getValidGoogleToken(supabase, row.user_id);
    if (googleToken) {
      const events = await fetchCalendarEvents(googleToken, contactEmail);
      if (events.length > 0) return events;
    }
  }
  return [];
}

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

function generateOtp(): string {
  return String(Math.floor(100000 + Math.random() * 900000));
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

    const { data: allMembers } = await supabase
      .from("contacts")
      .select("id, first_name, last_name, family_role, is_minor, household_id, email")
      .in("household_id", householdIds.length > 0 ? householdIds : ["__none__"]);

    const memberIds = (allMembers || []).map((m: any) => m.id);
    const assets = await fetchAssetsForContacts(supabase, memberIds);

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

  // head_of_household sees their household members (same as spouse-level access)
  if ((role === "head_of_family" || role === "head_of_household" || role === "spouse") && householdId) {
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

  const supabase = createClient(
    Deno.env.get("SUPABASE_URL")!,
    Deno.env.get("SUPABASE_SERVICE_ROLE_KEY")!
  );

  try {
    const body = await req.json();
    const { action, email, code, deviceToken, trustDevice } = body as {
      action: string;
      email?: string;
      code?: string;
      deviceToken?: string;
      trustDevice?: boolean;
    };
    const clientIp =
      req.headers.get("cf-connecting-ip") ||
      (req.headers.get("x-forwarded-for") || "").split(",")[0].trim() ||
      null;
    const userAgent = req.headers.get("user-agent") || null;

    if (action === "send") {
      if (!email || typeof email !== "string") {
        return new Response(JSON.stringify({ error: "Email is required" }), {
          status: 400, headers: { ...corsHeaders, "Content-Type": "application/json" },
        });
      }

      const cleanEmail = email.trim().toLowerCase();

      // Find contact by email
      const { data: contact } = await supabase
        .from("contacts")
        .select("id, first_name, email")
        .ilike("email", cleanEmail)
        .maybeSingle();

      if (!contact) {
        console.log(`[OTP] No contact found for email: ${cleanEmail} — returning silent success`);
        return new Response(JSON.stringify({ sent: true }), {
          headers: { ...corsHeaders, "Content-Type": "application/json" },
        });
      }
      console.log(`[OTP] Contact found: ${contact.id} (${contact.first_name}) for ${cleanEmail}`);

      // Rate limit: max 3 OTPs per email per hour
      const oneHourAgo = new Date(Date.now() - 3600000).toISOString();
      const { count } = await supabase
        .from("portal_otps")
        .select("*", { count: "exact", head: true })
        .eq("email", cleanEmail)
        .gte("created_at", oneHourAgo);

      if ((count ?? 0) >= 3) {
        return new Response(JSON.stringify({ sent: true }), {
          headers: { ...corsHeaders, "Content-Type": "application/json" },
        });
      }

      const otp = generateOtp();
      const expiresAt = new Date(Date.now() + 10 * 60 * 1000).toISOString(); // 10 min

      await supabase.from("portal_otps").insert({
        email: cleanEmail,
        code: otp,
        contact_id: contact.id,
        expires_at: expiresAt,
      });

      // Outbound channels: Wix relay (default) and/or Gmail (admin@) via send-admin-email
      const channel = (Deno.env.get("NOTIFICATION_CHANNEL") || "wix").toLowerCase();
      const useWix = channel === "wix" || channel === "both";
      const useGmail = channel === "gmail" || channel === "both";

      const WIX_SITE_URL = Deno.env.get("WIX_SITE_URL");
      const WIX_OTP_SECRET = Deno.env.get("WIX_OTP_SECRET");

      const sendTasks: Promise<unknown>[] = [];

      if (useWix && WIX_SITE_URL && WIX_OTP_SECRET) {
        sendTasks.push((async () => {
          try {
            const wixPayload = JSON.stringify({
              email: cleanEmail,
              code: otp,
              secret: WIX_OTP_SECRET,
            });
            const wixRes = await fetch(WIX_SITE_URL, {
              method: "POST",
              headers: { "Content-Type": "application/json" },
              body: wixPayload,
            });
            if (!wixRes.ok) {
              console.error("[WixRelay] Failed to send OTP. Status:", wixRes.status);
            }
          } catch (wixErr) {
            console.error("[WixRelay] Error calling Wix endpoint:", wixErr);
          }
        })());
      } else if (useWix) {
        console.warn(`[OTP] Wix secrets missing! WIX_SITE_URL=${!!WIX_SITE_URL}, WIX_OTP_SECRET=${!!WIX_OTP_SECRET}`);
      }

      if (useGmail) {
        sendTasks.push((async () => {
          try {
            const supabaseUrl = Deno.env.get("SUPABASE_URL");
            const serviceKey = Deno.env.get("SUPABASE_SERVICE_ROLE_KEY");
            if (!supabaseUrl || !serviceKey) {
              console.warn("[OTP] Supabase env missing for Gmail relay");
              return;
            }
            const subject = `Your ProsperWise sign-in code: ${otp}`;
            const text = `Hi ${contact.first_name || "there"},\n\nYour one-time sign-in code is:\n\n${otp}\n\nThis code expires in 10 minutes. If you didn't request it, you can ignore this email.\n\nThank you,\nProsperWise Team`;
            const gmRes = await fetch(`${supabaseUrl}/functions/v1/send-admin-email`, {
              method: "POST",
              headers: {
                "Content-Type": "application/json",
                Authorization: `Bearer ${serviceKey}`,
                "x-internal-call": "1",
              },
              body: JSON.stringify({ to: cleanEmail, subject, text }),
            });
            if (!gmRes.ok) {
              const body = await gmRes.text();
              console.error(`[OTP] Gmail relay failed: ${gmRes.status} ${body}`);
            }
          } catch (gmErr) {
            console.error("[OTP] Error calling send-admin-email:", gmErr);
          }
        })());
      }

      await Promise.all(sendTasks);


      return new Response(JSON.stringify({ sent: true }), {
        headers: { ...corsHeaders, "Content-Type": "application/json" },
      });
    }

    if (action === "verify") {
      if (!email || !code) {
        return new Response(JSON.stringify({ error: "Email and code required" }), {
          status: 400, headers: { ...corsHeaders, "Content-Type": "application/json" },
        });
      }

      const cleanEmail = email.trim().toLowerCase();

      // Brute-force protection: lock out after 5 failed verify attempts
      // across any active OTPs for this email in the last 10 minutes.
      const tenMinAgo = new Date(Date.now() - 600000).toISOString();
      const { data: recentOtps } = await supabase
        .from("portal_otps")
        .select("id, failed_attempts")
        .eq("email", cleanEmail)
        .gte("created_at", tenMinAgo);
      const totalFailed = (recentOtps || []).reduce(
        (sum: number, r: any) => sum + (r.failed_attempts || 0),
        0,
      );
      if (totalFailed >= 5) {
        await new Promise((r) => setTimeout(r, 1000));
        return new Response(
          JSON.stringify({ error: "Too many failed attempts. Please request a new code." }),
          { status: 429, headers: { ...corsHeaders, "Content-Type": "application/json" } },
        );
      }

      const { data: otp } = await supabase
        .from("portal_otps")
        .select("*")
        .eq("email", cleanEmail)
        .eq("code", code)
        .eq("verified", false)
        .gte("expires_at", new Date().toISOString())
        .order("created_at", { ascending: false })
        .limit(1)
        .maybeSingle();

      if (!otp) {
        // Increment failed_attempts on the most recent active OTP (if any)
        const newest = (recentOtps || [])[0];
        if (newest) {
          await supabase
            .from("portal_otps")
            .update({ failed_attempts: (newest.failed_attempts || 0) + 1 })
            .eq("id", newest.id);
        }
        await new Promise((r) => setTimeout(r, 1000));
        return new Response(JSON.stringify({ error: "Invalid or expired code" }), {
          status: 401, headers: { ...corsHeaders, "Content-Type": "application/json" },
        });
      }

      // Mark as verified
      await supabase.from("portal_otps").update({ verified: true }).eq("id", otp.id);

      // Log portal login
      await supabase.from("portal_logins").insert({ contact_id: otp.contact_id, login_method: "otp" });

      const contactId = otp.contact_id;

      // Create a portal token so the client can use it for subsequent API calls
      const { data: newToken } = await supabase
        .from("portal_tokens")
        .insert({
          contact_id: contactId,
          created_by: contactId, // self-issued via OTP
        })
        .select("token")
        .single();

      // Mint a trusted-device token unless the client explicitly opted out
      let trustedDeviceToken: string | null = null;
      let trustedDeviceExpiresAt: string | null = null;
      if (trustDevice !== false) {
        const minted = await mintTrustedDevice(supabase, {
          contactId,
          ip: clientIp,
          userAgent,
        });
        if (minted) {
          trustedDeviceToken = minted.raw;
          trustedDeviceExpiresAt = minted.expiresAt;
        }
      }

      // Now load portal data
      const [contactRes, accountsRes, storehousesRes, auditRes, requestsRes] = await Promise.all([
        supabase.from("contacts").select("id, first_name, last_name, full_name, email, email_notifications_enabled, governance_status, fiduciary_entity, quiet_period_start_date, google_drive_url, charter_url, asana_url, ia_financial_url, vineyard_ebitda, vineyard_operating_income, vineyard_balance_sheet_summary, family_id, household_id, family_role, is_minor").eq("id", contactId).maybeSingle(),
        supabase.from("vineyard_accounts").select("*").eq("contact_id", contactId).order("created_at"),
        supabase.from("storehouses").select("*").eq("contact_id", contactId).order("storehouse_number"),
        supabase.from("sovereignty_audit_trail").select("*").eq("contact_id", contactId).order("created_at", { ascending: false }).limit(50),
        supabase.from("portal_requests").select("*, messages:portal_request_messages(*)").eq("contact_id", contactId).order("created_at", { ascending: false }),
      ]);

      let family = null;
      let household = null;
      let householdMembers: any[] = [];

      const familyId = contactRes.data?.family_id;
      const householdId = contactRes.data?.household_id;

      if (familyId || householdId) {
        const extraQueries: any[] = [];
        if (familyId) {
          extraQueries.push(supabase.from("families").select("id, name, charter_document_url, fee_tier, total_family_assets").eq("id", familyId).maybeSingle());
        } else {
          extraQueries.push(Promise.resolve({ data: null }));
        }
        if (householdId) {
          extraQueries.push(supabase.from("households").select("id, label, address").eq("id", householdId).maybeSingle());
          extraQueries.push(supabase.from("contacts").select("id, first_name, last_name, family_role, is_minor").eq("household_id", householdId).neq("id", contactId));
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

      // Fetch corporations via shareholders
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

      // Fetch calendar meetings
      const meetings = await fetchMeetingsForContact(supabase, contactRes.data?.email);

      // Pinned Quarterly Reviews
      const reviewMemberIds = [contactId, ...householdMembers.map((m: any) => m.id)];
      const quarterly_reviews = await fetchQuarterlyReviews(supabase, reviewMemberIds);

      return new Response(JSON.stringify({
        portal_token: newToken?.token || null,
        trusted_device_token: trustedDeviceToken,
        trusted_device_expires_at: trustedDeviceExpiresAt,
        contact: contactRes.data,
        vineyard_accounts: accountsRes.data || [],
        storehouses: storehousesRes.data || [],
        audit_trail: auditRes.data || [],
        portal_requests: requestsRes.data || [],
        meetings,
        family,
        household,
        household_members: householdMembers,
        hierarchy,
        corporations,
        quarterly_reviews,
      }), {
        headers: { ...corsHeaders, "Content-Type": "application/json" },
      });
    }

    if (action === "google-auth") {
      // Google OAuth portal login — verify the caller's Supabase session matches the requested email.
      if (!email || typeof email !== "string") {
        return new Response(JSON.stringify({ error: "Email is required" }), {
          status: 400, headers: { ...corsHeaders, "Content-Type": "application/json" },
        });
      }

      const cleanEmail = email.trim().toLowerCase();

      // Require a Supabase access token in the Authorization header and verify it server-side.
      const authHeader = req.headers.get("Authorization") || "";
      const accessToken = authHeader.replace(/^Bearer\s+/i, "").trim();
      if (!accessToken) {
        return new Response(JSON.stringify({ error: "Unauthorized" }), {
          status: 401, headers: { ...corsHeaders, "Content-Type": "application/json" },
        });
      }
      const anonKey = Deno.env.get("SUPABASE_ANON_KEY")!;
      const supabaseUserClient = createClient(
        Deno.env.get("SUPABASE_URL")!,
        anonKey,
        { global: { headers: { Authorization: `Bearer ${accessToken}` } } }
      );
      const { data: userData, error: userErr } = await supabaseUserClient.auth.getUser();
      const verifiedEmail = userData?.user?.email?.toLowerCase() || "";
      if (userErr || !userData?.user || verifiedEmail !== cleanEmail) {
        return new Response(JSON.stringify({ error: "Unauthorized" }), {
          status: 403, headers: { ...corsHeaders, "Content-Type": "application/json" },
        });
      }

      const { data: contact } = await supabase
        .from("contacts")
        .select("id, first_name, last_name, full_name, email, email_notifications_enabled, governance_status, fiduciary_entity, quiet_period_start_date, google_drive_url, charter_url, asana_url, ia_financial_url, vineyard_ebitda, vineyard_operating_income, vineyard_balance_sheet_summary, family_id, household_id, family_role, is_minor")
        .ilike("email", cleanEmail)
        .maybeSingle();

      if (!contact) {
        return new Response(JSON.stringify({ error: "No account found for this email" }), {
          status: 404, headers: { ...corsHeaders, "Content-Type": "application/json" },
        });
      }

      // Log portal login
      await supabase.from("portal_logins").insert({ contact_id: contact.id, login_method: "google" });

      // Create a portal token for the session
      const { data: newToken } = await supabase
        .from("portal_tokens")
        .insert({
          contact_id: contact.id,
          created_by: contact.id,
        })
        .select("token")
        .single();

      // Mint trusted device unless client opted out
      let gTrustedDeviceToken: string | null = null;
      let gTrustedDeviceExpiresAt: string | null = null;
      if (trustDevice !== false) {
        const minted = await mintTrustedDevice(supabase, {
          contactId: contact.id,
          ip: clientIp,
          userAgent,
        });
        if (minted) {
          gTrustedDeviceToken = minted.raw;
          gTrustedDeviceExpiresAt = minted.expiresAt;
        }
      }

      // Load portal data (same as OTP verify flow)
      const [accountsRes, storehousesRes, auditRes, requestsRes] = await Promise.all([
        supabase.from("vineyard_accounts").select("*").eq("contact_id", contact.id).order("created_at"),
        supabase.from("storehouses").select("*").eq("contact_id", contact.id).order("storehouse_number"),
        supabase.from("sovereignty_audit_trail").select("*").eq("contact_id", contact.id).order("created_at", { ascending: false }).limit(50),
        supabase.from("portal_requests").select("*, messages:portal_request_messages(*)").eq("contact_id", contact.id).order("created_at", { ascending: false }),
      ]);

      let family = null;
      let household = null;
      let householdMembers: any[] = [];

      if (contact.family_id || contact.household_id) {
        const extraQueries: any[] = [];
        if (contact.family_id) {
          extraQueries.push(supabase.from("families").select("id, name, charter_document_url, fee_tier, total_family_assets").eq("id", contact.family_id).maybeSingle());
        } else {
          extraQueries.push(Promise.resolve({ data: null }));
        }
        if (contact.household_id) {
          extraQueries.push(supabase.from("households").select("id, label, address").eq("id", contact.household_id).maybeSingle());
          extraQueries.push(supabase.from("contacts").select("id, first_name, last_name, family_role, is_minor").eq("household_id", contact.household_id).neq("id", contact.id));
        } else {
          extraQueries.push(Promise.resolve({ data: null }));
          extraQueries.push(Promise.resolve({ data: [] }));
        }
        const [familyRes, householdRes, membersRes] = await Promise.all(extraQueries);
        family = familyRes.data;
        household = householdRes.data;
        householdMembers = membersRes.data || [];
      }

      const hierarchy = await buildHierarchy(supabase, contact);

      // Fetch corporations via shareholders
      let corporations: any[] = [];
      const allMemberIds = [contact.id, ...householdMembers.map((m: any) => m.id)];
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

      // Fetch calendar meetings
      const meetings = await fetchMeetingsForContact(supabase, contact.email);

      // Pinned Quarterly Reviews
      const reviewMemberIds = [contact.id, ...householdMembers.map((m: any) => m.id)];
      const quarterly_reviews = await fetchQuarterlyReviews(supabase, reviewMemberIds);

      return new Response(JSON.stringify({
        portal_token: newToken?.token || null,
        trusted_device_token: gTrustedDeviceToken,
        trusted_device_expires_at: gTrustedDeviceExpiresAt,
        contact,
        vineyard_accounts: accountsRes.data || [],
        storehouses: storehousesRes.data || [],
        audit_trail: auditRes.data || [],
        portal_requests: requestsRes.data || [],
        meetings,
        family,
        household,
        household_members: householdMembers,
        hierarchy,
        corporations,
        quarterly_reviews,
      }), {
        headers: { ...corsHeaders, "Content-Type": "application/json" },
      });
    }

    // ── Trusted-device fast-login: skip OTP if the client presents a valid device token ──
    if (action === "device-login") {
      if (!email || !deviceToken) {
        return new Response(JSON.stringify({ error: "Email and device token required" }), {
          status: 400, headers: { ...corsHeaders, "Content-Type": "application/json" },
        });
      }
      const cleanEmail = email.trim().toLowerCase();
      const validated = await validateTrustedDevice(supabase, {
        rawToken: deviceToken,
        expectedEmail: cleanEmail,
        ip: clientIp,
        userAgent,
      });
      if (!validated) {
        return new Response(JSON.stringify({ error: "Device not trusted" }), {
          status: 401, headers: { ...corsHeaders, "Content-Type": "application/json" },
        });
      }
      // Hand off to the existing OTP path by issuing a portal_token and returning data
      await supabase.from("portal_logins").insert({
        contact_id: validated.contactId, login_method: "trusted_device",
      });
      const { data: newToken } = await supabase
        .from("portal_tokens")
        .insert({ contact_id: validated.contactId, created_by: validated.contactId })
        .select("token").single();

      // Reuse portal-validate-shape via a minimal in-line load (kept minimal — only fields the portal needs at boot)
      const { data: contact } = await supabase
        .from("contacts")
        .select("id, first_name, last_name, full_name, email, email_notifications_enabled, governance_status, fiduciary_entity, quiet_period_start_date, google_drive_url, charter_url, asana_url, ia_financial_url, family_id, household_id, family_role, is_minor")
        .eq("id", validated.contactId).maybeSingle();

      return new Response(JSON.stringify({
        portal_token: newToken?.token || null,
        device_login: true,
        contact,
      }), { headers: { ...corsHeaders, "Content-Type": "application/json" } });
    }

    if (action === "revoke-devices") {
      // Caller must already be authenticated to the portal — we accept the
      // current portal_token as proof (rather than a device token).
      const portalTokenStr = (body as any).portal_token;
      if (!portalTokenStr) {
        return new Response(JSON.stringify({ error: "portal_token required" }), {
          status: 400, headers: { ...corsHeaders, "Content-Type": "application/json" },
        });
      }
      const { data: pt } = await supabase
        .from("portal_tokens")
        .select("contact_id, revoked, expires_at")
        .eq("token", portalTokenStr).maybeSingle();
      if (!pt || pt.revoked || new Date(pt.expires_at) < new Date()) {
        return new Response(JSON.stringify({ error: "Unauthorized" }), {
          status: 401, headers: { ...corsHeaders, "Content-Type": "application/json" },
        });
      }
      await revokeAllDevices(supabase, pt.contact_id);
      return new Response(JSON.stringify({ revoked: true }), {
        headers: { ...corsHeaders, "Content-Type": "application/json" },
      });
    }

    return new Response(JSON.stringify({ error: "Invalid action" }), {
      status: 400, headers: { ...corsHeaders, "Content-Type": "application/json" },
    });
  } catch (e) {
    console.error("Portal OTP error:", e);
    return new Response(JSON.stringify({ error: "Server error" }), {
      status: 500, headers: { ...corsHeaders, "Content-Type": "application/json" },
    });
  }
});

    return new Response(JSON.stringify({ error: "Invalid action" }), {
      status: 400, headers: { ...corsHeaders, "Content-Type": "application/json" },
    });
  } catch (e) {
    console.error("Portal OTP error:", e);
    return new Response(JSON.stringify({ error: "Server error" }), {
      status: 500, headers: { ...corsHeaders, "Content-Type": "application/json" },
    });
  }
});
