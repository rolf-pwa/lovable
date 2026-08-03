// booking-enrollment.ts
// When a public website booking is paid, turn the buyer into a real CRM record
// and enroll them in the Sovereignty Audit (document) workflow:
//   1. link/create a contact (matched on email)
//   2. create a family + household when the contact is brand new
//   3. leave the household in `stabilization` so the portal Audit checklist
//      renders for them, and notify staff to provision the vault.
//
// Idempotent: safe to call from both the Square webhook and the confirmation
// page fallback — it no-ops once the booking already has a contact_id.

function splitName(fullName: string): { first: string; last: string } {
  const parts = String(fullName || "").trim().split(/\s+/).filter(Boolean);
  if (parts.length === 0) return { first: "New", last: "Client" };
  if (parts.length === 1) return { first: parts[0], last: parts[0] };
  return { first: parts[0], last: parts.slice(1).join(" ") };
}

async function staffUserId(client: any): Promise<string | null> {
  const { data } = await client
    .from("profiles")
    .select("user_id")
    .order("created_at", { ascending: true })
    .limit(1)
    .maybeSingle();
  return data?.user_id ?? null;
}

export interface EnrollmentResult {
  contactId: string | null;
  householdId: string | null;
  created: boolean;
}

export async function enrollPaidBooking(
  client: any,
  bookingId: string,
): Promise<EnrollmentResult> {
  const { data: booking } = await client
    .from("service_bookings")
    .select("id, contact_id, requester_name, requester_email, requester_phone, service_id, payment_status")
    .eq("id", bookingId)
    .maybeSingle();

  if (!booking) return { contactId: null, householdId: null, created: false };
  if (booking.contact_id) {
    return { contactId: booking.contact_id, householdId: null, created: false };
  }

  const email = String(booking.requester_email || "").trim().toLowerCase();
  const { first, last } = splitName(booking.requester_name || "");
  const fullName = `${first} ${last}`.trim();

  // ---- 1. Existing contact by email -------------------------------------
  let contactId: string | null = null;
  let householdId: string | null = null;
  let created = false;

  if (email) {
    const { data: existing } = await client
      .from("contacts")
      .select("id, household_id")
      .ilike("email", email)
      .limit(1)
      .maybeSingle();
    if (existing?.id) {
      contactId = existing.id;
      householdId = existing.household_id ?? null;
    }
  }

  // ---- 2. Create the sovereign tree for a brand-new buyer ----------------
  if (!contactId) {
    const createdBy = await staffUserId(client);
    if (!createdBy) {
      console.error("[enrollPaidBooking] no staff profile available for created_by");
      return { contactId: null, householdId: null, created: false };
    }

    const { data: family, error: famErr } = await client
      .from("families")
      .insert({ name: `${last} Family`, created_by: createdBy })
      .select("id")
      .maybeSingle();
    if (famErr || !family?.id) {
      console.error("[enrollPaidBooking] family insert failed:", famErr);
      return { contactId: null, householdId: null, created: false };
    }

    const { data: household, error: hhErr } = await client
      .from("households")
      .insert({
        family_id: family.id,
        label: `${last} Household`,
        governance_status: "stabilization",
        quiet_period_start_date: new Date().toISOString().slice(0, 10),
      })
      .select("id")
      .maybeSingle();
    if (hhErr || !household?.id) {
      console.error("[enrollPaidBooking] household insert failed:", hhErr);
      return { contactId: null, householdId: null, created: false };
    }
    householdId = household.id;

    const { data: contact, error: cErr } = await client
      .from("contacts")
      .insert({
        full_name: fullName,
        first_name: first,
        last_name: last,
        email: email || null,
        phone: booking.requester_phone || null,
        family_id: family.id,
        household_id: household.id,
        family_role: "head_of_family",
        governance_status: "stabilization",
        quiet_period_start_date: new Date().toISOString().slice(0, 10),
        created_by: createdBy,
      })
      .select("id")
      .maybeSingle();
    if (cErr || !contact?.id) {
      console.error("[enrollPaidBooking] contact insert failed:", cErr);
      return { contactId: null, householdId: householdId, created: false };
    }
    contactId = contact.id;
    created = true;
  }

  // ---- 3. Link the booking + tell staff ---------------------------------
  await client.from("service_bookings").update({ contact_id: contactId }).eq("id", bookingId);

  const { data: svc } = await client
    .from("services")
    .select("name")
    .eq("id", booking.service_id)
    .maybeSingle();

  await client.from("staff_notifications").insert({
    title: created ? "New Audit client (paid online)" : "Audit booked by existing client",
    body: `${fullName}${email ? ` <${email}>` : ""} paid for ${svc?.name || "a service"}. ${
      created ? "Contact, family and household created — provision the vault to start the Audit." : "Booking linked to their existing record."
    }`,
    link: householdId ? `/households/${householdId}` : `/contacts/${contactId}`,
    contact_id: contactId,
    source_type: "booking_paid",
  });

  return { contactId, householdId, created };
}
