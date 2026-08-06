---
name: Legacy vs new client onboarding gate
description: households.onboarding_enabled controls whether the guided Sovereignty Audit onboarding and card appear in the portal
type: feature
---

`households.onboarding_enabled` (boolean, default true) decides who sees the guided
Sovereignty Audit onboarding.

- Legacy clients (existing households at the time of the migration, no paid booking,
  no onboarding progress) were backfilled to `false` — no Audit card in the portal,
  `/portal/intake` shows a "not in the Audit flow" notice, uploads are rejected 403.
- `enrollPaidBooking` sets it `true`: anyone who pays for an Audit is a new client.
- `intake-portal` enforces it server-side: manifest returns
  `{ enabled: false, reason: "legacy_client" }` and onboarding actions return
  `{ ok: false, disabled: true }`.
- Staff can flip it per household from the Vault tab on the household page
  ("Audit onboarding" switch).
