# Guided client onboarding in the portal

Turn `/portal/intake` from a document checklist into a 4-step onboarding experience hosted by Georgia, entered automatically right after payment, with the vault provisioned by the agent without staff involvement.

## Target flow

```text
Public site → /pay/<slug> → Square checkout → payment
    │
    └─ /book/confirm verifies payment
         ├─ mints a portal session from the paid booking (no OTP needed on first entry)
         └─ redirects to /portal/intake

/portal/intake  ("Your Sovereignty Audit" — Georgia guides all 4 steps)
    │
    ├─ Step 1 · Book the Audit        → Google appointment page (Personal / Corporate)
    ├─ Step 2 · Household information → creates contacts + household record
    ├─ Step 3 · Your wealth event     → event type + notes
    └─ Step 4 · Upload your documents → existing checklist + Shoebox upload

    Steps unlock in order; each is resumable and shows Not started / In progress / Done.
    When all four are done the onboarding view retires and the normal portal appears.
```

## Step behaviour

**Step 1 — Book the Audit.** Shows which audit they paid for (Personal or Corporate) and its Google appointment link, prefilled with their name and email. A "I've booked my time" confirmation marks the step done and stamps the booking row. No calendar polling.

**Step 2 — Household information.** One form: household name, address, phone, email, plus a repeatable member list (full name, relationship — spouse / child / dependant / other, email, date of birth optional). On submit it updates the head-of-family contact created at payment and creates a contact per additional member, linked to the same family and household. Editable until the step is confirmed; after that it becomes a read-only summary with a "request a change" link into the existing portal request flow.

**Step 3 — Your wealth event.** Dropdown: Inheritance, Divorce, Retirement, Business exit, Business growth stage, Other sudden wealth. Plus a free-text notes field ("what's on your mind about it?"). Saved on the household so it shows on the staff side and feeds the Audit context.

**Step 4 — Upload your documents.** The current `PortalIntakePage` checklist, dropzone, and activity list, unchanged apart from being framed as the last step. Completion still comes from the intake manifest.

**Georgia's role.** Each step carries a short Georgia intro line and a persistent "Ask Georgia" affordance using the existing portal assistant, scoped so it explains the step and never gives advice.

## Autonomous vault provisioning

Today the vault push is staff-triggered: `crm-intake-push` requires a staff session and its only caller is the "Push to Audit Agent" button in `HouseholdDetail.tsx`, so a new paid client waits on the office. Change:

1. Extract the payload building and signed POST out of `crm-intake-push/index.ts` into `supabase/functions/_shared/intake-push.ts` as `pushHouseholdToIntakeAgent(admin, householdId, pushedBy | null)`, still writing the `crm_intake_pushes` log row.
2. `crm-intake-push` keeps its staff auth check and just calls the helper, so the manual button is unchanged and stays as the retry path.
3. `enrollPaidBooking` calls the helper after the contact/household exist, in a try/catch so provisioning failure never blocks payment or record creation.
4. Skip the push when `intake_share_token` is already set or a recent `crm_intake_pushes` row is already `sent`/`accepted`, so the webhook and the `/book/confirm` polling fallback can't double-push.
5. The staff notification reports the outcome — "vault provisioning started automatically" or "automatic provisioning failed, push manually" — instead of asking staff to do it.

## Portal entry without OTP

`/book/confirm` already verifies the payment server-side. Once verified, `book-checkout` returns a short-lived portal token bound to that booking's contact (same `portal_tokens` mechanism the OTP flow uses, short TTL, single household scope). The confirmation page stores it and navigates to `/portal/intake`. Every later visit uses the normal email OTP login. The token is only ever issued for a booking that Square confirms as paid.

## Technical notes

- **Schema**: add onboarding progress + step data to `households` — `onboarding_step`, `onboarding_completed_at`, `audit_booked_at`, `wealth_event_type`, `wealth_event_notes`. Contacts created in step 2 reuse the existing `family_role` values, so no new enum work.
- **New files**: `src/modules/intake/components/onboarding/` with `OnboardingShell.tsx` (stepper + Georgia frame) and one component per step; a `useOnboardingProgress` hook reading/writing the household row through the portal edge function.
- **Reused**: `PortalIntakePage` becomes step 4's body; `useIntakeManifest` unchanged; the audit calendar links already live in the billing/CRM link helpers.
- **Edge functions**: `intake-portal` gains actions to read progress, save the household form, save the wealth event, and mark steps complete — all authorised by the portal token and scoped to that household. `book-checkout` gains the portal-token issuance on verified payment.
- **Gating**: the existing "redirect to intake until complete" rule now keys off `onboarding_completed_at`, which is set when all four steps are done (step 4 driven by the manifest's `completion.status`).

## Review checklist

1. Pay through `/pay/<slug>` in sandbox → land directly on `/portal/intake` with step 1 active and no login prompt.
2. Confirm the vault push fired automatically: a `crm_intake_pushes` row exists and `intake_share_token` lands after the agent callback.
3. Complete step 2 → verify the head-of-family contact is updated and one contact per member is created under the same family and household.
4. Complete step 3 → verify the event type and notes appear on the staff household page.
5. Upload documents → verify files land in the correct household Shoebox and step 4 completes from the manifest.
6. All four done → portal shows the normal dashboard and the intake redirect stops.
7. Reload mid-flow and re-login by OTP → progress is preserved, no duplicate contacts.
8. Pay with an email that already exists → links to the existing contact/household, no duplicate family, onboarding resumes at the right step.
