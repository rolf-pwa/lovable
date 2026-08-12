// sovereignty-diagnostics.ts
// Deterministic (non-AI) financial/document diagnostics for the household-track
// Sovereignty Survey Stabilization Map. Pure functions + Supabase queries only —
// no HTTP/CORS handling — so this stays independently testable and reusable.
//
// Numbers here are computed in code, never by the AI: the generation edge
// function hands these figures to Vertex as read-only facts and only asks it
// to draft narrative text around them (situation summary, action plan prose).

// deno-lint-ignore no-explicit-any
type SupabaseClient = any;

export type TrackType = "personal" | "corporate";

export interface DiagnosticInputs {
  assumed_return_rate_pct?: number;
  advisor_fee_rate_pct?: number;
  benchmark_fee_rate_pct?: number;
  corporate_passive_income_annual?: number;
  active_operational_assets_value?: number;
  usa_last_reviewed_date?: string | null;
  usa_funded?: boolean | null;
  will_status?: "missing" | "outdated" | "current" | null;
  poa_status?: "missing" | "current" | null;
  beneficiary_coordination_status?: "uncoordinated" | "coordinated" | null;
}

export interface FeeDragResult {
  year5: number;
  year10: number;
  year20: number;
  fee_drag_pct: number;
}

/** True when the household has any active shareholder — i.e. owns a corporation. */
export function inferTrackType(shareholders: { corporation_id: string }[]): TrackType {
  return shareholders.length > 0 ? "corporate" : "personal";
}

/** Compounded Fee Drag = AUM × [(1+r)^t − (1+r−feeDrag)^t] */
export function computeFeeDrag(aum: number, inputs: DiagnosticInputs): FeeDragResult {
  const r = (inputs.assumed_return_rate_pct ?? 6) / 100;
  const advisorFee = (inputs.advisor_fee_rate_pct ?? 0) / 100;
  const benchmarkFee = (inputs.benchmark_fee_rate_pct ?? 0) / 100;
  const feeDrag = Math.max(0, advisorFee - benchmarkFee);
  const at = (t: number) => aum * (Math.pow(1 + r, t) - Math.pow(1 + r - feeDrag, t));
  return {
    year5: Math.round(at(5)),
    year10: Math.round(at(10)),
    year20: Math.round(at(20)),
    fee_drag_pct: Math.round(feeDrag * 10000) / 100,
  };
}

/** SBD Clawback = min($500,000, 5 × max(0, passiveIncome − $50,000)) */
export function computeSbdClawback(passiveIncomeAnnual: number): number {
  return Math.min(500_000, Math.max(0, 5 * (passiveIncomeAnnual - 50_000)));
}

/** Active Asset Ratio = activeAssets / totalCorpAssets — must be ≥90% for LCGE eligibility. */
export function computeActiveAssetRatio(
  activeAssets: number,
  totalCorpAssets: number,
): { ratio: number; belowLcgeThreshold: boolean } {
  const ratio = totalCorpAssets > 0 ? activeAssets / totalCorpAssets : 0;
  return { ratio: Math.round(ratio * 10000) / 10000, belowLcgeThreshold: ratio < 0.9 };
}

/** A USA is stale if no review date is on file, or it was last reviewed >2 years ago. */
export function computeUsaStaleness(
  usaLastReviewedDate: string | null | undefined,
): { onFile: boolean; isStale: boolean; ageYears: number | null } {
  if (!usaLastReviewedDate) return { onFile: false, isStale: true, ageYears: null };
  const reviewed = new Date(usaLastReviewedDate);
  if (Number.isNaN(reviewed.getTime())) return { onFile: false, isStale: true, ageYears: null };
  const ageYears = (Date.now() - reviewed.getTime()) / (365.25 * 24 * 60 * 60 * 1000);
  return { onFile: true, isStale: ageYears > 2, ageYears: Math.round(ageYears * 10) / 10 };
}

export interface DocumentReadiness {
  percent: number;
  criticalTotal: number;
  criticalSatisfied: number;
  missingCritical: string[];
  missingRecommended: string[];
}

/**
 * Mirrors the readiness calculation in intake-portal/index.ts's handleInhouseManifest
 * (intake_checklist_templates matched against intake_classifications by household).
 */
