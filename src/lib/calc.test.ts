import { describe, it, expect } from "vitest";
import {
  defaultPlanInput,
  defaultParentInput,
  planBudget,
  planUsage,
  planRemaining,
  reservedDaysAtRisk,
  planDeadlines,
  type PlanInput,
} from "@/lib/calc";
import { toIsoDate } from "@/lib/dates";

function planWith(
  overrides: Partial<{
    birthDate: string;
    childrenInBirth: number;
    aUsed: { sjukpenning: number; lagsta: number };
    bUsed: { sjukpenning: number; lagsta: number };
  }> = {},
): PlanInput {
  const base = defaultPlanInput(overrides.birthDate ?? "2024-06-15");
  base.childrenInBirth = overrides.childrenInBirth ?? 1;
  base.parents.A = {
    ...defaultParentInput(40_000),
    daysUsed: overrides.aUsed ?? { sjukpenning: 0, lagsta: 0 },
  };
  base.parents.B = {
    ...defaultParentInput(35_000),
    daysUsed: overrides.bUsed ?? { sjukpenning: 0, lagsta: 0 },
  };
  return base;
}

describe("defaults", () => {
  it("a fresh plan is a single child with no days used", () => {
    const plan = defaultPlanInput("2024-06-15");
    expect(plan.childrenInBirth).toBe(1);
    expect(planUsage(plan).combined.total).toBe(0);
  });
});

describe("planBudget", () => {
  it("single child", () => {
    expect(planBudget(planWith())).toEqual({
      total: 480,
      sjukpenning: 390,
      lagsta: 90,
    });
  });
});

describe("planUsage", () => {
  it("sums per parent and combined", () => {
    const plan = planWith({
      aUsed: { sjukpenning: 50, lagsta: 10 },
      bUsed: { sjukpenning: 20, lagsta: 5 },
    });
    const usage = planUsage(plan);
    expect(usage.byParent.A.total).toBe(60);
    expect(usage.byParent.B.total).toBe(25);
    expect(usage.combined).toEqual({ sjukpenning: 70, lagsta: 15, total: 85 });
  });
});

describe("planRemaining", () => {
  it("subtracts used days from the budget per tier", () => {
    const plan = planWith({
      aUsed: { sjukpenning: 100, lagsta: 20 },
      bUsed: { sjukpenning: 50, lagsta: 10 },
    });
    const r = planRemaining(plan);
    expect(r.remaining.sjukpenning).toBe(390 - 150);
    expect(r.remaining.lagsta).toBe(90 - 30);
    expect(r.remaining.total).toBe(480 - 180);
    expect(r.overAllocated.sjukpenning).toBe(false);
  });

  it("clamps at zero and flags over-allocation", () => {
    const plan = planWith({
      aUsed: { sjukpenning: 400, lagsta: 0 },
      bUsed: { sjukpenning: 50, lagsta: 0 },
    });
    const r = planRemaining(plan);
    expect(r.remaining.sjukpenning).toBe(0);
    expect(r.overAllocated.sjukpenning).toBe(true);
  });
});

describe("reservedDaysAtRisk", () => {
  it("a parent who has used no income-based days risks all 90", () => {
    expect(reservedDaysAtRisk(planWith()).A).toBe(90);
  });

  it("partially-used reserved days", () => {
    const risk = reservedDaysAtRisk(
      planWith({ aUsed: { sjukpenning: 30, lagsta: 0 } }),
    );
    expect(risk.A).toBe(60);
  });

  it("a parent past 90 income-based days risks none", () => {
    const risk = reservedDaysAtRisk(
      planWith({ aUsed: { sjukpenning: 120, lagsta: 0 } }),
    );
    expect(risk.A).toBe(0);
  });
});

describe("planDeadlines", () => {
  it("computes the 15-month, 4-year and 12-year marks", () => {
    const d = planDeadlines(planWith({ birthDate: "2024-06-15" }));
    expect(toIsoDate(d.doubleDaysDeadline)).toBe("2025-09-15");
    expect(toIsoDate(d.sjukpenningDeadline)).toBe("2028-06-15");
    expect(toIsoDate(d.expiry)).toBe("2036-06-15");
  });
});
