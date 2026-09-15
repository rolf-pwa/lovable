// Estate liquidity analysis, ported directly from the Review Agent
// prototype's calc/estate.py: does the estate have enough liquid cash to
// cover its debts and taxes, given which assets bypass probate via direct
// beneficiary designation?
//
// This is the calculation behind the prototype's real sample audit's
// "estate liquidity deadlock" finding: assets with a named beneficiary
// (segregated funds, insurance, registered accounts payable to someone
// other than the estate) pass directly to that person and never become
// estate cash -- if the *only* liquid assets in the picture are
// beneficiary-designated, the estate itself can be left with $0 to pay
// debts/taxes even though the family's total net worth is healthy.
//
// Adapted from the prototype in one respect: `assets_from_statements`
// (deriving EstateAsset rows from a freshly-extracted AccountStatement) is
// not ported -- this CRM already has a real `liabilities` table (built for
// the Intercompany/Shareholder Loan Audit) and real per-contact accounts,
// so a future phase builds the EstateAsset list directly from those tables
// instead of statement-derived rows. analyzeEstateLiquidity itself,
// the actual deadlock math, is ported verbatim.

export interface EstateAsset {
  description: string;
  value: number;
  /** True if this asset bypasses the estate/probate (named beneficiary other than the estate) -- it will never be available as estate cash regardless of what the Will says. */
  passesViaBeneficiaryDesignation: boolean;
  isLiquid?: boolean; // default true
}

export interface EstateLiquidityResult {
  totalEstateLiquidAssets: number;
  totalBeneficiaryBypassAssets: number;
  totalLiabilitiesAndTaxes: number;
  surplusOrDeficit: number; // negative = deficit
  hasDeadlock: boolean;
  atRiskIlliquidAssets: string[];
  notes: string[];
}

function formatMoney(n: number): string {
  return n.toLocaleString("en-CA", { minimumFractionDigits: 2, maximumFractionDigits: 2 });
}

/**
 * `illiquidProtectedAssets` are descriptions of illiquid assets (e.g.
 * "primary residence") that some other document (Will clause, Charter)
 * directs must be preserved intact for a beneficiary (e.g. a spousal life
 * interest) -- these are flagged as at-risk if the estate has a cash
 * deficit, since a deficit forces the trustee to sell *something*.
 */
export function analyzeEstateLiquidity(
  assets: EstateAsset[],
  liabilities: number,
  terminalTaxEstimate: number,
  illiquidProtectedAssets: string[] = [],
): EstateLiquidityResult {
  const estateLiquid = assets
    .filter((a) => !a.passesViaBeneficiaryDesignation && (a.isLiquid ?? true))
    .reduce((sum, a) => sum + a.value, 0);
  const bypassTotal = assets
    .filter((a) => a.passesViaBeneficiaryDesignation)
    .reduce((sum, a) => sum + a.value, 0);
  const totalCashNeeded = liabilities + terminalTaxEstimate;
  const surplusOrDeficit = estateLiquid - totalCashNeeded;
  const hasDeadlock = surplusOrDeficit < 0;

  const notes: string[] = [];
  const atRisk = hasDeadlock ? illiquidProtectedAssets : [];
  if (hasDeadlock && atRisk.length > 0) {
    notes.push(
      `Estate has a $${formatMoney(-surplusOrDeficit)} cash deficit against liabilities and estimated terminal tax, ` +
        `with no liquid estate assets to draw on because $${formatMoney(bypassTotal)} in assets bypass the estate via ` +
        `direct beneficiary designation. Since the Trustee must still settle the debt/tax, they may be forced to sell ` +
        `one of: ${atRisk.join(", ")}.`,
    );
  } else if (hasDeadlock) {
    notes.push(`Estate has a $${formatMoney(-surplusOrDeficit)} cash deficit against liabilities and estimated terminal tax.`);
  }

  return {
    totalEstateLiquidAssets: estateLiquid,
    totalBeneficiaryBypassAssets: bypassTotal,
    totalLiabilitiesAndTaxes: totalCashNeeded,
    surplusOrDeficit,
    hasDeadlock,
    atRiskIlliquidAssets: atRisk,
    notes,
  };
}
