import { describe, it, expect } from "vitest";

import { solvePeriods } from "@/lib/periods";

describe("solvePeriods", () => {
  it("gives fixed periods precedence and fills leftover with the remainder", () => {
    const r = solvePeriods({
      periods: [
        { id: "a-birth", caregiver: "A", kind: "fixed", days: 90 },
        { id: "a-extra", caregiver: "A", kind: "leftover", days: 0 },
      ],
      budgets: { A: 240, B: 240 },
    });
    const byId = Object.fromEntries(r.allocations.map((p) => [p.id, p]));
    expect(byId["a-birth"].days).toBe(90);
    // A had 150 left after the fixed 90; B untouched (no B period), so the
    // leftover is 150 + 240 = 390 — but A is capped at her own 150.
    expect(byId["a-extra"].days).toBe(150);
    expect(r.unused.A).toBe(0);
    expect(r.unused.B).toBe(240);
  });

  it("splits leftover evenly between both caregivers' as-long-as-possible periods", () => {
    const r = solvePeriods({
      periods: [
        { id: "a", caregiver: "A", kind: "leftover", days: 0 },
        { id: "b", caregiver: "B", kind: "leftover", days: 0 },
      ],
      budgets: { A: 240, B: 240 },
    });
    const byId = Object.fromEntries(r.allocations.map((p) => [p.id, p]));
    expect(byId["a"].days).toBe(240);
    expect(byId["b"].days).toBe(240);
  });

  it("redistributes to the other caregiver when one is capped by their earmark", () => {
    const r = solvePeriods({
      periods: [
        { id: "a", caregiver: "A", kind: "leftover", days: 0 },
        { id: "b", caregiver: "B", kind: "leftover", days: 0 },
      ],
      budgets: { A: 200, B: 40 },
    });
    const byId = Object.fromEntries(r.allocations.map((p) => [p.id, p]));
    // Leftover total 240, even split intent 120/120; B capped at 40, so the
    // 80 shortfall goes to A (who has room).
    expect(byId["b"].days).toBe(40);
    expect(byId["a"].days).toBe(200);
    expect(r.unused.A).toBe(0);
    expect(r.unused.B).toBe(0);
  });

  it("never overdraws a caregiver's pot and reports the shortfall", () => {
    const r = solvePeriods({
      periods: [
        { id: "over", caregiver: "A", kind: "fixed", days: 300 },
      ],
      budgets: { A: 240, B: 240 },
    });
    expect(r.allocations[0].days).toBe(240);
    expect(r.warnings.length).toBeGreaterThan(0);
    expect(r.unused.A).toBe(0);
    expect(r.unused.B).toBe(240);
  });

  it("leaves unused days when there is no leftover period to absorb them", () => {
    const r = solvePeriods({
      periods: [{ id: "a", caregiver: "A", kind: "fixed", days: 100 }],
      budgets: { A: 240, B: 240 },
    });
    expect(r.unused.A).toBe(140);
    expect(r.unused.B).toBe(240);
  });

  it("dubbeldagar draws a day from both caregivers' budgets", () => {
    const r = solvePeriods({
      periods: [{ id: "d", caregiver: "A", kind: "dubbeldagar", days: 20 }],
      budgets: { A: 240, B: 240 },
    });
    expect(r.allocations[0].days).toBe(20);
    expect(r.unused.A).toBe(220);
    expect(r.unused.B).toBe(220);
  });

  it("a birth period is locked and draws from its caregiver", () => {
    const r = solvePeriods({
      periods: [
        { id: "birth", caregiver: "B", kind: "birth", days: 10, locked: true },
        { id: "a", caregiver: "A", kind: "fixed", days: 60 },
      ],
      budgets: { A: 240, B: 240 },
    });
    const byId = Object.fromEntries(r.allocations.map((p) => [p.id, p]));
    expect(byId["birth"].days).toBe(10);
    expect(byId["birth"].locked).toBe(true);
    expect(byId["birth"].kind).toBe("birth");
    expect(r.unused.B).toBe(230);
    expect(byId["a"].days).toBe(60);
  });

  it("propagates the tip: income by default, lägstanivå when set", () => {
    const r = solvePeriods({
      periods: [
        { id: "inc", caregiver: "A", kind: "fixed", days: 10 },
        { id: "flat", caregiver: "A", kind: "fixed", days: 10, tier: "lagsta" },
      ],
      budgets: { A: 240, B: 240 },
    });
    const byId = Object.fromEntries(r.allocations.map((p) => [p.id, p]));
    expect(byId["inc"].tier).toBe("income");
    expect(byId["flat"].tier).toBe("lagsta");
  });
});
