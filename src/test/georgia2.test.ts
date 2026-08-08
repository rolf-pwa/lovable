import { describe, expect, it } from "vitest";
import {
  computeGauges,
  deriveResult,
  bcContextNotes,
  georgiaInsights,
  VELVET_ROPE,
} from "@/modules/intake/lib/derive";

describe("georgia2 derive", () => {
  it("prices the personal Survey at $750", () => {
    expect(deriveResult("personal").surveyPrice).toBe(750);
  });
  it("prices the corporate Survey at $1,500", () => {
    expect(deriveResult("corporate").surveyPrice).toBe(1_500);
  });
  it("headline always points at the Survey regardless of scale", () => {
    expect(deriveResult("personal", 5_000_000).headline).toContain("Sovereignty Survey");
    expect(deriveResult("personal", 200_000).headline).toContain("Sovereignty Survey");
  });

  it("spikes tax drag when LCGE unsure", () => {
    const low = computeGauges("corporate", "founder_exit", { lcge: "intact" }, 2_000_000);
    const high = computeGauges("corporate", "founder_exit", { lcge: "unsure" }, 2_000_000);
    expect(high.taxDragRisk).toBeGreaterThan(low.taxDragRisk);
  });
  it("lowers structure safety when no HoldCo", () => {
    const safe = computeGauges("corporate", "founder_exit", { holdco: "yes" }, 2_000_000);
    const risky = computeGauges("corporate", "founder_exit", { holdco: "no" }, 2_000_000);
    expect(safe.structureSafety).toBeGreaterThan(risky.structureSafety);
  });
  it("returns BC context bullets", () => {
    const notes = bcContextNotes("personal", "divorce_restructuring", {});
    expect(notes.some((n) => n.includes("BC Family Law Act"))).toBe(true);
  });
  it("emits decoupled build insight below $1M", () => {
    const ins = georgiaInsights("personal", "inheritance", {}, 500_000);
    expect(ins.some((i) => i.tag === "Decoupled Build")).toBe(true);
  });
  it("emits noise exposure insight for contested divorce", () => {
    const ins = georgiaInsights(
      "personal",
      "divorce_restructuring",
      { integration_status: "active" },
      2_000_000
    );
    expect(ins.some((i) => i.tag === "Noise Exposure")).toBe(true);
  });
});
