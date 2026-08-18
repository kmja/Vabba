import { describe, it, expect } from "vitest";

import { birthDaysFor, computeBirthDays } from "@/lib/birth-days";
import { vabDailyAmount, VAB_MONEY } from "@/lib/vab";

describe("computeBirthDays", () => {
  it("values the days at the tillfällig-FP daily rate", () => {
    const res = computeBirthDays({
      grossMonthlyIncome: 30_000, // below the 7.5-PBB vab ceiling
      days: 10,
    });
    expect(res.days).toBe(10);
    expect(res.dailyAmount).toBe(vabDailyAmount(30_000));
    expect(res.total).toBe(10 * vabDailyAmount(30_000));
    expect(res.sgiCapped).toBe(false);
  });

  it("caps the day count at the statutory 10", () => {
    expect(computeBirthDays({ grossMonthlyIncome: 40_000, days: 25 }).days).toBe(
      10,
    );
  });

  it("gives the days per child, so twins double them", () => {
    expect(birthDaysFor(1)).toBe(10);
    expect(birthDaysFor(2)).toBe(20);
    const twins = computeBirthDays({
      grossMonthlyIncome: 30_000,
      days: 20,
      childrenInBirth: 2,
    });
    expect(twins.maxDays).toBe(20);
    expect(twins.days).toBe(20);
    expect(twins.total).toBe(20 * vabDailyAmount(30_000));
    // A single birth still caps at ten.
    expect(
      computeBirthDays({ grossMonthlyIncome: 30_000, days: 20 }).days,
    ).toBe(10);
  });

  it("uses the 7.5-PBB ceiling for high earners", () => {
    const res = computeBirthDays({
      grossMonthlyIncome: 0,
      incomeAboveCap: true,
      days: 10,
    });
    expect(res.dailyAmount).toBe(VAB_MONEY.maxPerDay);
    expect(res.sgiCapped).toBe(true);
  });

  it("is zero when no days are taken", () => {
    expect(computeBirthDays({ grossMonthlyIncome: 40_000, days: 0 }).total).toBe(
      0,
    );
  });
});
