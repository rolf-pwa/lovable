---
name: Georgia Discovery v2 spec (Survey-only commitment)
description: Georgia 2.0 diagnostic drives only to the Sovereignty Survey; pricing, terminology, placeholder and Academy-link rules
type: feature
---

# Georgia Discovery v2 — build rules

## Single commitment
The tool drives to exactly one commitment: the **Sovereignty Survey** — $750 personal / $1,500 corporate, priced from the Step 1 Domain choice. The $5,000/$10,000 Sovereignty Operating System™ Build and Ongoing System Oversight are later-stage and **out of scope** for this tool.

- "$249 Stabilization Session" is dead terminology — it was the old name for the Survey. Never reintroduce it.
- No "Ongoing VFO Oversight" box, no $1M velvet-rope routing on the Pathway screen. `deriveResult` returns only `surveyPrice`, `domainLabel`, `headline`.

## Terminology (must match prosperwise.ca)
- "Sovereignty Operating System™" (full term), not "Sovereignty OS™" / "Decoupled Sovereignty OS™".
- Personal catalysts = exactly 4: Inheritance Planning, Divorce Financial Planning, Executive Retirement Planning, Sudden Wealth Planning.
- Corporate catalysts = Business Exit Planning, Growth-Stage Founder Planning.
- Insurance settlement is a **sub-type of Sudden Wealth Planning** (windfall_type question), never a parallel catalyst. Legacy `insurance_settlement` key kept only for historical data.

## No fake numbers before input
Risk metrics (Tax Drag, Structure Safety, Noise Strain, Readiness) show "—" with empty bars until at least one diagnostic answer exists (`hasDiagnosticInput`). Capital Scale card hidden before Step 3. No conclusion/headline line rendered before answers justify it. Audience is diligence-driven; placeholder numbers read as fabricated.

## Timeline panel
Keep it, but label it "Where you are in the [X] process" so it never competes with ProsperWise's own Stabilize → Set the Charter → Integrate stages.

## Secondary CTA
"Read the [X] Guide" opens the matching public Academy article in a new tab — no email gating, no delivery step. Map: Inheritance → Navigating the Inheritance; Executive Retirement → The Transition Cliff; Business Exit → The Liquidity Event; Growth-Stage Founder → The Velocity Surge; Divorce → The Settlement Gap; Sudden Wealth → Sudden Wealth Syndrome. URLs live in `CATALYST_ACADEMY` in `derive.ts`.

## Pathways
`chosen_pathway` values are now `survey` and `academy_guide`; legacy values (`vfo_stabilization`, `vfo_catalyst_guide`, `standalone_build`, `academy_pass`) accepted for old rows only.

## Deferred (fast-follow, not this pass)
Per-question "Not sure? Ask Georgia" scoped chat that resolves back to a structured answer or tags an edge case in the handoff brief — reusing the existing conversational Georgia routing logic, not a second agent. No always-open chat box alongside the wizard.
