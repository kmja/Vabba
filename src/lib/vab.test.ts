import { describe, it, expect } from "vitest";
import {
  VAB_MONEY,
  computeVab,
  estimateVabSgi,
  isAboveVabSgiCap,
  vabAgeStatus,
  vabDailyAmount,
  vabDaysPerChildPerYear,
} from "@/lib/vab";

describe("vab SGI + daily amount", () => {
  it("caps SGI at 7.5 prisbasbelopp (444 000 kr)", () => {
    expect(VAB_MONEY.sgiAnnualCap).toBe(444_000);
    expect(estimateVabSgi(50_000)).toBe(444_000);
    expect(estimateVabSgi(30_000)).toBe(360_000);
  });

  it("reproduces the published 2026 max of ~944 kr/day at the cap", () => {
    expect(vabDailyAmount(50_000)).toBe(VAB_MONEY.maxPerDay);
    expect(vabDailyAmount(50_000)).toBe(944);
  });

  it("matches the income-based formula below the cap and has no floor", () => {
    expect(vabDailyAmount(30_000)).toBe(765); // same formula as FP sjukpenning
    expect(vabDailyAmount(0)).toBe(0); // no grundnivå floor for vab
  });

  it("flags income above the vab ceiling", () => {
    expect(isAboveVabSgiCap(40_000)).toBe(true); // 480k > 444k
    expect(isAboveVabSgiCap(36_000)).toBe(false); // 432k < 444k
  });
});

describe("vab day allowance", () => {
  it("is 120 per child, 240 for a sole-custody parent", () => {
    expect(vabDaysPerChildPerYear(false)).toBe(120);
    expect(vabDaysPerChildPerYear(true)).toBe(240);
  });
});

describe("vabAgeStatus", () => {
  it("buckets by age", () => {
    expect(vabAgeStatus(3)).toBe("underMinAge"); // 3 months
    expect(vabAgeStatus(10)).toBe("standard"); // 10 months
    expect(vabAgeStatus(11 * 12)).toBe("standard"); // 11 years
    expect(vabAgeStatus(13 * 12)).toBe("needsCertificate"); // 13 years
    expect(vabAgeStatus(17 * 12)).toBe("ineligible"); // 17 years
  });
});

describe("computeVab", () => {
  it("computes capacity, remaining and value", () => {
    const r = computeVab({
      grossMonthlyIncome: 30_000,
      numberOfChildren: 2,
      singleParent: false,
      daysUsedThisYear: 50,
    });
    expect(r.daysPerChild).toBe(120);
    expect(r.annualCapacity).toBe(240);
    expect(r.remaining).toBe(190);
    expect(r.dailyAmount).toBe(765);
    expect(r.remainingValue).toBe(190 * 765);
    expect(r.overUsed).toBe(false);
  });

  it("clamps remaining and flags over-use", () => {
    const r = computeVab({
      grossMonthlyIncome: 30_000,
      numberOfChildren: 1,
      singleParent: false,
      daysUsedThisYear: 200,
    });
    expect(r.remaining).toBe(0);
    expect(r.overUsed).toBe(true);
  });

  it("doubles the per-child allowance for a sole-custody parent", () => {
    const r = computeVab({
      grossMonthlyIncome: 30_000,
      numberOfChildren: 1,
      singleParent: true,
      daysUsedThisYear: 0,
    });
    expect(r.annualCapacity).toBe(240);
  });

  it("pays the max daily amount when flagged above the cap, with no salary entered", () => {
    const r = computeVab({
      grossMonthlyIncome: 0,
      incomeAboveCap: true,
      numberOfChildren: 1,
      singleParent: false,
      daysUsedThisYear: 0,
    });
    expect(r.dailyAmount).toBe(VAB_MONEY.maxPerDay);
    expect(r.sgiCapped).toBe(true);
  });
});
