# Sovereignty OS Platform — Modular Monolith, Phase 1 (Structure)

Refactor this existing project in place into the modular monolith described in your blueprint. Nothing user-visible changes in this phase: same routes, same database, same portal tokens, same 63 edge functions. Only where files live and how they import each other changes.

## Target shape

```text
src/
├── modules/
│   ├── intake/     onboarding, bulk onboarding, discovery, Georgia 2.0, portal intake UI
│   ├── crm/        households, families, contacts, corporations, pipeline, dashboard
│   ├── portal/     client + VFO portal pages and portal components
│   ├── pro/        professional spoke alliance portal
│   └── audit/      governance review, quarterly review, stabilization map, charter
├── shared/
│   ├── components/ui/   shadcn primitives
│   ├── components/      cross-module app shell (layout, sidebar, breadcrumbs, protected route)
│   ├── hooks/           useAuth, useGoogle, use-toast
│   ├── lib/             utils, auth, dates, charter, portalAum
│   ├── types/           household, vault manifest, document interfaces
│   └── integrations/    backend client + generated types (untouched, auto-generated)
└── App.tsx              role-based router
```

Boundary rule: a module may import from `@/shared/*` and its own folder only. Cross-module communication goes through `@/shared` or database state. `@/modules/crm` never imports from `@/modules/portal`, and so on.

## Phase 1 steps (this build)

1. **Scaffold + aliases.** Create `src/modules/*` and `src/shared/*` with barrel `index.ts` files. Add `@/modules/*` and `@/shared/*` path aliases in `tsconfig` and `vite.config.ts` (the existing `@/*` alias keeps working, so nothing breaks mid-migration).
2. **Move shared core first (lowest risk).** `src/components/ui/` → `src/shared/components/ui/`, `src/hooks/` → `src/shared/hooks/`, `src/lib/` → `src/shared/lib/`, `src/integrations/` → `src/shared/integrations/`. Re-point imports across the app; leave the generated backend client file's contents untouched.
3. **Move module feature folders**, one module per commit-sized step, in this order: `intake`, `pro`, `audit`, `portal`, `crm`. Each step moves the pages and components listed in the mapping below and updates their imports.
4. **Enforce the boundary in lint.** Add an ESLint `no-restricted-imports` rule set that fails any cross-module deep import, so the structure can't silently rot.
5. **Verify per step.** After each module moves: typecheck, load the affected routes in the preview, and confirm the portal/pro/CRM screens render before moving to the next module. Nothing gets published until all five modules are green.

## File mapping

| Module | Pages | Components |
| --- | --- | --- |
| intake | `Onboarding`, `BulkOnboarding`, `Discovery`, `DiscoveryV2`, `IntakeTest` | `georgia2/*`, `PortalIntakePage`, `PortalIntakeBanner`, `IntakeBackfillTile` |
| crm | `Households`, `HouseholdDetail`, `Families`, `FamilyDetail`, `Contacts`, `ContactDetail`, `Pipeline`, dashboard | `AddCompanyDialog`, `CrmTabs`, `HoldingTank`, `HouseholdTaskRollup`, `AssigneePicker`, `ContactMerge`, `DecouplerWizard`, `Pros/Insurance/Engagements` panels |
| portal | `Portal`, `VfoPortal` | `components/portal/*` (minus the intake pieces above) |
| pro | `ProPortal`, `ProPortalContact` | `components/pro/*` |
| audit | `GovernanceReview`, `QuarterlyReview`, `StabilizationMap` | `StabilizationMapButton`, `CharterRatificationTile`, `SovereigntyCharterButton`, `AuditTrail`, `workbench/*` |

Edge functions stay where they are; they already carry domain-name prefixes (`portal-*`, `crm-intake-*`, `pro-portal-*`, `governance-*`). Existing tables keep their names — renaming live tables to `intake_*`/`crm_*` prefixes would break the portal and every deployed function, so new tables adopt prefixes going forward instead.

## Phase 2 (next, not in this build)

- **Agent adapter layer.** `src/shared/lib/agents/` with `IIntakeAgentProvider`, `IAuditAgentProvider`, `ILibrarianProvider` plus an env-flag factory, so today's implementations (intake agent API, Vertex functions) sit behind interfaces and can move to Cloud Run later without UI changes.
- **Absorb the intake UI.** The intake checklist/upload UI becomes a first-class `modules/intake` surface behind the adapter; the external agent keeps owning Drive provisioning, classification, and its PII-free store.
- **Audit module build-out.** `/audit` route and the audit agent adapter, per the staged Intake → Audit → VFO flow.

## Notes

This is a mechanical refactor with a large blast radius, so it moves in five verifiable steps rather than one sweep, and each step ends with the app running. Everything stays on the current preview until the whole set is verified.
