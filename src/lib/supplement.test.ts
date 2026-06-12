import { describe, it, expect } from "vitest";

import { computeSupplement } from "@/lib/supplement";
import { sjukpenningnivaDailyAmount, MONEY } from "@/lib/rules";

const CAP_MONTHLY = Math.round(MONEY.sgiAnnualCap / 12);

describe("computeSupplement", () => {
  it("tops a below-cap salary up to ~90% of gross at full pace", () => {
    const salary = 40_000;
    const fkDailyRate = sjukpenningnivaDailyAmount(salary);
    const res = computeSupplement({
      grossMonthlySalary: salary,
      incomeAboveCap: false,
      pct: 90,
      months: 6,
      fkDailyRate,
      pace: 7,
    })!;
    // FK monthly + top-up should land at ~90% of salary.
    const fkFull = Math.round(fkDailyRate * 30.4);
    expect(res.monthly + fkFull).toBeCloseTo(0.9 * salary, -2);
    expect(res.total).toBe(res.monthly * 6);
    expect(res.months).toBe(6);
  });

  it("compensates the salary above the cap (the high-earner case)", () => {
    const fkDailyRate = MONEY.maxSjukpenningPerDay; // above cap → max rate
    const atCap = computeSupplement({
      grossMonthlySalary: CAP_MONTHLY,
      incomeAboveCap: true,
      pct: 90,
      months: 6,
      fkDailyRate,
      pace: 7,
    })!;
    const wellAbove = computeSupplement({
      grossMonthlySalary: 80_000,
      incomeAboveCap: true,
      pct: 90,
      months: 6,
      fkDailyRate,
      pace: 7,
    })!;
    // The higher actual salary yields a substantially larger top-up.
    expect(wellAbove.monthly).toBeGreaterThan(atCap.monthly + 10_000);
    expect(wellAbove.basedOnSalary).toBe(80_000);
  });

  it("falls back to the cap salary when only 'above cap' is known", () => {
    const res = computeSupplement({
      grossMonthlySalary: 0,
      incomeAboveCap: true,
      pct: 90,
      months: 6,
      fkDailyRate: MONEY.maxSjukpenningPerDay,
      pace: 7,
    })!;
    expect(res.basedOnSalary).toBe(CAP_MONTHLY);
    expect(res.monthly).toBeGreaterThan(0);
  });

  it("scales the monthly amount with the leave pace but keeps the total", () => {
    const base = {
      grossMonthlySalary: 45_000,
      incomeAboveCap: false,
      pct: 90,
      months: 6,
      fkDailyRate: sjukpenningnivaDailyAmount(45_000),
    };
    const full = computeSupplement({ ...base, pace: 7 })!;
    const half = computeSupplement({ ...base, pace: 3.5 })!;
    expect(half.monthly).toBeCloseTo(full.monthly / 2, -1);
    expect(half.total).toBe(full.total); // same money, stretched out
    expect(half.months).toBe(full.months * 2);
  });

  it("returns null when it does not apply", () => {
    const fk = sjukpenningnivaDailyAmount(40_000);
    expect(
      computeSupplement({
        grossMonthlySalary: 40_000,
        incomeAboveCap: false,
        pct: 0,
        months: 6,
        fkDailyRate: fk,
        pace: 7,
      }),
    ).toBeNull();
    expect(
      computeSupplement({
        grossMonthlySalary: 40_000,
        incomeAboveCap: false,
        pct: 90,
        months: 0,
        fkDailyRate: fk,
        pace: 7,
      }),
    ).toBeNull();
    // A tiny salary where FK already exceeds the target → no top-up.
    expect(
      computeSupplement({
        grossMonthlySalary: 1_000,
        incomeAboveCap: false,
        pct: 90,
        months: 6,
        fkDailyRate: sjukpenningnivaDailyAmount(1_000),
        pace: 7,
      }),
    ).toBeNull();
  });
});
