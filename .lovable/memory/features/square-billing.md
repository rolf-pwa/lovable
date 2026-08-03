---
name: Square billing module
description: Services catalog, AI-drafted invoices with advisor approval, Square sync, bookings, and pipeline revenue sync — replaces Wix billing
type: feature
---
Wix replacement for services + invoicing, built in-house on Square.

**Routes**: `/services` (catalog + booking requests), `/invoices` (list, AI draft, approve & send), `/book` (public booking request form, anon insert into `service_bookings`).

**Module**: `src/modules/billing/` (pages, components, `lib/money.ts`). Barrel exports `ServicesPage`, `InvoicesPage`, `BookServicePage`.

**Agent adapter**: `getInvoiceAgent()` (`IInvoiceAgentProvider`, flag `VITE_INVOICE_AGENT_PROVIDER`, default `edge`). Methods: draftInvoice, sendInvoice, refreshInvoice, cancelInvoice, syncService, getStatus.

**Edge functions**:
- `invoice-agent` — Vertex `gemini-2.5-flash` (Montreal) drafts line items from a prompt. Glass Box: model sees only the advisor's prompt + non-PII service catalog; contact resolution is done in code by token-matching against `contacts`. Always writes a `review_queue` row ("Draft for CFO Review") and an invoice with `status = 'draft'`. Never calls Square.
- `square-service` — staff-only (`auth.getUser()`); actions `status`, `syncService`, `sendInvoice`, `refreshInvoice`, `cancelInvoice`. Send flow: ensure Square customer by email → create order → create invoice → publish.
- `square-webhook` (`verify_jwt = false`) — HMAC-SHA256 of `SQUARE_WEBHOOK_URL + rawBody`; syncs invoice status + `invoice_payments`.

**Pipeline sync**: a paid invoice upserts a `business_pipeline` row (`category = pws_consulting`, `status = completed`), stored back on `invoices.pipeline_id`.

**Secrets required**: `SQUARE_ACCESS_TOKEN`, `SQUARE_LOCATION_ID`, `SQUARE_ENVIRONMENT` (`sandbox`|`production`), `SQUARE_WEBHOOK_SIGNATURE_KEY`, `SQUARE_WEBHOOK_URL`. Money is dollars in the DB, minor units at the Square boundary.

Rule: nothing reaches a client until an advisor presses send. AI never sends.
