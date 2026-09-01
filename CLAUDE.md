# ProsperWise Portal — Project Standards

Durable conventions for this codebase. Follow these unless the user explicitly asks for an exception.

## UI / Layout Standards (Advisor/staff app)

- **Content width**: the Advisor app's page content wrapper (`src/shared/components/AppLayout.tsx`, the `<main>` child div) uses `max-w-screen-2xl` (1536px), **not** `mx-auto`. Content hugs the sidebar with the wrapper's own padding rather than centering in the leftover viewport width — centering there creates a large, visually awkward gap between the sidebar and the page content on wide screens. The width is capped (not left unbounded) to avoid uncomfortable line lengths on text-heavy pages and over-stretched grid/sidebar cards (e.g. the Dashboard) on very large or ultrawide monitors.
- This applies to every page rendered through `AppLayout` — it's a shared wrapper, not a per-page setting.
- The client Portal (`src/modules/portal/`) is a separate layout/branding system and is not governed by this rule.
