# Remove Intake Test Push Button & Route

The "Test Push & Verify" button in the Vault tab of the Household detail page is no longer needed now that the Intake Agent integration is live.

## Changes

1. **Remove the button**
   - File: `src/modules/crm/pages/HouseholdDetail.tsx`
   - Delete the `<Button asChild size="sm" variant="ghost">` wrapping the `<Link to="/intake-test">Test Push & Verify</Link>` in the Vault tab header.

2. **Remove the test route**
   - File: `src/App.tsx`
   - Delete the `/intake-test` route.

3. **Delete the unused test page**
   - File: `src/modules/intake/pages/IntakeTest.tsx`
   - This page was only reachable via the `/intake-test` route.

## Verification

- Household detail Vault tab still shows "Push to Intake Agent" and "Open in Drive" actions.
- No `/intake-test` route remains.
- Build passes without errors.
