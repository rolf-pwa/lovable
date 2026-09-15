// Unit tests for the pure (network-free) parts of the Quarterly Governance
// Audit narrative module -- findUngroundedDollarFigures and applyNarrative.
// generateAuditNarrative itself calls Vertex AI and is verified separately,
// live, against a real GCP service account (see the Phase 4 commit
// message) -- not mockable meaningfully here.
import { describe, expect, it } from "vitest";
import {
  applyNarrative,
  findUngroundedDollarFigures,
  type NarrativeOutput,
} from "../../supabase/functions/_shared/governance-audit-narrative";

describe("governance-audit-narrative: findUngroundedDollarFigures", () => {
  const computedData = {
    estate_liquidity_analysis: { surplus_or_deficit: -299114.95, total_liabilities_and_taxes: 299114.95 },
    terminal_tax_estimate: { registered_terminal_tax: 102339.75 },
    pillar_totals: { Vineyard: 100000 },
  };

  it("flags no figures when every dollar amount traces back to the computed data", () => {
    const narrative: NarrativeOutput = {
      executiveSummaryBullets: ["The estate carries a $299,114.95 cash deficit against a $102,339.75 terminal tax exposure."],
      pillarNarratives: [{ pillar: "Vineyard", narrative: "The Vineyard stands at $100,000.00." }],
      elementNarratives: [],
      discussionPoints: [],
    };
    expect(findUngroundedDollarFigures(narrative, computedData)).toEqual([]);
  });

  it("flags a dollar figure that doesn't appear anywhere in the computed data", () => {
    const narrative: NarrativeOutput = {
      executiveSummaryBullets: ["A completely invented figure of $999,999.99 appears here."],
      pillarNarratives: [],
      elementNarratives: [],
      discussionPoints: [],
    };
    expect(findUngroundedDollarFigures(narrative, computedData)).toEqual(["$999,999.99"]);
  });

  it("matches a rounded whole-dollar mention against a decimal-precision computed figure", () => {
    const narrative: NarrativeOutput = {
      executiveSummaryBullets: ["Vineyard holdings total $100,000."],
      pillarNarratives: [],
      elementNarratives: [],
      discussionPoints: [],
    };
    expect(findUngroundedDollarFigures(narrative, computedData)).toEqual([]);
  });
});

describe("governance-audit-narrative: applyNarrative", () => {
  it("merges generated prose into an already-computed document structure", () => {
    const doc = {
      executive_summary_bullets: [] as string[],
      pillar_analyses: [{ pillar: "Vineyard", narrative: "" }],
      element_deep_dives: [{ element_name: "Capital Infrastructure & Asset Allocation", audit_findings: [] as string[], required_corrective_actions: [] as string[] }],
      discussion_points: [] as { title: string; body: string }[],
    };
    const narrative: NarrativeOutput = {
      executiveSummaryBullets: ["Bullet one."],
      pillarNarratives: [{ pillar: "Vineyard", narrative: "The Vineyard is thriving." }],
      elementNarratives: [
        { elementName: "Capital Infrastructure & Asset Allocation", auditFindings: ["Finding one."], requiredCorrectiveActions: ["Action one."] },
      ],
      discussionPoints: [{ title: "Title", body: "Body." }],
    };

    applyNarrative(doc, narrative);

    expect(doc.executive_summary_bullets).toEqual(["Bullet one."]);
    expect(doc.pillar_analyses[0].narrative).toBe("The Vineyard is thriving.");
    expect(doc.element_deep_dives[0].audit_findings).toEqual(["Finding one."]);
    expect(doc.element_deep_dives[0].required_corrective_actions).toEqual(["Action one."]);
    expect(doc.discussion_points).toEqual([{ title: "Title", body: "Body." }]);
  });

  it("leaves an element's findings untouched if the narrative has no entry for it", () => {
    const doc = {
      executive_summary_bullets: [] as string[],
      pillar_analyses: [] as { pillar: string; narrative: string }[],
      element_deep_dives: [{ element_name: "Untouched Element", audit_findings: ["existing"], required_corrective_actions: [] as string[] }],
      discussion_points: [] as { title: string; body: string }[],
    };
    applyNarrative(doc, { executiveSummaryBullets: [], pillarNarratives: [], elementNarratives: [], discussionPoints: [] });
    expect(doc.element_deep_dives[0].audit_findings).toEqual(["existing"]);
  });
});
