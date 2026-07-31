# Intake-First Portal, Staged Toward the VFO

The portal becomes stage-gated. A client only ever sees the surface that matches their current stage, so there is one obvious next action at all times.

```text
Stage 1  intake     → /portal/intake only          (live now)
Stage 2  audit      → /portal/audit only           (future AI agent)
Stage 3  vfo        → full portal / VFO unlocked   (existing portal)
```

## Behaviour by stage

1. **Intake** — client logs in and lands on the intake page regardless of the URL they hit. No dashboard, no tabs, no family/household drill-down, no sidebar. The page shows the checklist, upload area, progress, and "Not sure what to send?" help. No "Back to portal" link, since there is nothing behind it yet.
2. **Audit** — once the intake agent reports intake complete, the client is routed to `/portal/audit`. Until the audit agent exists, this stage renders a simple holding panel ("Your Sovereignty Audit is being prepared") so the flow is complete end to end and the real UI drops in later without re-plumbing.
3. **VFO** — after the audit is marked complete, the full portal/VFO opens and becomes the login landing page. `/portal/intake` and `/portal/audit` stop rendering their panels and redirect to the portal.

While stage data is loading, show the existing spinner rather than flashing the wrong surface.

## Stage source of truth

Add a single `portal_stage` value on the household (`intake` | `audit` | `vfo`) that the portal reads to decide what to render:

- `intake → audit` advances automatically when the intake agent's manifest reports `completion.status === "complete"`.
- `audit → vfo` advances when the audit is marked complete — by the future audit agent's callback, and manually by staff in the meantime.
- Staff can override the stage from the household page, so you can open the VFO early or send someone back to intake.

This keeps the gate off the client and off ad-hoc checks: one field, two advancement events.

## Drive file movement (intake → VFO folder)

When a household advances to `vfo`, intake files move from the Drive intake folder into the VFO folder tree. Two options:

- **Agent-owned (recommended):** we notify the intake agent on stage change and it relocates the files it provisioned, since it owns the Drive tree and the classification map. Requires a small contract addition on their side (a `vault.finalize` / stage-change endpoint).
- **CRM-owned:** we move files ourselves via the existing Google Drive integration in `vault-service`, using the stored vault root and shoebox folder IDs.

I'd raise the agent-owned option with their team first; the CRM-owned fallback is buildable now but risks fighting the agent's sweeper.

## Technical notes

- `src/pages/Portal.tsx` already receives an `intakeRoute` flag and resolves `portalToken`. Add a stage resolver at the top of the page that branches rendering; drill-down, tab state, and data loading stay untouched.
- New route `/portal/audit` (and `/portal/:token/audit`) rendering a placeholder `PortalAuditPage` component.
- `PortalIntakePage` gains a prop to hide the back button while the portal is gated.
- `useIntakeManifest` already exposes `isComplete`; the stage advance hooks off that plus a persisted stage field so a manifest hiccup can't bounce a VFO client back to intake.
- Scope: `/portal` and `/portal/:token`. `/vfo` unchanged for now — say the word and I'll apply the same gate there.

## Migration

One column on `households`: `portal_stage` defaulting to `intake`, plus a stage-changed timestamp for the audit trail. Existing clients get backfilled to `vfo` so nobody currently using the portal is pushed back into intake.

## Not in this change

- The audit agent itself, its scoring, or its UI beyond the holding panel.
- The Drive relocation implementation (pending the agent-vs-CRM decision above).
