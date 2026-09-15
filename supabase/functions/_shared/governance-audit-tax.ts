// Deterministic tax estimates from governance-audit-tax-config.ts, ported
// directly from the Review Agent prototype's calc/tax.py.
//
// Dollar figures for terminal tax / capital gains exposure are computed
// from the maintained config table, never left to LLM arithmetic. Mirrors
// how the real Governance Audit treats a fully-deregistering RRSP/LIRA at
// death: taxed at the province's flat top marginal rate rather than a
// bracket-by-bracket calc, since a large lump sum added to a terminal-year
// return typically pushes the whole amount (or nearly all of it) into the
// top bracket anyway -- this is a simplifying convention, not a precise
// terminal-return calculation, and should be labeled as an estimate
// wherever it's surfaced.

import { TAX_TABLES, type TaxBracket } from "./governance-audit-tax-config.ts";

function round2(n: number): number {
  return Math.round((n + Number.EPSILON) * 100) / 100;
}

/** Bracket-by-bracket marginal rate lookup (not currently used by the terminal-tax convention below, but available for other partial-income calculations). */
export function marginalRateAt(taxableIncome: number, brackets: TaxBracket[]): number {
  for (const b of brackets) {
    if (b.upTo === null || taxableIncome <= b.upTo) return b.rate;
  }
  return brackets[brackets.length - 1].rate;
}

export function combinedTopMarginalRate(provinceCode: string): number {
  const province = TAX_TABLES.provinces[provinceCode];
  if (!province) {
    throw new Error(
      `No tax bracket table for province "${provinceCode}" in governance-audit-tax-config.ts -- add it before running this calculation for a client in that province.`,
    );
  }
  if (typeof province.combinedTopMarginalRate === "number") return province.combinedTopMarginalRate;
  const fedTop = TAX_TABLES.federal.brackets[TAX_TABLES.federal.brackets.length - 1].rate;
  const provTop = province.brackets[province.brackets.length - 1].rate;
  return fedTop + provTop;
}

/** Full deregistration of RRSP/RRIF/LIRA at death, taxed as ordinary income at the province's top marginal rate (convention used by the real sample audit for a high-registered-balance estate). */
export function estimateTerminalTaxOnRegistered(registeredTotal: number, provinceCode: string): number {
  return round2(registeredTotal * combinedTopMarginalRate(provinceCode));
}

export function estimateCapitalGainsTax(unrealizedGain: number, provinceCode: string): number {
  const taxableGain = unrealizedGain * TAX_TABLES.capitalGainsInclusionRate;
  return round2(taxableGain * combinedTopMarginalRate(provinceCode));
}
