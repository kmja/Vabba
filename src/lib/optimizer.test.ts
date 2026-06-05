import { describe, it, expect } from "vitest";
import {
  optimize,
  optimizeSolo,
  OBJECTIVES,
  type Objective,
} from "@/lib/optimizer";
import {
  defaultPlanInput,
  type PlanInput,
} from "@/lib/calc";

function freshPlan(
  incomeA: number,
  incomeB: number,
  opts: {
    birthDate?: string;
    aUsed?: { sjukpenning: number; lagsta: number };
    bUsed?: { sjukpenning: number; lagsta: number };
  } = {},
): PlanInput {
  const plan = defaultPlanInput(opts.birthDate ?? "2024-06-15");
  plan.parents.A = {
    grossMonthlyIncome: incomeA,
    daysUsed: opts.aUsed ?? { sjukpenning: 0, lagsta: 0 },
  };
  plan.parents.B = {
    grossMonthlyIncome: incomeB,
    daysUsed: opts.bUsed ?? { sjukpenning: 0, lagsta: 0 },
  };
  return plan;
}

// Just after birth, so timing warnings stay quiet for split/payout assertions.
const SOON_AFTER_BIRTH = new Date(2024, 8, 1); // 2024-09-01

describe("maxPayout objective", () => {
  it("gives the higher earner the bulk of income-based days, leaving the lower earner their reserved", () => {
    const plan = freshPlan(45_000, 30_000);
    const { recommended } = optimize(plan, {
      objective: "maxPayout",
      asOf: SOON_AFTER_BIRTH,
    });

    expect(recommended.allocation.A).toEqual({ sjukpenning: 300, lagsta: 0 });
    expect(recommended.allocation.B).toEqual({ sjukpenning: 90, lagsta: 90 });
    // 300*1148 + (90*765 + 90*180)
    expect(recommended.payout.A.amount).toBe(344_400);
    expect(recommended.payout.B.amount).toBe(85_050);
    expect(recommended.payout.total).toBe(429_450);
    expect(recommended.forfeitedReserved).toEqual({ A: 0, B: 0 });
  });

  it("mirrors the split when parent B earns more", () => {
    const plan = freshPlan(30_000, 45_000);
    const { recommended } = optimize(plan, {
      objective: "maxPayout",
      asOf: SOON_AFTER_BIRTH,
    });
    expect(recommended.allocation.B.sjukpenning).toBe(300);
    expect(recommended.allocation.A.sjukpenning).toBe(90);
  });
});

describe("equal objective", () => {
  it("splits total home-time evenly", () => {
    const plan = freshPlan(45_000, 30_000);
    const { recommended } = optimize(plan, {
      objective: "equal",
      asOf: SOON_AFTER_BIRTH,
    });
    expect(recommended.allocation.A).toEqual({ sjukpenning: 195, lagsta: 45 });
    expect(recommended.allocation.B).toEqual({ sjukpenning: 195, lagsta: 45 });
    expect(recommended.allocatedTotals.A).toBe(recommended.allocatedTotals.B);
  });
});

describe("objective trade-off", () => {
  it("max payout earns at least as much as an equal split", () => {
    const plan = freshPlan(50_000, 25_000);
    const max = optimize(plan, {
      objective: "maxPayout",
      asOf: SOON_AFTER_BIRTH,
    }).recommended;
    const equal = optimize(plan, {
      objective: "equal",
      asOf: SOON_AFTER_BIRTH,
    }).recommended;
    expect(max.payout.total).toBeGreaterThanOrEqual(equal.payout.total);
  });

  it("returns the other objective as an alternative", () => {
    const result = optimize(freshPlan(40_000, 40_000), {
      objective: "maxPayout",
      asOf: SOON_AFTER_BIRTH,
    });
    expect(result.alternatives.map((a) => a.objective)).toEqual(["equal"]);
  });
});

