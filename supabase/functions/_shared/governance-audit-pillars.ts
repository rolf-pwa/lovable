// Aggregate a household's real accounts into Charter-defined pillar
// totals. Adapted, not ported verbatim, from the Review Agent prototype's
// calc/pillars.py: the prototype re-derives pillar totals from a freshly
// AI-extracted account statement matched against the Charter's own
// protected-accounts registry (splitting a Vineyard-assigned account's
// fund holdings into Income/Equity along the way). This CRM's own "4
// Storehouses" concept (storehouses.storehouse_number 1-4, already
// labeled Liquidity/Strategic/Philanthropic/Legacy Reserve elsewhere in
// this app) *is* the same pillar model, just expressed as "which
// table/storehouse a real account already lives in" rather than a
// Charter-defined registry re-derived each quarter -- so pillar totals
// here are a direct remap of sovereignty-diagnostics.ts's already-computed
// gatherHouseholdFinancials() output, not a re-derivation. The fund-level
// Income/Equity split the prototype performs within a Vineyard account has
// no equivalent here: this CRM doesn't track fund-level asset-class detail
// per account, only each account's current value.

export interface PillarTotals {
  vineyard: number;
  keep: number;
  armoury: number;
  granary: number;
  legacyVault: number;
  /** Holding Tank -- accounts not yet assigned to a pillar (the direct analogue of the prototype's per-account "unassigned" warning, at the whole-bucket level since that's exactly what the Holding Tank already represents in this CRM). */
  unassigned: number;
}

export function computePillarTotals(financials: {
  totalVineyard: number;
  storehouseReserves: { liquidity: number; strategic: number; philanthropic: number; legacy: number };
  totalHoldingTank: number;
}): PillarTotals {
  return {
    vineyard: financials.totalVineyard,
    keep: financials.storehouseReserves.liquidity,
    armoury: financials.storehouseReserves.strategic,
    granary: financials.storehouseReserves.philanthropic,
    legacyVault: financials.storehouseReserves.legacy,
    unassigned: financials.totalHoldingTank,
  };
}

export function pillarWarnings(totals: PillarTotals): string[] {
  if (totals.unassigned <= 0) return [];
  return [
    `$${totals.unassigned.toLocaleString("en-CA", { maximumFractionDigits: 0 })} sits in the Holding Tank, not yet assigned to a pillar -- ` +
      `confirm with the advisor whether these accounts should be moved into a Storehouse/the Vineyard or are out of scope for this review.`,
  ];
}
