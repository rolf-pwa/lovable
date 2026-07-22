## Add Company to Households & Families

Currently a corporation only appears under a household when someone is manually added as a shareholder from the Corporation page. We'll add a direct "Add Company" action on both the Household and Family detail pages.

### Household Detail
- Add an **Add Company** button in the Corporate Holdings section header (visible even when the list is empty).
- Opens a dialog with two tabs:
  - **Create new**: name, corporation type, jurisdiction → inserts into `corporations`, then inserts a `shareholders` row linking a chosen household member (defaults to HoF/HoH) with an editable ownership % and role.
  - **Link existing**: searchable select of existing corporations → inserts a `shareholders` row for the chosen household member.
- Reload household data on success so the corporation appears in Corporate Holdings and rolls into totals.

### Family Detail
- Add an **Add Company** button near the Corporate Holdings rollup.
- Same dialog, with an extra required "Household" picker (scoped to households in this family) so the shareholder link resolves to the right member.

### Technical notes
- No schema changes — reuses `corporations`, `shareholders`, `corporate_vineyard_accounts` tables.
- Shareholder insert sets `is_active = true`, sensible defaults (ownership 100%, role "Owner") that the user can edit before saving.
- New shared component `src/components/AddCompanyDialog.tsx` used by both pages to keep behavior consistent.
- No changes to portal, VFO, or AUM logic — corporate assets already roll up through the existing shareholder path.
