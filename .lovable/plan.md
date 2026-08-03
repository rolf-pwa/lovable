# Public website → CRM workflow review

## Current flow (as implemented)

```text
Public site
    │
    ├─ /pay/<slug>  ──►  QuickPay page  ──►  book-checkout edge fn
    │                       (public, no login)
    │
    └─ /book/<slug> ──►  BookService form ──►  book-checkout edge fn
                            (public, fallback form)

book-checkout
    │
    ├─ Looks up active service by slug (with fuzzy fallback for typos)
    ├─ Inserts a service_bookings row (awaiting_payment / unpaid)
    ├─ Creates a Square hosted payment link
    │   • quick mode: Square collects name/email/phone once
    │   • non-quick: pre-populates email/phone from the form
    └─ Returns checkoutUrl

Square hosted checkout
    │
    ├─ Buyer pays
    ├─ Square redirects to /book/confirm?booking=<id>
    └─ Square webhook fires payment.* event

Payment confirmation
    │
    ├─ /book/confirm polls book-checkout status action
    ├─ If webhook hasn't landed, status action checks Square Order directly
    └─ On paid: updates booking, then calls enrollPaidBooking

enrollPaidBooking (shared helper, also called by square-webhook)
    │
    ├─ Backfills buyer name/email/phone from Square Payment / Order APIs if missing
    ├─ Matches existing contact by email
    │   └─ If found: links booking to existing contact/household
    │
    └─ If no contact found:
        ├─ Creates a Family  (e.g. "Last Family")
        ├─ Creates a Household with governance_status = stabilization
        ├─ Creates a Contact with family_role = head_of_family
        └─ Creates a staff_notification: "New Audit client (paid online)"

Client portal
    │
    ├─ New household is in stabilization → client logs in via OTP
    ├─ Until intake is complete, portal redirects to /portal/intake
    ├─ /portal/intake fetches manifest via intake-portal edge fn
    │   • proxy mode: uses shareToken/manifestUrl/uploadUrl from the agent callback
    │   • in-house mode: builds checklist locally, classifies uploads with Vertex AI
    └─ Client uploads documents into the household vault Shoebox

Staff side
    │
    ├─ HouseholdDetail has a "Push to Audit Agent" action (crm-intake-push)
    ├─ Agent provisions Drive vault and calls crm-intake-callback
    │   with shareToken + manifestUrl + uploadUrl
    └─ Staff can toggle HoF visibility, governance status, fiduciary entity, etc.
```

## Key files

| Step | File |
|------|------|
| Public quick-pay entry | `src/modules/billing/pages/QuickPay.tsx` |
| Public form entry | `src/modules/billing/pages/BookService.tsx` |
| Link helpers | `src/modules/billing/lib/booking-links.ts` |
| Checkout & status API | `supabase/functions/book-checkout/index.ts` |
| Square REST helper | `supabase/functions/_shared/square.ts` |
| Post-payment enrollment | `supabase/functions/_shared/booking-enrollment.ts` |
| Payment confirmation UI | `src/modules/billing/pages/BookingConfirmation.tsx` |
| Square webhooks | `supabase/functions/square-webhook/index.ts` |
| Client intake UI | `src/modules/intake/components/PortalIntakePage.tsx` |
| Intake manifest hook | `src/shared/hooks/useIntakeManifest.ts` |
| Intake portal edge fn | `supabase/functions/intake-portal/index.ts` |
| Staff push to agent | `src/modules/crm/pages/HouseholdDetail.tsx` |
| Agent callback | `supabase/functions/crm-intake-callback/index.ts` |

## Proposed review checklist

1. **End-to-end smoke test**
   - Visit `/pay/<service-slug>` as an anonymous user.
   - Complete a Square sandbox payment.
   - Confirm `/book/confirm` shows "Payment received" and scheduling link.
   - Verify a new Contact, Family, and Household were created with `governance_status = stabilization`.
   - Verify staff notification was created.

2. **Webhook resilience**
   - Confirm `SQUARE_WEBHOOK_SIGNATURE_KEY` and `SQUARE_WEBHOOK_URL` are set.
   - Test that deleting the webhook and relying only on `/book/confirm` polling still enrolls the client.

3. **Quick-pay buyer backfill**
   - Pay without using the `/book` form.
   - Confirm `requester_name`, `requester_email`, and `requester_phone` are backfilled from Square into the booking and contact.

4. **Duplicate contact handling**
   - Pay with an email that already exists in `contacts`.
   - Confirm the booking links to the existing contact/household and does **not** create a duplicate family.

5. **Intake portal handoff**
   - After enrollment, send the client their portal OTP link.
   - Confirm `/portal/intake` loads the checklist.
   - Confirm document upload lands in the correct household Shoebox folder.

6. **Edge cases**
   - Service with `requires_prepayment = false` (free booking) flows through `/book`, not `/pay`.
   - Fuzzy slug fallback resolves a misspelled URL.
   - Failed Square checkout retries without pre-populated buyer data.

## Open questions

- Should the `/book/confirm` page automatically redirect the client to `/portal/intake` after payment, or keep the current "choose your appointment time" step?
- Should paid bookings create a `business_pipeline` row (revenue) in addition to the contact/household?
- Do you want a staff alert or Slack/email notification when a new paid enrollment succeeds or fails?
