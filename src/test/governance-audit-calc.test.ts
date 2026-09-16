// Cross-checks the Quarterly Governance Audit calc port (Phase 3) against
// the exact input/output pairs from the Review Agent prototype's own
// tests/test_calc_*.py, to confirm the TS port matches the Python
// original's behavior, not just superficially. The modules under test
// live in supabase/functions/_shared/ (Deno edge function shared code) but
// are dependency-free, portable TS with no Deno-specific APIs, so they run
// fine here under Vitest.
import { describe, expect, it } from "vitest";
import {
  combinedTopMarginalRate,
  estimateCapitalGainsTax,
  estimateTerminalTaxOnRegistered,
} from "../../supabase/functions/_shared/governance-audit-tax";
import {
  analyzeEstateLiquidity,
  estateAssetSourceRowsFromFinancials,
  estateAssetsFromAccounts,
  type EstateAsset,
} from "../../supabase/functions/_shared/governance-audit-estate";
import { selectTarget } from "../../supabase/functions/_shared/governance-audit-targets";
import {
  manualReviewRow,
  scoreCapitalInfrastructure,
  scoreEstateAlignment,
} from "../../supabase/functions/_shared/governance-audit-drift";
import { computePillarTotals, pillarWarnings } from "../../supabase/functions/_shared/governance-audit-pillars";

// -- test_calc_tax.py --

describe("governance-audit-tax", () => {
  it("AB top marginal rate is 48%", () => {
    expect(combinedTopMarginalRate("AB")).toBe(0.48);
  });

  it("terminal tax matches the real audit figure", () => {
    // Real Lively-Lambert Governance Audit: RRSP $137,583.82 + LIRA $75,624.00
    // = $213,207.82 registered total -> $102,339.75 in terminal taxes at
    // Alberta's 48% top marginal rate.
    expect(estimateTerminalTaxOnRegistered(213207.82, "AB")).toBe(102339.75);
  });

  it("capital gains tax uses 50% inclusion", () => {
    // $56,659.1667 unrealized gain * 50% inclusion * 48% top rate = $13,598.20
    expect(estimateCapitalGainsTax(56659.1667, "AB")).toBe(13598.20);
  });

  it("unknown province throws", () => {
    expect(() => estimateTerminalTaxOnRegistered(1000, "ZZ")).toThrow();
  });
});

// -- test_calc_estate.py --

describe("governance-audit-estate", () => {
  it("deadlock matches the real audit figures", () => {
    const assets: EstateAsset[] = [
      { description: "Segregated funds (direct beneficiary)", value: 607572.73, passesViaBeneficiaryDesignation: true },
      { description: "RRSP + LIRA (direct beneficiary)", value: 213207.82, passesViaBeneficiaryDesignation: true },
    ];
    const result = analyzeEstateLiquidity(assets, 183177.00, 102339.75 + 13598.20, [
      "primary residence (spousal life interest)",
    ]);
    expect(result.totalEstateLiquidAssets).toBe(0);
    expect(result.surplusOrDeficit).toBeCloseTo(-299114.95, 2);
    expect(result.hasDeadlock).toBe(true);
    expect(result.atRiskIlliquidAssets).toEqual(["primary residence (spousal life interest)"]);
  });

  it("no deadlock when the estate has liquid assets", () => {
    const assets: EstateAsset[] = [
      { description: "Estate residue non-reg account", value: 500000, passesViaBeneficiaryDesignation: false },
    ];
    const result = analyzeEstateLiquidity(assets, 100000, 50000);
    expect(result.hasDeadlock).toBe(false);
    expect(result.surplusOrDeficit).toBe(350000);
  });
});

// -- estateAssetsFromAccounts / estateAssetSourceRowsFromFinancials: not in
// the prototype (this CRM sources beneficiary data from real, structured
// account fields instead of a re-extracted statement) -- adapted from the
// prototype's own assets_from_statements() classification rule.

describe("governance-audit-estate: estateAssetsFromAccounts", () => {
  it("treats a named beneficiary other than Estate/SEE FILE as bypassing probate", () => {
    const { assets, warnings } = estateAssetsFromAccounts([
      { description: "TFSA (1820399311)", value: 50000, beneficiaryDesignation: "Philip Lambert" },
    ]);
    expect(assets).toEqual([{ description: "TFSA (1820399311)", value: 50000, passesViaBeneficiaryDesignation: true }]);
    expect(warnings).toEqual([]);
  });

  it("treats Estate, SEE FILE, and empty designations as passing through the estate, each with a warning except a clean 'Estate'", () => {
    const { assets, warnings } = estateAssetsFromAccounts([
      { description: "RESP", value: 10000, beneficiaryDesignation: "Estate" },
      { description: "RRSP", value: 20000, beneficiaryDesignation: "SEE FILE" },
      { description: "Non-Reg", value: 30000, beneficiaryDesignation: null },
    ]);
    expect(assets.every((a) => !a.passesViaBeneficiaryDesignation)).toBe(true);
    // "Estate" is a positive, disclosed designation -- no warning needed.
    expect(warnings.some((w) => w.includes("RESP"))).toBe(false);
    expect(warnings.some((w) => w.includes("RRSP"))).toBe(true);
    expect(warnings.some((w) => w.includes("Non-Reg"))).toBe(true);
  });
});

