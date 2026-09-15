// TFSA/RRSP contribution room math, ported directly from the Review Agent
// prototype's calc/contribution_room.py.
//
// NOT currently wired into the main Governance Audit output -- the
// prototype itself never wired this into its own output either
// (ComputedFigures.contribution_room is always {} in its real pipeline),
// so this carries that same honest limitation forward rather than
// inventing a use for it the prototype itself didn't ship. Available for
// a future phase to call directly if that changes.
//
// Scope note (from the prototype): actual up-to-date cumulative room is
// authoritatively tracked by CRA (via My Account) and is what advisors
// pull in practice -- this module does not attempt to reconstruct a
// client's entire historical contribution/withdrawal ledger from a
// handful of statements. Instead it: (a) computes the maximum *possible*
// cumulative TFSA limit for a given birth year as a sanity-check ceiling,
// and (b) applies the one deterministic rule that's easy to get wrong by
// hand -- a withdrawal made this year is added back to room on January 1
// of next year -- given a CRA-confirmed current room figure as input.

import { CONTRIBUTION_RULES } from "./governance-audit-tax-config.ts";

/**
 * Maximum possible cumulative TFSA room if the client contributed nothing
 * and was eligible (age >= 18, and the account existed, i.e. 2009 onward)
 * for every year on record in governance-audit-tax-config.ts. Useful as a
 * sanity-check ceiling against a CRA-reported room figure, not as the room
 * figure itself.
 */
export function tfsaCumulativeLimitCeiling(birthYear: number, asOfYear: number): number {
  const rules = CONTRIBUTION_RULES.tfsa;
  const years = Object.keys(rules.annualDollarLimits).map(Number).sort((a, b) => a - b);
  let total = 0;
  for (const year of years) {
    if (year < birthYear + rules.eligibilityStartAge) continue;
    if (year > asOfYear) break;
    total += rules.annualDollarLimits[year];
  }
  const maxYear = Math.max(...years);
  if (asOfYear > maxYear) {
    const missingYears: number[] = [];
    for (let y = maxYear + 1; y <= asOfYear; y++) missingYears.push(y);
    throw new Error(
      `governance-audit-tax-config.ts is missing TFSA dollar limits for ${missingYears.join(", ")} -- add them ` +
        `(CRA publishes the new limit each fall) before computing room for asOfYear=${asOfYear}.`,
    );
  }
  return total;
}

/**
 * `currentConfirmedRoom` should be the client's CRA-confirmed room as of
 * today (before next January's restoration). Returns the room available
 * starting next January 1, per the "withdrawals restore room the
 * following year" rule.
 */
export function tfsaRoomAfterWithdrawalRestoration(currentConfirmedRoom: number, withdrawalsThisYear: number): number {
  return currentConfirmedRoom + withdrawalsThisYear;
}

/**
 * 18% of prior year's earned income, capped at that year's dollar limit,
 * plus any unused room carried forward (a CRA Notice-of-Assessment figure,
 * supplied by the advisor/client -- not reconstructed here).
 */
export function rrspRoomForYear(priorYearEarnedIncome: number, priorYear: number, unusedRoomCarriedForward = 0): number {
  const rules = CONTRIBUTION_RULES.rrsp;
  const cap = rules.annualDollarLimits[priorYear];
  if (typeof cap !== "number") {
    throw new Error(
      `governance-audit-tax-config.ts is missing the RRSP dollar limit for ${priorYear} -- add it before computing room for this client.`,
    );
  }
  const newRoom = Math.min(priorYearEarnedIncome * rules.earnedIncomeRate, cap);
  return newRoom + unusedRoomCarriedForward;
}
