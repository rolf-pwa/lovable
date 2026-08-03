# Square Services & Invoicing (Wix Replacement)

Replace the Wix services/booking/invoicing stack with an in-app module backed by your Square account, with an AI drafting agent that always requires advisor approval before anything is sent.

## What you get

1. **Service catalog** — define your billable services (name, description, price, duration, category, active/inactive). Synced to Square's Catalog so the same items back invoices and bookings.
2. **Bookings / scheduling** — a booking list tied to services and contacts, with a public-facing request form. Confirmed bookings can create a draft invoice.
3. **Invoices** — build an invoice from one or more catalog services for a contact, send it through Square, and track status (draft, sent, viewed, paid, overdue, canceled).
4. **Payments** — Square's hosted payment page handles the actual card payment; we record the payment and link it to the invoice.
5. **AI drafting agent** — you type "invoice the Jerczynski household for the Q3 governance review and the charter update" and it produces a draft invoice with line items pulled from the catalog. Nothing sends until you approve it.
6. **Pipeline sync** — a paid invoice writes/updates the matching `business_pipeline` row (consulting fee amount, status completed, close date) so revenue totals stay accurate.

## Approval flow (HITL)

Every AI-produced invoice or service edit lands in the existing `review_queue` as a proposed action:

```text
prompt -> AI draft -> review_queue (pending) -> you approve -> Square API send -> status polled/webhook -> pipeline row updated
```

Rejecting discards the draft. Approvals and sends are written to `sovereignty_audit_trail`.

## Build order

**Phase 1 — Square connection + services**
- Store your Square access token and location ID as backend secrets.
- New tables: `services`, `service_bookings`, `invoices`, `invoice_line_items`, `invoice_payments`.
- `square-service` edge function: catalog upsert, invoice create/send/cancel, payment lookup.
- Staff UI at `/services` — catalog CRUD with Square sync status per item.

**Phase 2 — Invoices**
- `/invoices` list with status filters and totals.
- Invoice builder: pick contact, add service line items, quantities, discounts, due date, notes.
- Send via Square; store the Square invoice id and public payment URL.
- Square webhook endpoint for `invoice.payment_made` / `invoice.updated` to keep status current without polling.

**Phase 3 — AI agent**
- `invoice-agent` edge function using Vertex AI (`gemini-2.5-flash`, Montreal) with the catalog and contact list as tool context.
- New provider `IInvoiceAgentProvider` in `src/shared/lib/agents/invoice/` registered in the existing agent factory (`VITE_INVOICE_AGENT_PROVIDER`).
- Prompt box on `/invoices` producing a draft that opens in the builder pre-filled, flagged "Draft for CFO Review".

**Phase 4 — Bookings + pipeline sync**
- `/services` booking calendar view; public request form reusing the discovery-lead write-only RLS pattern.
- On `paid`, upsert `business_pipeline` (category `pws_consulting`, status `completed`, `amount` = invoice total) and log to the audit trail.

## Technical notes

- **Module home:** new `src/modules/billing/` (pages, components, lib) with an `index.ts` barrel; agent contracts live in `src/shared/lib/agents/invoice/`.
- **Square API:** REST v2 (`connect.squareup.com/v2`), called only from edge functions — the token never reaches the browser. Sandbox base URL used until you confirm live.
- **Secrets needed:** `SQUARE_ACCESS_TOKEN`, `SQUARE_LOCATION_ID`, `SQUARE_ENVIRONMENT` (sandbox|production), plus `SQUARE_WEBHOOK_SIGNATURE_KEY` for webhook verification.
- **PII shield:** the AI prompt receives contact opaque IDs and service metadata only; display names are resolved from the CRM after the draft returns.
- **RLS:** all new tables scoped to authenticated staff with `service_role` grants for edge functions; the public booking form gets a write-only insert policy.
- **Emails:** invoice notifications go out through Square's own invoice delivery, so the Wix relay rule is unaffected.

## Before we start

You'll need a Square developer account with an application created (developer.squareup.com → Applications). I'll walk you through pulling the sandbox access token, location ID, and webhook signature key when we reach Phase 1, and you'll paste them into a secure form — never into chat.

## Out of scope for now

- Migrating historical Wix invoices (can be added as a CSV import later).
- Square terminal / in-person card reader payments.
- Recurring subscription billing (Square supports it; add after one-off invoicing is proven).