describe("governance-audit-estate: estateAssetSourceRowsFromFinancials", () => {
  it("maps real CRM rows into estate-asset source rows, skipping zero/empty balances", () => {
    const rows = estateAssetSourceRowsFromFinancials({
      vineyardAccounts: [
        { account_name: "Growth Portfolio", current_value: 100000, beneficiary_designation: "Jane Doe" },
        { account_name: "Empty Account", current_value: 0, beneficiary_designation: null },
      ],
      storehouses: [
        { asset_type: "GIC Ladder", label: null, current_value: 48000, beneficiary_designation: "Estate" },
      ],
      insurancePolicies: [
        { policy_type: "Segregated Fund", carrier: "iA Financial", cash_value: 607572.73, primary_beneficiary: "Philip Lambert" },
      ],
    });
    expect(rows).toEqual([
      { description: "Growth Portfolio", value: 100000, beneficiaryDesignation: "Jane Doe" },
      { description: "GIC Ladder", value: 48000, beneficiaryDesignation: "Estate" },
      { description: "Segregated Fund (iA Financial)", value: 607572.73, beneficiaryDesignation: "Philip Lambert" },
    ]);
  });
});

// -- test_calc_targets.py --

describe("governance-audit-targets", () => {
  const profile = (points: number, category: string) => ({ totalPoints: points, profileCategory: category });

  it("growth band defaults to the config midpoint", () => {
    const result = selectTarget(profile(90, "Growth"), null);
    expect(result.equityPctRange).toEqual([60, 80]);
    expect(result.targetEquityPct).toBe(70); // config midpoint
    expect(result.isAdvisorOverride).toBe(false);
  });

  it("advisor override takes precedence", () => {
    const result = selectTarget(profile(90, "Growth"), null, { advisorTargetEquityPct: 80 });
    expect(result.targetEquityPct).toBe(80);
    expect(result.targetIncomePct).toBe(20);
    expect(result.isAdvisorOverride).toBe(true);
  });

  it("charter tone is surfaced in assumptions, not silently applied", () => {
    const tone = "Moderately growth-oriented but hedged toward durability, not aggressive.";
    const result = selectTarget(profile(90, "Growth"), tone);
    expect(result.assumptions.some((a) => a.includes(tone))).toBe(true);
    // Tone text is surfaced for the advisor, but does NOT silently change the numeric target:
    expect(result.targetEquityPct).toBe(70);
  });

  it("unknown profile category throws", () => {
    expect(() => selectTarget(profile(90, "Not A Real Category"), null)).toThrow();
  });
});

// -- drift.py has no dedicated test file in the prototype; these confirm
// the ported scoring ladder behaves as documented --

describe("governance-audit-drift", () => {
  it("scores 5/5 Optimized when drift is small and the Keep floor is met", () => {
    const row = scoreCapitalInfrastructure({ currentEquityPct: 68, targetEquityPct: 70, keepTotal: 50000, keepFloor: 48000 });
    expect(row.currentScore).toBe(5);
    expect(row.status).toBe("Optimized");
  });

  it("caps the score at 2 when the Keep floor is breached, even with low drift", () => {
    const row = scoreCapitalInfrastructure({ currentEquityPct: 70, targetEquityPct: 70, keepTotal: 10000, keepFloor: 48000 });
    expect(row.currentScore).toBe(2);
    expect(row.status).toBe("Liquidity Floor Breached");
  });

  it("scores estate alignment 5/5 Charter Aligned when there's no deadlock", () => {
    const row = scoreEstateAlignment({ hasDeadlock: false, atRiskIlliquidAssets: [] });
    expect(row.currentScore).toBe(5);
    expect(row.status).toBe("Charter Aligned");
  });

  it("scores estate alignment 2/5 Siloed when at-risk illiquid assets exist under a deadlock", () => {
    const row = scoreEstateAlignment({ hasDeadlock: true, atRiskIlliquidAssets: ["primary residence"] });
    expect(row.currentScore).toBe(2);
    expect(row.status).toBe("Siloed");
  });

  it("manualReviewRow flags a placeholder, never a passing score", () => {
    const row = manualReviewRow("Matrimonial Property Insulation");
    expect(row.currentScore).toBe(0);
    expect(row.status).toContain("PENDING ADVISOR REVIEW");
  });
});

describe("governance-audit-pillars", () => {
  it("remaps CRM financials directly into pillar totals", () => {
    const totals = computePillarTotals({
      totalVineyard: 100000,
      storehouseReserves: { liquidity: 48000, strategic: 20000, philanthropic: 5000, legacy: 15000 },
      totalHoldingTank: 3000,
    });
    expect(totals).toEqual({ vineyard: 100000, keep: 48000, armoury: 20000, granary: 5000, legacyVault: 15000, unassigned: 3000 });
  });

  it("warns only when the Holding Tank has unassigned assets", () => {
    expect(pillarWarnings({ vineyard: 0, keep: 0, armoury: 0, granary: 0, legacyVault: 0, unassigned: 0 })).toEqual([]);
    expect(pillarWarnings({ vineyard: 0, keep: 0, armoury: 0, granary: 0, legacyVault: 0, unassigned: 500 }).length).toBe(1);
  });
});
