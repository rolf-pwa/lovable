// Georgia 2.0 — pure derivation logic (unit-testable)

export type Domain = "corporate" | "personal";
export type Answer = "yes" | "no" | "unsure" | null;

export type CorporateCatalyst = "founder_exit" | "growth_stage_founder";
export type PersonalCatalyst =
  | "inheritance"
  | "executive_exit"
  | "divorce_restructuring"
  | "insurance_settlement"
  | "sudden_windfall";
export type Catalyst = CorporateCatalyst | PersonalCatalyst;

export interface CorporateAnswers {
  bc_registered: Answer;
  lcge_used: Answer;
  holdco_active: Answer;
}
export interface PersonalAnswers {
  cross_border: Answer;
  probate_active: Answer;
  trusts_exist: Answer;
}
export type Answers = CorporateAnswers | PersonalAnswers;

export const VELVET_ROPE = 1_000_000;
export const SCALE_MIN = 100_000;
export const SCALE_MAX = 10_000_000;
export const SCALE_STEP = 100_000;

export const CATALYST_LABELS: Record<Catalyst, string> = {
  founder_exit: "Founder Exit",
  growth_stage_founder: "Growth Stage Founder",
  inheritance: "Inheritance",
  executive_exit: "Executive Exit",
  divorce_restructuring: "Divorce Restructuring",
  insurance_settlement: "Insurance Settlement",
  sudden_windfall: "Sudden Windfall",
};

export const CATALYST_DESCRIPTIONS: Record<Catalyst, string> = {
  founder_exit: "M&A, liquidation, or third-party transitions.",
  growth_stage_founder: "Restructuring, venture influx, or prepping exit.",
  inheritance: "Legacy transfers, estate & trust windfalls.",
  executive_exit: "Vesting options, severance packages.",
  divorce_restructuring: "Matrimonial division, asset splitting.",
  insurance_settlement: "Personal injury or corporate critical illness payouts.",
  sudden_windfall: "Outlier capital events, sudden crypto liquidations.",
};

export const CORPORATE_CATALYSTS: CorporateCatalyst[] = [
  "founder_exit",
  "growth_stage_founder",
];
export const PERSONAL_CATALYSTS: PersonalCatalyst[] = [
  "inheritance",
  "executive_exit",
  "divorce_restructuring",
  "insurance_settlement",
  "sudden_windfall",
];

export type Pathway =
  | "vfo_stabilization"
  | "vfo_catalyst_guide"
  | "standalone_build"
  | "academy_pass";

export interface DerivedResult {
  qualified: boolean;
  fee: number | null; // Standalone build fee (null for VFO path)
  pathwayHeadline: string;
}

export function deriveResult(domain: Domain, scale: number): DerivedResult {
  if (scale >= VELVET_ROPE) {
    return {
      qualified: true,
      fee: null,
      pathwayHeadline: "Scale qualifies for full ongoing VFO Oversight.",
    };
  }
  return {
    qualified: false,
    fee: domain === "corporate" ? 10_000 : 5_000,
    pathwayHeadline: "VFO Limit Met. Standalone setup & Academy pathways unlocked.",
  };
}

// ---- Risk gauges (0–100) ---------------------------------------------------

function clamp(n: number): number {
  return Math.max(0, Math.min(100, Math.round(n)));
}

export interface Gauges {
  taxDragRisk: number;
  structureSafety: number;
  noiseStrain: number;
  readiness: number;
}

export function computeGauges(
  domain: Domain | null,
  catalyst: Catalyst | null,
  answers: Partial<CorporateAnswers & PersonalAnswers>,
  scale: number
): Gauges {
  // Tax Drag
  let tax = 20;
  if (domain === "corporate") {
    if (answers.lcge_used === "no") tax += 45;
    if (answers.lcge_used === "unsure") tax += 25;
    if (answers.holdco_active === "no") tax += 20;
    if (answers.bc_registered === "no") tax += 10;
  } else if (domain === "personal") {
    if (answers.probate_active === "yes") tax += 40;
    if (answers.probate_active === "unsure") tax += 20;
    if (answers.cross_border === "yes") tax += 25;
    if (answers.trusts_exist === "no") tax += 15;
  }

  // Structure Safety (higher = safer)
  let structure = 40;
  if (domain === "corporate") {
    if (answers.holdco_active === "yes") structure += 35;
    if (answers.holdco_active === "no") structure -= 20;
    if (answers.bc_registered === "yes") structure += 15;
    if (answers.lcge_used === "yes") structure += 15;
  } else if (domain === "personal") {
    if (answers.trusts_exist === "yes") structure += 35;
    if (answers.trusts_exist === "no") structure -= 20;
    if (answers.probate_active === "no") structure += 15;
    if (answers.cross_border === "no") structure += 10;
  }

  // Noise Strain
  let noise = 25;
  if (catalyst === "inheritance") noise += 40;
  if (catalyst === "divorce_restructuring") noise += 55;
  if (catalyst === "sudden_windfall") noise += 45;
  if (catalyst === "insurance_settlement") noise += 35;
  if (catalyst === "founder_exit") noise += 30;
  if (catalyst === "executive_exit") noise += 25;
  if (catalyst === "growth_stage_founder") noise += 15;

  // Readiness (higher = more ready)
  let readiness = 50;
  const unsureCount = Object.values(answers).filter((a) => a === "unsure").length;
  readiness -= unsureCount * 15;
  if (scale >= VELVET_ROPE) readiness += 15;
  if (scale >= 5_000_000) readiness += 10;
  if (domain && catalyst) readiness += 10;

  return {
    taxDragRisk: clamp(tax),
    structureSafety: clamp(structure),
    noiseStrain: clamp(noise),
    readiness: clamp(readiness),
  };
}

