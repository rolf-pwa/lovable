
# Activate Gemini Enterprise in ProsperWise

Goal: stand up the Gemini Enterprise connector so staff can query their Workspace vault (Drive, Gmail, Calendar, and any future agent outputs) from inside the app, with grounded answers and citations.

## Phase 1 — Connection & smoke test

1. Link the **Gemini Enterprise** connector to the project (Lovable connector gateway, OAuth with your Google account).
2. Verify the connection (project ID, location, engine ID come from connection configuration — no manual entry).
3. List connected data stores via the inspection endpoint so we confirm Drive / Gmail / Calendar are indexed and visible to the engine.

Deliverable: a confirmation panel in Settings → Integrations showing "Gemini Enterprise: connected" plus the list of indexed data stores.

## Phase 2 — Staff Assistant surface (Command Center)

A new **Ask Gemini** panel in the staff dashboard:

- Chat-style UI (Sanctuary aesthetic: dark slate bg, amber accents, Noto Serif headings, DM Sans body).
- Calls an edge function `gemini-assist` that proxies `streamAssist` through the gateway.
- Streams the answer (depth-tracking brace parser, filters `thought:true` chunks, renders markdown).
- Shows citation chips under each answer linking back to the source Drive doc / Gmail thread / Calendar event.
- Maintains a session per conversation (saves `sessionInfo.session` for multi-turn follow-ups).
- Pinned to staff role only — never exposed in the client portal (PII Shield + privacy firewall).

Example queries it should handle on day one:
- "What did the Harrison family send last quarter about their trust restructuring?"
- "Summarize all charter drafts produced by my Gemini agents this week."
- "Which clients have unreviewed agent outputs in Drive?"

## Phase 3 — Agent output bridge (foundation for your future Gemini agents)

Light groundwork so when you start dropping agent outputs into Drive, the app picks them up cleanly:

- Add a recognized folder convention per contact (e.g. `/Agents/` subfolder alongside the existing `CHARTER_SUBFOLDER_NAME`).
- Extend `drive-watch` to tag files originating from that folder as `source: 'gemini_agent'` in the staff notification + holding tank.
- Surface those in the staff notification bell as **"Agent output ready for review"** (HITL gate before anything reaches a client).

No portal-facing changes in this phase — outputs stay internal until an advisor approves them, per the Sovereignty Audit Trail rules.

## Out of scope (deferred)

- Actions via Gemini Enterprise API (sending emails, creating events) — not supported by the API, only the GCP console UI. Continue routing actions through existing Gmail / Calendar / Asana edge functions.
- Client-portal exposure of Gemini answers — requires PII Shield review first.
- `search` endpoint (ranked results UI) — `streamAssist` covers the chat use case; we can add a search-style results view later if you want a document browser.

## Technical notes

- Edge function: `supabase/functions/gemini-assist/index.ts`, `verify_jwt` validated in code via `supabaseUser.auth.getUser()`.
- Gateway base: `https://connector-gateway.lovable.dev/gemini_enterprise/v1alpha`.
- Headers: `Authorization: Bearer ${LOVABLE_API_KEY}`, `X-Connection-Api-Key: ${GEMINI_ENTERPRISE_API_KEY}`.
- Resource paths built from connection configuration (`projectId`, `location`, `engineId`) — fetched via `get_connection_configuration`, never hardcoded.
- Stream parser: depth-tracking brace extractor (not NDJSON), handles `SKIPPED` state, merges overlapping text chunks.
- Sessions persisted in a new `gemini_sessions` table (staff `user_id`, `session_path`, `last_used_at`) with RLS scoped to `auth.uid()`.
- Storage region stays Montreal — the connector itself is global, but no Gemini Enterprise response data is persisted server-side beyond session pointers and audit log entries.

## Open question

One thing to confirm before I build Phase 2: do you want the **Ask Gemini** panel embedded directly into the Command Center dashboard (always visible alongside tasks/calendar), or as a dedicated `/assistant` route reached from the sidebar? Embedded keeps it in your daily flow; dedicated gives it more room and conversation history.