export async function computeDocumentReadiness(
  admin: SupabaseClient,
  householdId: string,
): Promise<DocumentReadiness> {
  const [{ data: templates }, { data: classifications }] = await Promise.all([
    admin
      .from("intake_checklist_templates")
      .select("id, name, category, requirement")
      .eq("is_active", true)
      .order("sort_order"),
    admin
      .from("intake_classifications")
      .select("id, file_name, predicted_category, status, matched_checklist_template_id")
      .eq("household_id", householdId),
  ]);

  const activeTemplates = (templates ?? []) as any[];
  const classRows = (classifications ?? []) as any[];

  const matchedByTemplate = new Map<string, any[]>();
  for (const cls of classRows) {
    const lowerFile = String(cls.file_name || "").toLowerCase();
    let best: any = null;
    let bestScore = 0;
    for (const t of activeTemplates) {
      const nameTokens = String(t.name).toLowerCase().split(/\s+/);
      let score = 0;
      for (const token of nameTokens) {
        if (token.length > 2 && lowerFile.includes(token)) score += 1;
      }
      if (String(cls.predicted_category).toLowerCase() === String(t.name).toLowerCase()) score += 5;
      if (cls.matched_checklist_template_id === t.id) score += 10;
      if (score > bestScore) {
        bestScore = score;
        best = t;
      }
    }
    if (best) {
      const list = matchedByTemplate.get(best.id) ?? [];
      list.push(cls);
      matchedByTemplate.set(best.id, list);
    }
  }

  const checklist = activeTemplates.map((t) => {
    const matches = matchedByTemplate.get(t.id) ?? [];
    const filed = matches.some((c) => c.status === "filed");
    return {
      name: t.name as string,
      requirement: t.requirement === "required" ? "required" : "optional",
      filed,
    };
  });

  const requiredItems = checklist.filter((i) => i.requirement === "required");
  const requiredSatisfied = requiredItems.filter((i) => i.filed).length;
  const totalItems = checklist.length;
  const satisfiedTotal = checklist.filter((i) => i.filed).length;
  const percent = totalItems > 0 ? Math.round((satisfiedTotal / totalItems) * 100) : 0;

  return {
    percent,
    criticalTotal: requiredItems.length,
    criticalSatisfied: requiredSatisfied,
    missingCritical: requiredItems.filter((i) => !i.filed).map((i) => i.name),
    missingRecommended: checklist.filter((i) => i.requirement !== "required" && !i.filed).map((i) => i.name),
  };
}

export interface HouseholdFinancials {
  householdLabel: string;
  familyName: string;
  members: { id: string; first_name: string; last_name: string; family_role: string | null }[];
  totalAum: number;
  vineyardAccounts: any[];
  storehouses: any[];
  corporations: any[];
  shareholders: any[];
  insurancePolicies: any[];
  totalCorpAssets: number;
}

