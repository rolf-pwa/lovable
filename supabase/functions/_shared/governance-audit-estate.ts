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
// replaced, not ported as-is -- rather than re-extracting beneficiary
// designations from a statement PDF on every quarterly review (a real
// bottleneck as the VFO scales, since the existing monthly CSV valuation
// sync never carries beneficiary data), Rolf confirmed beneficiary
// designation is captured once as real structured data on each account
// (vineyard_accounts/storehouses.beneficiary_designation,
// insurance_policies.primary_beneficiary, already present) as part of the
// account-setup SOP, or as a one-time backfill for pre-existing accounts.
// estateAssetsFromAccounts()/estateAssetSourceRowsFromFinancials() below
// build the EstateAsset list directly from that real, persisted data.
// analyzeEstateLiquidity itself, the actual deadlock math, is ported
// verbatim from the prototype either way.

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

export interface EstateAssetSourceRow {
  description: string;
  value: number;
  beneficiaryDesignation: string | null;
}

/**
 * Ported from the prototype's assets_from_statements(), adapted to read a
 * real CRM account row's own beneficiary_designation/primary_beneficiary
 * field instead of an AccountStatement's. Same classification rule: a
 * named beneficiary other than "Estate" or an undisclosed "SEE FILE" is
 * treated as bypassing probate; anything else (empty, "Estate", "SEE
 * FILE") is treated conservatively as passing through the estate -- we
 * can't assume bypass without a positive designation -- but is flagged for
 * the advisor to confirm from the actual designation form.
 */
export function estateAssetsFromAccounts(rows: EstateAssetSourceRow[]): { assets: EstateAsset[]; warnings: string[] } {
  const assets: EstateAsset[] = [];
  const warnings: string[] = [];
  for (const row of rows) {
    const designation = (row.beneficiaryDesignation || "").trim();
    const bypasses = designation !== "" && !["estate", "see file"].includes(designation.toLowerCase());
    if (designation === "" || designation.toLowerCase() === "see file") {
      warnings.push(
        `"${row.description}": beneficiary designation not disclosed${designation ? ' (shows "SEE FILE")' : ""} -- ` +
          `confirm the actual designation form before relying on this account's probate-bypass status in the estate analysis.`,
      );
    }
    assets.push({ description: row.description, value: row.value, passesViaBeneficiaryDesignation: bypasses });
  }
  return { assets, warnings };
}

/**
 * Builds the raw {description, value, beneficiaryDesignation} rows
 * estateAssetsFromAccounts() needs, directly from
 * sovereignty-diagnostics.ts's gatherHouseholdFinancials() output -- no
 * second query, since that function already selects every column
 * (`select("*")`) on vineyard_accounts/storehouses/insurance_policies.
 * holding_tank is deliberately excluded: those rows aren't yet assigned to
 * a pillar (see governance-audit-pillars.ts), so building estate-liquidity
 * assumptions on them would be premature -- the account's own move-to-
 * Vineyard/Storehouse flow already carries beneficiary_designation forward
 * once an advisor assigns it.
 */
export function estateAssetSourceRowsFromFinancials(financials: {
  // deno-lint-ignore no-explicit-any
  vineyardAccounts: any[];
  // deno-lint-ignore no-explicit-any
  storehouses: any[];
  // deno-lint-ignore no-explicit-any
  insurancePolicies: any[];
}): EstateAssetSourceRow[] {
  const rows: EstateAssetSourceRow[] = [];

  for (const a of financials.vineyardAccounts) {
    const value = Number(a.current_value) || 0;
    if (value <= 0) continue;
    rows.push({ description: a.account_name || "Vineyard account", value, beneficiaryDesignation: a.beneficiary_designation ?? null });
  }

  for (const s of financials.storehouses) {
    const value = Number(s.current_value) || 0;
    if (value <= 0) continue;
    rows.push({ description: s.asset_type || s.label || "Storehouse account", value, beneficiaryDesignation: s.beneficiary_designation ?? null });
  }

  for (const p of financials.insurancePolicies) {
    const value = Number(p.cash_value) || 0;
    if (value <= 0) continue;
    rows.push({
      description: `${p.policy_type || "Insurance"} (${p.carrier || "policy"})`,
      value,
      beneficiaryDesignation: p.primary_beneficiary ?? null,
    });
  }

  return rows;
}
