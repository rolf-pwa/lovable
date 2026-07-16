
# Georgia 2.0 — Decoupled Sovereignty OS™ Diagnostic

Staging build at `/discovery-v2` (and `/discovery-v2/embed`). Existing `/discovery` remains untouched until we sign off end-to-end. Nothing in production changes.

## 1. Routes & files

- `src/pages/DiscoveryV2.tsx` — full-page layout (Sanctuary aesthetic).
- `src/pages/DiscoveryV2Embed.tsx` — iframe-safe wrapper reusing the same shell.
- `src/components/georgia2/` — split-screen shell + all step/canvas components.
- `public/discovery-v2-embed.html` — Wix embed loader (mirrors existing pattern).
- Routes registered in `src/App.tsx` (public, no auth).

## 2. Layout

Responsive CSS grid: **Left 60% / Right 40%** on ≥ md; stacks on mobile. Left = interactive wizard. Right = live "Generative Blueprint Canvas" (read-only, updates on every input).

```text
┌────────────────────────────────┬────────────────────┐
│ Left: stepper + inputs         │ Right: canvas      │
│  1 Domain                      │  • Timeline        │
│  2 Catalyst                    │  • 4 risk gauges   │
│  3 Questions + $ slider        │  • BC context box  │
│  4 Results dashboard           │                    │
│  5 Lead capture                │                    │
└────────────────────────────────┴────────────────────┘
```

## 3. Wizard state (Left Panel)

Single reducer (`useGeorgia2State`) holding:
`domain`, `catalyst`, `answers` (3 keys per domain), `scale` (number), `chosenPathway`, `contact`.

### Step 1 — Domain
Two large tactile cards: **Corporate Wealth Event** / **Personal Wealth Event**.

### Step 2 — Catalyst
Card grid keyed off domain. Corporate: Founder Exit, Growth Stage Founder. Personal: Inheritance, Executive Exit, Divorce Restructuring, Insurance Settlement, Sudden Windfall.

### Step 3 — Dynamic questionnaire + BC scale slider
3 Yes/No/Unsure segmented controls (domain-specific, exactly as spec'd).
Premium range slider: **$100k → $10M CAD**, $100k steps, "Velvet Rope" marker at $1M. Banner flips based on threshold.

### Step 4 — Decoupled results (routing math)
- `scale ≥ 1_000_000` → **Ongoing VFO Path**: primary "Book $249 Stabilization Session with Rolf"; secondary "Request Catalyst Guide" (mapped to catalyst).
- `scale < 1_000_000` → **Decoupled Build Path**: choose (a) 90-Day Standalone Build — $5,000 personal / $10,000 corporate; (b) Complimentary ProsperWise Academy Pass.

### Step 5 — Confidential lead capture
Slide-over form: First Name, Email, Mobile (optional). Zod validation. Privacy banner: "Montréal Data Pinning Active. Zero Tracking Cookies." Submit → success screen tailored to chosen pathway (next steps + optional catalyst-guide PDF placeholder link).

## 4. Right Panel — Generative Blueprint Canvas

Recomputes on every state change (pure derivations, no server round-trips):

- **Timeline strip** — horizontal SVG segment; catalyst-specific milestones (e.g. Founder Exit → LOI → Diligence → Close → 90-Day Stabilization).
- **Risk gauges** (4 ring/bar meters, 0–100):
  - Tax Drag Risk — spikes when `lcge=no` or `probate=yes`.
  - Structure Safety — inverse: low when `holdco=no` or `trusts=no`.
  - Noise Strain — high for inheritance/divorce catalysts.
  - Readiness / Overwhelm — composite of unsure answers + scale bracket.
- **BC Context Box** — bulleted, catalyst-aware notes on BC Family Law Act, BC Probate Fees, LCGE, cross-border, HoldCo integration.

All formulas live in `src/lib/georgia2/derive.ts` (pure, unit-testable).

## 5. Optional AI helper (deferred, wired but off by default)

Floating "Ask Georgia" button on Left Panel; opens a side sheet using the existing `discovery-assistant` edge function. Behind a `GEORGIA2_CHAT_ENABLED` flag (const) so we can verify the deterministic flow first, then enable.

## 6. Backend (dedicated tables)

Migration creates:

- `georgia2_sessions` — session_key, domain, catalyst, answers (jsonb), scale, chosen_pathway, phase, message_count, timestamps, ended_at. Anonymous insert/update via edge function (service role); no client RLS reads.
- `georgia2_leads` — session_key (fk), first_name, email, mobile, chosen_pathway, catalyst, scale, domain, submitted_at. Write-only from edge function; staff (`authenticated`) can select.

GRANTs + RLS explicit; no anon direct table access. Data mirrors current `discovery_leads` firewall pattern.

Two edge functions:
- `georgia2-session` — upsert session snapshot on each meaningful step (debounced from client, `keepalive` beacon on exit).
- `georgia2-lead` — validates Zod payload, inserts lead, notifies staff via existing `notify-portal-request` / Wix relay path, returns success payload with pathway metadata.

CORS: allow `prosperwise.ca`, `app.prosperwise.ca`, `prosperwise.lovable.app`, `*.lovable.app`, `*.lovableproject.com` (suffix-matched, same pattern we hardened in `portal-otp`).

## 7. Design system

Sanctuary tokens only — Forest Green, Bronze, Vellum background, Adobe Caslon headers, DM Sans body. No hardcoded hex. Gauges/timelines use `--sanctuary-bronze` / `--primary`. Fully responsive; mobile stacks canvas below wizard with sticky mini-summary.

## 8. Verification before production

- Unit tests for `derive.ts` (routing math + gauge values across representative fixtures).
- Playwright smoke: run through both domains, both scale brackets, submit lead, assert success screen + row in `georgia2_leads`.
- Manual QA checklist covering: mobile stack, iframe embed on Wix staging URL, keyboard nav, screen-reader labels on slider/segmented controls, session beacon on tab close.
- Only after sign-off: swap `/discovery` (or add redirect) in a follow-up change.

## 9. Out of scope for this pass

Real Stripe checkout, PDF catalyst-guide generation, and the AI chat helper going live. All buttons route through the lead-capture form; catalyst-guide download link is a placeholder until PDFs are supplied.

---

### Technical details

- Reducer + context in `src/components/georgia2/state.tsx`; components consume via a typed hook.
- Slider: shadcn `Slider` primitive, custom track marker for $1M threshold.
- Gauges: lightweight SVG (no chart lib) for consistent Sanctuary styling.
- Session tracker follows the existing `georgia-session-tracker.ts` pattern (debounce + `sendBeacon` on `pagehide`).
- Lead insert re-uses the `pii-shield` middleware for the free-form name field.
- Edge functions use `npm:@supabase/supabase-js@2` with service role and Zod validation, mirroring `georgia-session-update`.
