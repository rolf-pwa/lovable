// invoice-enrollment.ts
// Bridges staff-created Invoices to the same guided-onboarding enrollment that
// already fires when someone pays through Square Checkout (see
// booking-enrollment.ts). An invoice never creates a contact/household itself —
// it links to a `service_bookings` row (the column `service_bookings.invoice_id`
// already exists for exactly this) and lets `enrollPaidBooking` do the real work.

import { enrollPaidBooking } from "./booking-enrollment.ts";

/**
 * Call once, right after an invoice is actually issued (sent/published) — not
 * at draft-save, since drafts get edited or abandoned. If any line item is for
 * a service flagged `triggers_onboarding`, create the linked booking that
 * `enrollFromPaidInvoice` will later hand to `enrollPaidBooking`.
 *
 * The booking's `contact_id` is deliberately left null even though the
 * invoice's contact is already known: `enrollPaidBooking` no-ops immediately
 * if a booking already has a contact_id (that's what makes it safe to call
 * twice), so pre-filling it would skip the very steps this exists to trigger.
 * Leaving it null lets `enrollPaidBooking`'s own "match an existing contact by
 * email" path resolve back to the same contact/household instead.
 */
export async function ensureInvoiceBooking(client: any, invoiceId: string): Promise<void> {
  const { data: lines } = await client
    .from("invoice_line_items")
    .select("service_id, services(id, name, triggers_onboarding)")
    .eq("invoice_id", invoiceId);

  const triggerService = (lines || [])
    .map((l: any) => l.services)
    .find((s: any) => s?.triggers_onboarding);
  if (!triggerService) return;

  const { data: existingBooking } = await client
    .from("service_bookings")
    .select("id")
    .eq("invoice_id", invoiceId)
    .maybeSingle();
  if (existingBooking) return;

  const { data: inv } = await client
    .from("invoices")
    .select("contact_id, contact:contacts(full_name, email, phone)")
    .eq("id", invoiceId)
    .maybeSingle();
  const contact: any = inv?.contact;
  const email = String(contact?.email || "").trim();

  if (!email) {
    await client.from("staff_notifications").insert({
      title: "Onboarding not auto-enabled for this invoice",
      body: `This invoice includes ${triggerService.name}, but the client has no email on file, so guided onboarding can't be matched automatically once it's paid. Add an email to their contact record, or enable onboarding manually from the household.`,
      link: inv?.contact_id ? `/contacts/${inv.contact_id}` : undefined,
      contact_id: inv?.contact_id ?? null,
      source_type: "invoice_missing_email",
    });
    return;
  }

  await client.from("service_bookings").insert({
    service_id: triggerService.id,
    contact_id: null,
    requester_name: contact?.full_name || null,
    requester_email: email,
    requester_phone: contact?.phone || null,
    status: "requested",
    invoice_id: invoiceId,
  });
}

/**
 * Call whenever an invoice transitions to `status: 'paid'` — from the Square
 * webhook, a manual refresh, or a manually-recorded e-Transfer payment (all
 * three are real, independent "this invoice is now paid" paths in this app).
 */
export async function enrollFromPaidInvoice(client: any, invoiceId: string): Promise<void> {
  const { data: booking } = await client
    .from("service_bookings")
    .select("id, paid_at")
    .eq("invoice_id", invoiceId)
    .maybeSingle();
  if (!booking) return;

  // The portal's own onboarding gate checks service_bookings.payment_status
  // directly (see intake-portal's resolveHousehold), the same field the
  // Checkout payment webhook sets — enrollPaidBooking itself never touches it.
  await client
    .from("service_bookings")
    .update({
      payment_status: "paid",
      status: "confirmed",
      paid_at: booking.paid_at || new Date().toISOString(),
    })
    .eq("id", booking.id);

  try {
    await enrollPaidBooking(client, booking.id);
  } catch (e) {
    console.error("[enrollFromPaidInvoice] enrollment failed:", e);
  }
}
