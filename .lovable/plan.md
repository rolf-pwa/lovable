
## Goal

Turn the Pro Portal into a real workspace. Clicking a family expands the family → household → contact tree (scoped to what the pro actually serves). Household and contact pages mirror the Family Portal look, plus vault docs and Sovereignty Charter status. Message threads retire; Asana tasks become the collaboration surface.

## Structure

```text
/pro-portal                     Dashboard: families the pro serves (grid)
  /pro-portal/family/:id        Family workspace: scoped tree + rollup
  /pro-portal/household/:id     Household workspace: directory + charter + vault + tasks
  /pro-portal/contact/:id       Contact workspace: profile + vault + tasks
```

All routes reuse the Forest-green header band and cream card treatment from the current Pro Portal (matches VFO branding).

## Data scoping (what "assigned" means)

For a professional record, "assigned" rows come from `professional_engagements`:

- Direct contact links (`contact_id`)
- Household links (`household_id`) → include every member of that household
- Family links (`family_id`) → include every household + member in the family

Anything outside those sets is hidden. Households/contacts the pro is not linked to are omitted from the tree entirely (per your choice).

## Page contents

**Family workspace `/pro-portal/family/:id`**
- Header: family name, "Assigned as {role}" chip, family stats (households I serve, contacts I serve, open tasks).
- Directory tree (collapsible): each household → expandable to its members. Only assigned households/contacts render. Each node links to its workspace page.
- Sidebar: Collaborators (other pros on this family) + Recent Activity (last 10 Asana task events touching this family).

**Household workspace `/pro-portal/household/:id`**
- Header: household name, family breadcrumb.
- Contacts panel: directory of household members the pro is assigned to (name, role, email, phone).
- Sovereignty Charter panel: status (`none` / `core` / `stabilization` / `sovereign`), ratification date, most recent governance-review findings summary.
- Vault panel: only files/folders granted to this pro via `vault_collaborator_grants`, with view/download.
- **Tasks panel (Asana)**: replaces threads. See workflow section below.

**Contact workspace `/pro-portal/contact/:id`**
- Header: contact name, role, household + family breadcrumb.
- Profile card: email, phone, relationship, DOB range (not exact — privacy).
- Vault panel: files granted specifically to this pro at contact scope.
- Tasks panel: same Asana component, filtered to this contact.

## Asana task workflow (replaces engagement threads)

Existing Asana structure: Family = Project, Household = Section, Phase = Task, Action = Subtask (per project memory). We extend this with a **Pro assignment convention**:

- Each pro-facing subtask carries an Asana **custom field `Pro`** = the professional's name (or a project-wide tag `pro:{slug}`). Ghost User PAT keeps the assignee abstracted.
- New edge function `pro-portal-tasks`:
  - `GET ?scope=family|household|contact&id=…` — pulls Asana subtasks whose custom field matches this pro AND whose Section/parent maps to the requested scope. Returns task name, notes, due date, completion, comment count, direct portal link.
  - `POST /comment` — pro adds a comment (goes into Asana as a story). Comments are attributed as "{Pro name} (via Portal)".
  - `POST /complete` — pro marks subtask complete.
  - `POST /create` — pro can open a new task; lands in a "Pro Requests" section of the family project for staff triage. Notifies staff via existing `staff_notifications` bell.
- UI component `ProTasksPanel` shared across family/household/contact pages: task list (open / done tabs), inline comment thread per task, "New task" button.

**Migration:** existing `professional_engagements` rows stay for reference (audit) but the Pro Portal UI stops surfacing message threads. Staff-side `EngagementsPanel` on Contact/Household detail pages is replaced with a "Pro Tasks" panel pointing at the same Asana data.

## Files to change / add

Frontend
- `src/pages/ProPortal.tsx` — family cards become links to `/pro-portal/family/:id`; drop the current expanded engagements/threads list.
- `src/pages/ProPortalFamily.tsx` — new. Scoped tree + collaborators + activity.
- `src/pages/ProPortalHousehold.tsx` — new. Directory + charter + vault + tasks.
- `src/pages/ProPortalContact.tsx` — new. Profile + vault + tasks.
- `src/components/pro/ProTasksPanel.tsx` — new. Shared Asana task UI.
- `src/components/pro/ProVaultPanel.tsx` — new. Reads `vault_collaborator_grants`.
- `src/components/pro/ProCharterPanel.tsx` — new. Reads `sovereignty_charters` + latest `monthly_governance_reviews`.
- `src/App.tsx` — register new pro-portal routes behind the pro session guard.
- `src/components/EngagementsPanel.tsx` on staff-side Contact/Household detail → swap for `ProTasksPanel` (staff variant).

Edge functions
- `supabase/functions/pro-portal-tree/index.ts` — resolves the scoped family → household → contact tree for the authenticated pro.
- `supabase/functions/pro-portal-tasks/index.ts` — Asana read/comment/complete/create, filtered by pro custom field.
- Extend `supabase/functions/pro-portal-engagements/index.ts` (or retire it) to no longer be the main data source for the workspace views.

Database
- No new tables required. The scoped tree resolves off `professional_engagements`, `families`, `households`, `contacts`, `family_relationships`, `household_relationships`.
- One optional migration: add index on `professional_engagements(professional_id, family_id, household_id, contact_id)` for tree queries.

## Assumptions to confirm

1. Asana custom field `Pro` (text) — I'll create it on the project template if it doesn't already exist. OK to standardize on that?
2. Retiring the message-thread UI is one-directional — no email replies from clients come back through the old Gmail relay for pros anymore. Staff can still email pros directly outside the portal.
3. Vault access shown to the pro is strictly what's already in `vault_collaborator_grants`; no new sharing UI in this phase.

Once you approve, I'll do it in two passes: (1) new pages + tree edge function scaffolded against real data, (2) Asana task panel + retire the threads panel.
