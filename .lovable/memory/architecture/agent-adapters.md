---
name: Agent adapter layer
description: Phase 2 modular monolith — IOnboardingAgentProvider/IAuditAgentProvider/ILibrarianProvider interfaces with env-flag factory in src/shared/lib/agents
type: feature
---
All agent access from the UI goes through `src/shared/lib/agents`:

- `getOnboardingAgent()` — default `edge` provider proxies the external onboarding agent via the `intake-portal` edge function (manifest + upload).
- `getAuditAgent()` — default `derived` provider infers stage (`intake` | `audit` | `vfo`) from the onboarding manifest's `completion.audit`; replace with the real audit agent when Cloud Run ships.
- `getLibrarian()` — default `vault` provider wraps `vault-service` (list folder, download URL).

Env flags select implementations: `VITE_ONBOARDING_AGENT_PROVIDER`, `VITE_AUDIT_AGENT_PROVIDER`, `VITE_LIBRARIAN_PROVIDER`.

Rule: components/hooks must never fetch an agent endpoint directly — add a provider method instead. `useOnboardingManifest` consumes the onboarding provider and re-exports the manifest types from the adapter layer.
