// Scorecard rows: current vs. target, scored 1-5. Ported directly from the
// Review Agent prototype's calc/drift.py.
//
// Scope boundary, deliberately preserved from the prototype: only two of
// the four Governance Audit elements have a clear enough deterministic
// basis to auto-score here:
//
// - "Capital Infrastructure & Asset Allocation" -- numeric drift between
//   current and target Income/Equity split, plus whether the Keep meets
//   its liquidity floor.
// - "Personal Estate & Incapacity Alignment" -- driven directly by
//   governance-audit-estate.ts's deadlock finding.
//
// The other two elements the sample audit scores ("Matrimonial Property
// Insulation" and "Environmental Noise & Behavioral Boundaries") are
// fundamentally judgment calls about account ownership patterns and
// spending/withdrawal behavior that this pipeline doesn't have a reliable
// deterministic basis to score -- see manualReviewRow() below, which
// produces a clearly-flagged placeholder row rather than fabricating a
// number.

export interface ScorecardRow {
  elementName: string;
  target: string; // e.g. "5 / 5"
  currentScore: number;
  maxScore: number; // default 5
  status: string; // e.g. "Optimized", "Siloed", "Charter Aligned"
}

export const CAPITAL_INFRASTRUCTURE = "Capital Infrastructure & Asset Allocation";
export const ESTATE_INCAPACITY_ALIGNMENT = "Personal Estate & Incapacity Alignment";

export function scoreCapitalInfrastructure(params: {
  currentEquityPct: number;
  targetEquityPct: number;
  keepTotal: number;
  keepFloor: number | null;
}): ScorecardRow {
  const drift = Math.abs(params.currentEquityPct - params.targetEquityPct);
  const keepMet = params.keepFloor === null || params.keepTotal >= params.keepFloor;

  let score: number;
  let status: string;
  if (drift <= 5 && keepMet) {
    score = 5;
    status = "Optimized";
  } else if (drift <= 10 && keepMet) {
    score = 4;
    status = "Optimized";
  } else if (drift <= 15) {
    score = 3;
    status = "Minor Drift";
  } else if (drift <= 25) {
    score = 2;
    status = "Drifting";
  } else {
    score = 1;
    status = "Structurally Misaligned";
  }

  if (!keepMet && score > 2) {
    score = 2;
    status = "Liquidity Floor Breached";
  }

  return { elementName: CAPITAL_INFRASTRUCTURE, target: "5 / 5", currentScore: score, maxScore: 5, status };
}

export function scoreEstateAlignment(estateResult: { hasDeadlock: boolean; atRiskIlliquidAssets: string[] }): ScorecardRow {
  let score: number;
  let status: string;
  if (!estateResult.hasDeadlock) {
    score = 5;
    status = "Charter Aligned";
  } else if (estateResult.atRiskIlliquidAssets.length > 0) {
    score = 2;
    status = "Siloed";
  } else {
    score = 3;
    status = "Cash Deficit";
  }

  return { elementName: ESTATE_INCAPACITY_ALIGNMENT, target: "5 / 5", currentScore: score, maxScore: 5, status };
}

/**
 * Placeholder for elements this pipeline doesn't auto-score (see module
 * comment above). currentScore is left at 0 (not a real score) so it's
 * visually obvious in the draft review summary that the advisor needs to
 * fill this in, rather than silently defaulting to a passing score.
 */
export function manualReviewRow(elementName: string): ScorecardRow {
  return {
    elementName,
    target: "5 / 5",
    currentScore: 0,
    maxScore: 5,
    status: "PENDING ADVISOR REVIEW -- not auto-scored, see review summary",
  };
}
