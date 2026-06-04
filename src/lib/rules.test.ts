import { describe, it, expect } from "vitest";
import {
  DAY_BUDGET,
  MONEY,
  estimateSgi,
  sjukpenningnivaDailyAmount,
  lagstanivaDailyAmount,
  dailyAmountForTier,
  totalDaysForBirth,
  isAboveSgiCap,
} from "@/lib/rules";

describe("day budget invariants", () => {
  it("tiers sum to the total", () => {
    expect(DAY_BUDGET.sjukpenningDays + DAY_BUDGET.lagstaDays).toBe(
      DAY_BUDGET.totalPerChild,
    );
  });

  it("each parent's tiers sum to their share, and two shares make the whole", () => {
    const p = DAY_BUDGET.perParent;
    expect(p.sjukpenningDays + p.lagstaDays).toBe(p.total);
    expect(p.total * 2).toBe(DAY_BUDGET.totalPerChild);
    expect(p.sjukpenningDays * 2).toBe(DAY_BUDGET.sjukpenningDays);
    expect(p.lagstaDays * 2).toBe(DAY_BUDGET.lagstaDays);
  });

  it("reserved days fit within a parent's share", () => {
    expect(DAY_BUDGET.reservedDaysPerParent).toBeLessThanOrEqual(
      DAY_BUDGET.perParent.total,
    );
  });
});

describe("estimateSgi", () => {
  it("annualizes monthly income below the cap", () => {
    expect(estimateSgi(30_000)).toBe(360_000);
  });

  it("caps at 10 prisbasbelopp", () => {
    expect(estimateSgi(60_000)).toBe(MONEY.sgiAnnualCap);
    expect(MONEY.sgiAnnualCap).toBe(592_000);
  });

  it("never goes negative", () => {
    expect(estimateSgi(-1000)).toBe(0);
  });
});

describe("sjukpenningnivaDailyAmount", () => {
  it("reproduces the published 2026 maximum at/above the cap", () => {
    expect(sjukpenningnivaDailyAmount(60_000)).toBe(MONEY.maxSjukpenningPerDay);
    expect(sjukpenningnivaDailyAmount(60_000)).toBe(1_259);
  });

  it("computes ~77.6% of SGI / 365 for mid incomes", () => {
    // 360000 * 0.97 * 0.8 / 365 = 765.36 -> 765
    expect(sjukpenningnivaDailyAmount(30_000)).toBe(765);
  });

  it("floors low incomes at grundnivå", () => {
    // 8000/mo would compute to ~204/day, floored to grundnivå
    expect(sjukpenningnivaDailyAmount(8_000)).toBe(MONEY.grundnivaPerDay);
  });

  it("is monotonic up to the cap", () => {
    expect(sjukpenningnivaDailyAmount(40_000)).toBeGreaterThan(
      sjukpenningnivaDailyAmount(20_000),
    );
  });
});

describe("flat tier", () => {
  it("lägstanivå is the flat 180 kr regardless of income", () => {
    expect(lagstanivaDailyAmount()).toBe(180);
    expect(dailyAmountForTier("lagsta", 99_999)).toBe(180);
  });

  it("dailyAmountForTier routes sjukpenning to the income-based amount", () => {
    expect(dailyAmountForTier("sjukpenning", 30_000)).toBe(765);
  });
});

describe("totalDaysForBirth", () => {
  it("single child = 480 (390 + 90)", () => {
    expect(totalDaysForBirth(1)).toEqual({
      total: 480,
      sjukpenning: 390,
      lagsta: 90,
    });
  });

  it("twins add 180 days (to the income-based tier in our model)", () => {
    expect(totalDaysForBirth(2)).toEqual({
      total: 660,
      sjukpenning: 570,
      lagsta: 90,
    });
  });

  it("triplets add 360 days", () => {
    expect(totalDaysForBirth(3)).toEqual({
      total: 840,
      sjukpenning: 750,
      lagsta: 90,
    });
  });

  it("defaults to a single child", () => {
    expect(totalDaysForBirth()).toEqual(totalDaysForBirth(1));
  });
});

describe("isAboveSgiCap", () => {
  it("flags incomes whose annualized value exceeds the cap", () => {
    expect(isAboveSgiCap(50_000)).toBe(true); // 600k > 592k
    expect(isAboveSgiCap(40_000)).toBe(false); // 480k < 592k
  });
});