// ---- Timeline milestones ---------------------------------------------------

export interface Milestone {
  label: string;
  detail: string;
}

export const CATALYST_TIMELINES: Record<Catalyst, Milestone[]> = {
  founder_exit: [
    { label: "LOI", detail: "Letter of intent signed" },
    { label: "Diligence", detail: "Financial & legal review" },
    { label: "Close", detail: "Transaction executes" },
    { label: "Stabilize", detail: "90-day sovereignty setup" },
  ],
  growth_stage_founder: [
    { label: "Assess", detail: "Corporate structure review" },
    { label: "Restructure", detail: "Optimize HoldCo & shares" },
    { label: "Deploy", detail: "Capital allocation" },
    { label: "Govern", detail: "Ongoing oversight" },
  ],
  inheritance: [
    { label: "Notice", detail: "Estate initiates" },
    { label: "Probate", detail: "Court validation" },
    { label: "Transfer", detail: "Assets distributed" },
    { label: "Steward", detail: "Long-term stewardship" },
  ],
  executive_exit: [
    { label: "Vest", detail: "Options & equity crystallize" },
    { label: "Sever", detail: "Package finalized" },
    { label: "Deploy", detail: "Tax-aware allocation" },
    { label: "Stabilize", detail: "New income architecture" },
  ],
  divorce_restructuring: [
    { label: "File", detail: "Separation initiated" },
    { label: "Divide", detail: "Asset & debt split" },
    { label: "Rebuild", detail: "New financial foundation" },
    { label: "Protect", detail: "Fresh estate plan" },
  ],
  insurance_settlement: [
    { label: "Claim", detail: "Payout approved" },
    { label: "Receive", detail: "Funds land" },
    { label: "Shelter", detail: "Tax & structure protection" },
    { label: "Deploy", detail: "Long-term plan" },
  ],
  sudden_windfall: [
    { label: "Land", detail: "Capital arrives" },
    { label: "Pause", detail: "90-day quiet period" },
    { label: "Design", detail: "Sovereignty blueprint" },
    { label: "Deploy", detail: "Structured deployment" },
  ],
};

// ---- BC context notes ------------------------------------------------------

export function bcContextNotes(
  domain: Domain | null,
  catalyst: Catalyst | null,
  answers: Partial<CorporateAnswers & PersonalAnswers>
): string[] {
  const notes: string[] = [];
  if (domain === "corporate") {
    notes.push(
      "BC-registered CCPCs may access the Lifetime Capital Gains Exemption (LCGE): $1,016,836 (2024) per shareholder."
    );
    if (answers.holdco_active !== "yes") {
      notes.push("Without an active HoldCo, retained earnings face full corporate + personal tax on distribution.");
    }
    if (answers.lcge_used === "no" || answers.lcge_used === "unsure") {
      notes.push("Multiplying the LCGE through family trusts requires 24-month share holding rules — plan early.");
    }
  }
  if (domain === "personal") {
    notes.push(
      "BC Probate fees: ~1.4% on estates over $50,000. Assets in joint tenancy or trust may bypass probate."
    );
    if (answers.cross_border === "yes") {
      notes.push("Cross-border exposure triggers US estate tax at >$13.6M and PFIC treatment on Canadian ETFs.");
    }
    if (catalyst === "divorce_restructuring") {
      notes.push("BC Family Law Act: family property presumed 50/50 unless a cohabitation or marriage agreement applies.");
    }
    if (answers.trusts_exist !== "yes") {
      notes.push("Alter-ego, joint partner, or family trusts can shield BC assets from probate and provide governance continuity.");
    }
  }
  if (notes.length === 0) {
    notes.push("Complete Steps 1–3 to reveal your BC-specific context.");
  }
  return notes;
}

export function formatCAD(n: number): string {
  return new Intl.NumberFormat("en-CA", {
    style: "currency",
    currency: "CAD",
    maximumFractionDigits: 0,
  }).format(n);
}
