# AI Agent Development & Maintenance Plan

## Decision

All AI agents will live **in-house, inside this project**, not as standalone external services. The existing modular monolith (`src/modules/{intake,crm,portal,pro,audit}`) and the agent adapter layer (`src/shared/lib/agents`) are the canonical home for agent UI, prompts, tools, and orchestration.

External teams or services integrate with our agents through our edge functions and adapters, not the other way around.

## Architecture Principles

1. **One codebase, one deploy.** Agents are first-class modules or shared services in this app. They share auth, RLS, logging, and the Sovereignty/PII rules already enforced here.
2. **Agent Adapter Pattern is the boundary.** Every agent exposes a provider interface in `src/shared/lib/agents`. UI code never calls an agent endpoint directly. Swapping an implementation (edge function, Cloud Run, local derivation) is an env-flag change, not a refactor.
3. **Agent compute lives in edge functions.** Model calls, system prompts, tools, secrets, and long-running orchestration run in `supabase/functions/`. The browser only sends input and renders output.
4. **Domain modules own the UI.** Intake/onboarding UI lives in `src/modules/intake`. Audit UI lives in `src/modules/audit`. Shared primitives live in `src/shared`.
5. **HITL review queue for all agent actions.** Any agent that proposes database mutations or client-visible actions writes to the sovereignty audit trail / review queue for advisor approval.

## Reference Agent: Onboarding Agent (Phase 1)

The Onboarding Agent (previously called the Intake Agent) is already partially integrated. Phase 1 hardens it into the reference pattern.

### Goals
- Replace the current external-agent dependency with an in-house agent that owns document classification, vault provisioning, and onboarding completion.
- Keep the existing `IOnboardingAgentProvider` contract so `PortalIntakePage.tsx` and `useOnboardingManifest.ts` do not change.
- Make the agent self-hostable via the `intake-portal` edge function.

### Work

1. **Consolidate onboarding runtime into `supabase/functions/intake-portal/`**
   - Absorb the manifest generation, upload handling, and classification sweep logic currently owned by the external agent.
   - Use Vertex AI (`gemini-2.5-flash`, Montreal region) for document classification and checklist matching.
   - Store classification results and audit state in a new `intake_classifications` table (RLS-scoped to household).

2. **Add an in-house provider in `src/shared/lib/agents/onboarding/`**
   - Create `inHouseOnboardingAgent.ts` implementing `IOnboardingAgentProvider`.
   - It calls the same `intake-portal` edge function but treats it as the agent runtime, not a proxy.
   - Default provider remains `edge` (the existing proxy) until in-house is verified.

3. **Schema additions**
   - `intake_classifications`: id, household_id, file_name, drive_file_id, predicted_category, confidence, status, review_required, created_at, updated_at.
   - `intake_checklist_templates`: standard required/optional folder templates per household type.
   - GRANT to `authenticated` + `service_role`; RLS scoped to household membership.

4. **Portal gating**
   - Keep the existing `/portal/intake` focus-mode behavior.
   - Drive `completion.status` from the in-house agent's audit state, not just upload counts.

5. **Verification**
   - Re-push a test household through the full onboarding flow.
   - Confirm documents classify, vault folders provision, and the portal panel updates without external callbacks.

## Phase 2: Audit Agent

Once Onboarding is the reference, build the real Audit Agent behind `IAuditAgentProvider`.

The Audit Agent is a future development. It will ingest all onboarding data (completed manifest, classifications, household profile, wealth event, and vault contents) and produce the Sovereignty Audit.

1. **New edge function: `supabase/functions/audit-agent/`**
   - Consumes the completed onboarding manifest and household data.
   - Produces a `sovereignty_audit` draft with gaps, risks, and recommendations.
   - Writes proposed actions to `review_queue` for advisor HITL approval.

2. **New provider: `src/shared/lib/agents/audit/auditAgent.ts`**
   - Implements `IAuditAgentProvider`.
   - Replaces the current `derivedAuditAgent`.
   - Flip `VITE_AUDIT_AGENT_PROVIDER` to `audit` once verified.

3. **Portal `/portal/audit` panel**
   - Render the audit state and any pending advisor actions.
   - Gated until onboarding is complete.

## Phase 3: Additional Agents

Bring the remaining agent-like capabilities under the same adapter layer.

| Agent | Home | Notes |
|-------|------|-------|
| Sovereignty Assistant (staff-side) | `src/shared/lib/agents/sovereignty/` + `src/shared/components/SovereigntyAssistant.tsx` | Extract from inline Vertex calls; add tool-based actions with HITL queue |
| Discovery/Transition Assistant (Georgia) | `src/modules/intake/lib/georgia2/` + edge function | Already modular; move runtime calls behind an adapter |
| Cashflow Analyst | `src/modules/audit/components/workbench/CashflowAnalyst.tsx` + `cashflow-analyst` edge function | Already edge-based; standardize adapter |
| Content Marketing AI | `src/modules/crm/pages/MarketingUpdates.tsx` + `content-ai` edge function | Add provider for generative marketing drafts |

## Maintenance Model

- **Agent owners per module.** `intake` module owns onboarding agent. `audit` module owns audit agent. `shared` owns cross-cutting adapters and contracts.
- **Env flags control runtime selection.** `VITE_ONBOARDING_AGENT_PROVIDER`, `VITE_AUDIT_AGENT_PROVIDER`, etc. New providers can be added without UI changes.
- **All agent changes require edge function redeploy and adapter verification.** The manifest extractor pattern used for MCP does not apply here; instead, run `supabase--test_edge_functions` and browser smoke tests after each agent change.
- **Versioned prompts.** Store system prompts in `src/shared/lib/agents/<agent>/prompts.ts` or edge function constants, versioned by git. Never hardcode prompts in UI files.

## Risks & Mitigations

| Risk | Mitigation |
|------|------------|
| External agent team still needs callbacks | Keep the `crm-intake-callback` endpoint but make it write into our tables; the external agent becomes a data source, not the owner |
| Large PDFs hit edge function limits | Reuse the existing loop-based base64 and streaming patterns from `large-file-handling` memory |
| Model latency in portal | Show optimistic UI and poll classification status; never block the upload response on Vertex |
| PII in prompts | Enforce Project Glass Box: only opaque IDs and pre-sanitized metadata go to the model; fetch display names from CRM |

## First Deliverable

Harden the Onboarding Agent into the in-house reference pattern. Scope: `supabase/functions/intake-portal/`, `src/shared/lib/agents/onboarding/inHouseOnboardingAgent.ts`, new `intake_classifications` table, and verification against one test household.
