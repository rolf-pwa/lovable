## Goal

Add `admin@prosperwise.ca` as a shared sender for select notifications using the new Lovable Gmail connector. Wix Velo relay stays in place — this is an additive channel, not a replacement.

## Scope

Route through admin@prosperwise.ca:
1. **Portal request notifications to staff** (currently `notify-portal-request` → Wix)
2. **Client-facing portal emails** — OTP, request replies, scheduled updates (currently Wix Velo templates)

Out of scope: Discovery confirmations, internal Drive/lead alerts (keep as-is).

## Architecture

```text
caller fn ──► send-admin-email (new) ──► Lovable Gateway ──► Gmail API (admin@)
                                    │
                                    └──► PII Shield check (block financial/health)
```

- **Connector**: New Lovable Gmail connector, single connection authorized on `admin@prosperwise.ca`. Sets `GOOGLE_MAIL_API_KEY` env var automatically.
- **New edge function**: `send-admin-email` — single entry point. Validates JWT, runs PII Shield (`_shared/pii-shield.ts`), builds RFC 2822 message, base64url-encodes, POSTs to `https://connector-gateway.lovable.dev/google_mail/gmail/v1/users/me/messages/send`.
- **No new DB tables.** Optional: log sends to existing audit trail.

## Implementation steps

1. **Connect Gmail connector** — call `standard_connectors--connect` with `connector_id: google_mail`. User authorizes on admin@prosperwise.ca with `gmail.send` scope.
2. **Create `supabase/functions/send-admin-email/index.ts`**
   - Inputs (Zod): `{ to: string | string[], subject, html?, text?, replyTo?, cc?, bcc? }`
   - JWT validation via `getClaims()`
   - PII Shield middleware on subject + body
   - RFC 2822 builder (handles cc/bcc as headers, multipart for HTML+text)
   - Gateway call with `Authorization: Bearer LOVABLE_API_KEY` + `X-Connection-Api-Key: GOOGLE_MAIL_API_KEY`
   - Returns `{ messageId }`
3. **Add `[functions.send-admin-email]` block** to `supabase/config.toml` (default `verify_jwt = false`, JWT validated in code).
4. **Add a routing flag per caller** — env var `NOTIFICATION_CHANNEL` (`wix` | `gmail` | `both`) read inside each existing function, defaulting to `wix` so nothing changes until we flip per-flow.
5. **Wire callers** (each gets a small `sendViaGmail()` branch alongside existing Wix call):
   - `notify-portal-request/index.ts` — staff alert on new portal request
   - `portal-otp/index.ts` — OTP delivery to client
   - `portal-request-reply/index.ts` — reply notifications to client
   - `process-scheduled-updates/index.ts` — scheduled marketing/update emails to client
6. **Test path** — `supabase--curl_edge_functions` to POST a test payload to `send-admin-email`; verify a message lands in admin@'s Sent folder.
7. **Update memory** — amend `mem://integrations/wix-relay` and Core "Communications" rule to note Gmail is an approved secondary channel under PII Shield.

## Technical notes

- Gmail connector is **builder-account** scoped — admin@ is the workspace owner of the connection, not per-staff. Per-user `google_tokens` system is untouched.
- Insufficient-scope errors → call `reconnect` with `https://www.googleapis.com/auth/gmail.send`.
- Reply-To: set to advisor address when notifying clients so replies route back naturally.
- PII Shield must run BEFORE building the raw message; reject with 422 on hit.
- All client-bound subjects/bodies remain Charter-disclosed (US infra routing for Gmail acknowledged).

## What I won't change

- Wix Velo relay code path stays intact
- `google_tokens` per-user OAuth stays untouched
- No DB migrations
- No UI changes