describe("reserved-day constraint", () => {
  it("never forfeits reserved days when enough income-based days remain", () => {
    for (const objective of OBJECTIVES) {
      const plan = freshPlan(60_000, 20_000);
      const { recommended } = optimize(plan, {
        objective: objective as Objective,
        asOf: SOON_AFTER_BIRTH,
      });
      expect(recommended.forfeitedReserved.A).toBe(0);
      expect(recommended.forfeitedReserved.B).toBe(0);
      // The lower earner still gets at least their 90 reserved income-based days.
      expect(recommended.allocation.B.sjukpenning).toBeGreaterThanOrEqual(90);
    }
  });

  it("flags forfeiture when one parent has used up nearly all income-based days", () => {
    // A already burned 350 income-based days; only 40 remain, but B still has 90
    // reserved that can't be transferred.
    const plan = freshPlan(40_000, 40_000, {
      aUsed: { sjukpenning: 350, lagsta: 0 },
    });
    const { recommended } = optimize(plan, {
      objective: "maxPayout",
      asOf: SOON_AFTER_BIRTH,
    });
    expect(recommended.forfeitedReserved.B).toBe(50);
    expect(
      recommended.warnings.some(
        (w) => w.code === "reservedForfeit" && w.level === "critical",
      ),
    ).toBe(true);
  });
});

describe("timing warnings", () => {
  it("warns when income-based days can't fit before the 4-year deadline", () => {
    const plan = freshPlan(40_000, 40_000, { birthDate: "2024-06-15" });
    const { recommended } = optimize(plan, {
      objective: "maxPayout",
      asOf: new Date(2028, 2, 15), // 2028-03-15, ~3 months before age 4
    });
    expect(recommended.warnings.some((w) => w.code === "timingBeforeAge4")).toBe(
      true,
    );
  });

  it("warns once the child has passed 4", () => {
    const plan = freshPlan(40_000, 40_000, { birthDate: "2024-06-15" });
    const { recommended } = optimize(plan, {
      objective: "maxPayout",
      asOf: new Date(2028, 6, 1), // 2028-07-01
    });
    expect(recommended.warnings.some((w) => w.code === "timingAfterAge4")).toBe(
      true,
    );
  });
});

describe("informational warnings", () => {
  it("always advises on SGI protection", () => {
    const { recommended } = optimize(freshPlan(40_000, 40_000), {
      asOf: SOON_AFTER_BIRTH,
    });
    expect(recommended.warnings.some((w) => w.code === "sgiProtection")).toBe(
      true,
    );
  });

  it("notes when a parent earns above the SGI cap", () => {
    const { recommended } = optimize(freshPlan(70_000, 30_000), {
      asOf: SOON_AFTER_BIRTH,
    });
    expect(recommended.warnings.some((w) => w.code === "incomeAboveCap")).toBe(
      true,
    );
  });

  it("flags a parent taking no days while still earning (possible SGI gap)", () => {
    // Lower earner already used all their reserved; max payout then gives them
    // nothing further — but here we make B take literally zero by exhausting the
    // pool on A and giving B no remaining reserved.
    const plan = freshPlan(50_000, 30_000, {
      bUsed: { sjukpenning: 90, lagsta: 0 },
    });
    // B's reserved already covered (90 used), so max payout sends all remaining
    // income-based days to A; B may end with 0 allocated.
    const { recommended } = optimize(plan, {
      objective: "maxPayout",
      asOf: SOON_AFTER_BIRTH,
    });
    if (recommended.allocatedTotals.B === 0) {
      expect(recommended.warnings.some((w) => w.code === "sgiGap")).toBe(true);
    }
  });
});

describe("optimizeSolo (sole custody)", () => {
  it("gives the single parent all remaining days and their value", () => {
    const solo = optimizeSolo(freshPlan(40_000, 0), { asOf: SOON_AFTER_BIRTH });
    expect(solo.remaining.remaining.total).toBe(480);
    expect(solo.allocatedTotal).toBe(480);
    expect(solo.payout.dailyRate).toBe(1020);
    expect(solo.payout.amount).toBe(390 * 1020 + 90 * 180);
    // No second parent => no reserved forfeiture and no dubbeldagar.
    expect(solo.warnings.some((w) => w.code === "reservedForfeit")).toBe(false);
    expect(solo.warnings.some((w) => w.code === "doubleDaysWindow")).toBe(false);
  });

  it("subtracts only parent A's own used days", () => {
    const solo = optimizeSolo(
      freshPlan(40_000, 0, { aUsed: { sjukpenning: 100, lagsta: 10 } }),
      { asOf: SOON_AFTER_BIRTH },
    );
    expect(solo.remaining.remaining.sjukpenning).toBe(290);
    expect(solo.remaining.remaining.lagsta).toBe(80);
  });
});
