# Dedicated Client Intake Page in the Portal

## Recommended approach

Keep the current API-only integration (no iframe), but promote intake from a card at the top of the portal to its **own full page** with a lightweight entry point everywhere else.

```text
/portal            → dashboard, with a slim "Document Intake — 5 of 12 received" banner
                     (only while intake is incomplete) linking to the page
/portal/intake     → full-page intake experience (progress, checklist, drop zone, activity)
```

Why this shape:
- Uploading 10–20 documents needs room: a checklist by vault category, a large drop zone, and a per-file status list don't fit in a sidebar card.
- The dashboard stops being dominated by intake, but a new client still lands on a clear next action.
- The page self-retires: once the manifest reports `completion.status === "complete"`, the banner disappears and the route shows a short "Vault complete" summary instead of the uploader.
- No new auth surface — the page reuses the existing portal token, and the agent's share token stays inside the edge proxy.

## What the intake page contains

1. **Header + progress** — household name, "X of Y documents received", progress bar, and a plain-language line about what happens next.
2. **Checklist by category** — one row per expected item / vault category from the manifest, each showing Waiting / Received / Filed / In review, so the client knows exactly what is still outstanding.
3. **Drop zone** — drag-and-drop plus file picker, multi-file, with per-file client-side checks against the manifest's `limits` (25MB, allowed types) before upload, and inline per-file upload progress.
4. **Recent activity** — every uploaded file with its filed folder and classification status, polled while any file is still `pending`.
5. **Help affordance** — a short "Not sure what to send?" note and a link into the existing portal request/message flow so questions don't need email.

## Frontend work

- New route `/portal/intake` rendering a `PortalIntakePage` (reuses the portal shell, token, and household resolution already used by `/portal`).
- Refactor `src/components/portal/PortalIntake.tsx` into: a small `PortalIntakeBanner` (dashboard) and the page's panels (progress, checklist, dropzone, activity). Shared manifest fetching moves into a `useIntakeManifest` hook so both surfaces read the same data.
- Replace the current in-dashboard panel at the top of `src/pages/Portal.tsx` with the banner. Same gating rule as today: hidden when the manifest is disabled, not ready, or complete.

## Backend work

- `intake-portal` edge function gains an optional `checklist` shape in the manifest passthrough: pass through the manifest's expected-item / folder list (name, category, status) alongside the fields already forwarded, still stripping Drive IDs and URLs.
- No schema changes; no new secrets.

## Open items to confirm with the agent team

- Whether the manifest exposes per-expected-item status (item → received/filed) or only aggregate counts. If only counts, the checklist renders category rows from `folders` plus the counts, and per-item ticks land in a follow-up.
- Multi-file upload: today the proxy accepts one `file` per request; the page will issue parallel single-file requests unless the agent supports batches.

## Not in this change

- Staff-side intake monitoring inside the CRM.
- Any AI classification logic on our side (the agent owns it).
- Changes to the CRM push / callback contract.
