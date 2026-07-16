import { describe, expect, it } from "vitest";
import {
  computeGauges,
  deriveResult,
  bcContextNotes,
  VELVET_ROPE,
} from "@/lib/georgia2/derive";

describe("georgia2 derive", () => {
  it("routes >=1M to VFO", () => {
    const r = deriveResult("corporate", VELVET_ROPE);
    expect(r.qualified).toBe(true);
    expect(r.fee).toBeNull();
  });
  it("routes <1M corporate to $10k standalone", () => {
    const r = deriveResult("corporate", 500_000);
    expect(r.qualified).toBe(false);
    expect(r.fee).toBe(10_000);
  });
  it("routes <1M personal to $5k standalone", () => {
    const r = deriveResult("personal", 500_000);
    expect(r.fee).toBe(5_000);
  });
  it("spikes tax drag when LCGE unused", () => {
    const low = computeGauges("corporate", "founder_exit", { lcge_used: "yes" }, 2_000_000);
    const high = computeGauges("corporate", "founder_exit", { lcge_used: "no" }, 2_000_000);
    expect(high.taxDragRisk).toBeGreaterThan(low.taxDragRisk);
  });
  it("lowers structure safety when no HoldCo", () => {
    const safe = computeGauges("corporate", "founder_exit", { holdco_active: "yes" }, 2_000_000);
    const risky = computeGauges("corporate", "founder_exit", { holdco_active: "no" }, 2_000_000);
    expect(safe.structureSafety).toBeGreaterThan(risky.structureSafety);
  });
  it("returns BC context bullets", () => {
    const notes = bcContextNotes("personal", "divorce_restructuring", {});
    expect(notes.length).toBeGreaterThan(0);
    expect(notes.some((n) => n.includes("BC Family Law Act"))).toBe(true);
  });
});