/** Mirrors the financial-data gathering in HouseholdDetail.tsx's fetchData(). */
export async function gatherHouseholdFinancials(
  admin: SupabaseClient,
  householdId: string,
): Promise<HouseholdFinancials> {
  const { data: household } = await admin
    .from("households")
    .select("id, label, family_id")
    .eq("id", householdId)
    .maybeSingle();

  const { data: family } = household?.family_id
    ? await admin.from("families").select("name").eq("id", household.family_id).maybeSingle()
    : { data: null };

  const { data: contacts } = await admin
    .from("contacts")
    .select("id, first_name, last_name, family_role")
    .eq("household_id", householdId);

  const members = (contacts ?? []) as HouseholdFinancials["members"];
  const memberIds = members.map((c) => c.id);

  if (memberIds.length === 0) {
    return {
      householdLabel: household?.label ?? "Household",
      familyName: family?.name ?? "Family",
      members: [],
      totalAum: 0,
      vineyardAccounts: [],
      storehouses: [],
      corporations: [],
      shareholders: [],
      insurancePolicies: [],
      totalCorpAssets: 0,
    };
  }

  const [{ data: vine }, { data: store }, { data: shareholders }] = await Promise.all([
    admin.from("vineyard_accounts").select("*").in("contact_id", memberIds),
    admin.from("storehouses").select("*").in("contact_id", memberIds),
    admin
      .from("shareholders")
      .select("contact_id, corporation_id, ownership_percentage, share_class, role_title")
      .in("contact_id", memberIds)
      .eq("is_active", true),
  ]);

  const vineyardAccounts = vine ?? [];
  const storehouses = store ?? [];
  const shareholderRows = shareholders ?? [];

  let corporations: any[] = [];
  let totalCorpAssets = 0;
  let corpIds: string[] = [];
  if (shareholderRows.length > 0) {
    corpIds = [...new Set(shareholderRows.map((s: any) => s.corporation_id))];
    const [{ data: corps }, { data: corpVineyard }] = await Promise.all([
      admin.from("corporations").select("id, name, corporation_type, jurisdiction").in("id", corpIds),
      admin.from("corporate_vineyard_accounts").select("*").in("corporation_id", corpIds),
    ]);
    corporations = (corps ?? []).map((corp: any) => {
      const accounts = (corpVineyard ?? []).filter((v: any) => v.corporation_id === corp.id);
      return {
        ...corp,
        shareholders: shareholderRows.filter((s: any) => s.corporation_id === corp.id),
        vineyard_accounts: accounts,
        total_assets: accounts.reduce((sum: number, v: any) => sum + (Number(v.current_value) || 0), 0),
      };
    });
    totalCorpAssets = corporations.reduce((sum, c) => sum + c.total_assets, 0);
  }

  const { data: ins } = await admin
    .from("insurance_policies")
    .select("*")
    .or(`contact_id.in.(${memberIds.join(",")})${corpIds.length ? `,corporation_id.in.(${corpIds.join(",")})` : ""}`);

  const totalAum =
    vineyardAccounts.reduce((sum: number, a: any) => sum + (Number(a.current_value) || 0), 0) +
    storehouses.reduce((sum: number, s: any) => sum + (Number(s.current_value) || 0), 0);

  return {
    householdLabel: household?.label ?? "Household",
    familyName: family?.name ?? "Family",
    members,
    totalAum,
    vineyardAccounts,
    storehouses,
    corporations,
    shareholders: shareholderRows,
    insurancePolicies: ins ?? [],
    totalCorpAssets,
  };
}

export interface SovereigntyDiagnostics {
  track_type: TrackType;
  document_readiness: DocumentReadiness;
  fee_drag?: FeeDragResult;
  sbd_clawback?: number;
  active_asset_ratio?: { ratio: number; belowLcgeThreshold: boolean };
  usa_staleness?: { onFile: boolean; isStale: boolean; ageYears: number | null };
  estate_hygiene?: {
    will_status: DiagnosticInputs["will_status"];
    poa_status: DiagnosticInputs["poa_status"];
    beneficiary_coordination_status: DiagnosticInputs["beneficiary_coordination_status"];
  };
  aum: number;
  household_label: string;
  family_name: string;
}

/** Orchestrator: gathers real data, infers track type, computes the applicable formulas. */
export async function computeSovereigntyDiagnostics(
  admin: SupabaseClient,
  householdId: string,
  inputs: DiagnosticInputs,
): Promise<{ track_type: TrackType; diagnostics: SovereigntyDiagnostics; financials: HouseholdFinancials }> {
  const [financials, documentReadiness] = await Promise.all([
    gatherHouseholdFinancials(admin, householdId),
    computeDocumentReadiness(admin, householdId),
  ]);

  const trackType = inferTrackType(financials.shareholders);

  const diagnostics: SovereigntyDiagnostics = {
    track_type: trackType,
    document_readiness: documentReadiness,
    aum: financials.totalAum,
    household_label: financials.householdLabel,
    family_name: financials.familyName,
  };

  if (trackType === "corporate") {
    diagnostics.fee_drag = computeFeeDrag(financials.totalAum, inputs);
    diagnostics.sbd_clawback = computeSbdClawback(inputs.corporate_passive_income_annual ?? 0);
    diagnostics.active_asset_ratio = computeActiveAssetRatio(
      inputs.active_operational_assets_value ?? 0,
      financials.totalCorpAssets,
    );
    diagnostics.usa_staleness = computeUsaStaleness(inputs.usa_last_reviewed_date);
  } else {
    diagnostics.fee_drag = computeFeeDrag(financials.totalAum, inputs);
    diagnostics.estate_hygiene = {
      will_status: inputs.will_status ?? null,
      poa_status: inputs.poa_status ?? null,
      beneficiary_coordination_status: inputs.beneficiary_coordination_status ?? null,
    };
  }

  return { track_type: trackType, diagnostics, financials };
}
