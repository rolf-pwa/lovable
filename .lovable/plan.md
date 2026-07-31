# Intake-First Portal for New Clients

Yes, that makes sense. Until a client's document intake is finished, the portal becomes a single-purpose page: the intake checklist. Once intake is complete, the intake page disappears and login lands on the normal portal.

## Behaviour

1. Client logs in with intake still open (`intake` enabled, ready, not complete):
   - Any portal route redirects to the intake view — the client cannot reach the dashboard, tabs, family/household drill-downs, or the sidebar.
   - The intake view shows only the checklist, upload area, progress, and the "Ask for help" assistant. No "Back to portal" link (nothing to go back to).
   - Header keeps the ProsperWise logo, the client's name, a subtitle like "Document Intake", and the sign-out button.
2. Client logs in with intake complete (or intake not enabled for their household):
   - Normal portal renders as it does today.
   - The intake route no longer renders the checklist — it redirects to the portal dashboard.
   - The dashboard intake banner disappears (already the case today when complete).
3. While the manifest is still loading, show the existing spinner rather than briefly flashing the wrong view.

## Completion criterion

The gate lifts when the intake agent reports `completion.status === "complete"`. Partial progress — even all critical items satisfied — keeps the client on the intake page, so the agent stays the single source of truth for "done". If you'd rather unlock as soon as the required (critical) items are confirmed, that's a one-line change.

## Technical notes

- `src/pages/Portal.tsx` already receives an `intakeRoute` flag and computes `portalToken`. Add a gate that calls `useIntakeManifest(portalToken)` at page level and, when `visible` is true, renders `PortalIntakePage` regardless of the requested route/drilldown; when false and `intakeRoute` is true, renders the normal portal instead of the intake page.
- Pass an optional prop to `PortalIntakePage` to hide the back button when the portal is gated.
- Keep tab state, drill-down handlers, and data loading untouched — the gate is a render-level branch, not a data change.
- `PortalIntakeBanner` stays as-is for the (now rare) case where the portal is reachable while intake is still open, e.g. after unlock logic changes.
- Manifest fetching is already deduplicated per token by `useIntakeManifest`; the gated page reuses the same hook instance so there's no double polling.
- Scope: `/portal` and `/portal/:token` (plus their `/intake` variants). `/vfo` is untouched unless you want the same gate there.
