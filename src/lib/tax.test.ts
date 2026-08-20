import { describe, it, expect } from "vitest";

import {
  householdNet,
  marginalRate,
  monthlyNet,
  netOfExtra,
  TAX_MODEL,
} from "@/lib/tax";

describe("monthlyNet", () => {
  it("lands close to a real payslip across the salary range", () => {
    // Reference points from Skatteverket's tables (national average rate),
    // allowed a few hundred kronor for the model's simplifications.
    const cases: [number, number][] = [
      [25_000, 20_100],
      [35_000, 27_200],
      [45_000, 34_100],
      [63_000, 44_400],
    ];
    for (const [salary, expected] of cases) {
      expect(Math.abs(monthlyNet({ salary }) - expected)).toBeLessThan(600);
    }
  });

  it("taxes a benefit harder than the same amount of salary", () => {
    // Jobbskatteavdrag applies to earned income only, so a month on
    // föräldrapenning keeps less than a month at work at the same level.
    const level = 25_000;
    expect(monthlyNet({ benefit: level })).toBeLessThan(
      monthlyNet({ salary: level }),
    );
    // ...and by a meaningful amount, not a rounding difference.
    expect(
      monthlyNet({ salary: level }) - monthlyNet({ benefit: level }),
    ).toBeGreaterThan(1_000);
  });

  it("is progressive: two earners keep more than one on the same total", () => {
    const together = householdNet([{ salary: 40_000 }, { salary: 40_000 }]);
    const alone = monthlyNet({ salary: 80_000 });
    expect(together).toBeGreaterThan(alone);
  });

  it("returns nothing taxed on no income", () => {
    expect(monthlyNet({})).toBe(0);
    expect(monthlyNet({ salary: 0, benefit: 0 })).toBe(0);
  });
});

describe("householdNet", () => {
  it("taxes each person on their own income", () => {
    const people = [{ benefit: 20_230 }, { salary: 63_000 }];
    expect(householdNet(people)).toBe(
      monthlyNet(people[0]) + monthlyNet(people[1]),
    );
  });
});

describe("marginalRate", () => {
  it("is lower on salary than on benefit below the state threshold", () => {
    // Jobbskatteavdrag grows with earned income, so an extra krona of salary
    // is taxed below the municipal rate while an extra krona of benefit is
    // taxed at it or above (the grundavdrag tapers).
    const onSalary = marginalRate({ salary: 30_000 }, false);
    const onBenefit = marginalRate({ benefit: 30_000 }, true);
    expect(onSalary).toBeLessThan(TAX_MODEL.municipalRate);
    expect(onBenefit).toBeGreaterThanOrEqual(TAX_MODEL.municipalRate);
    expect(onBenefit).toBeGreaterThan(onSalary);
  });

  it("adds state tax above the threshold", () => {
    const high = marginalRate({ salary: 80_000 }, false);
    expect(high).toBeGreaterThan(
      TAX_MODEL.municipalRate + TAX_MODEL.stateRate - 0.02,
    );
  });
});

describe("netOfExtra", () => {
  it("taxes a lump sum at the margin of the income it lands on", () => {
    const onLowPay = netOfExtra(10_000, { salary: 30_000 });
    const onHighPay = netOfExtra(10_000, { salary: 80_000 });
    expect(onLowPay).toBeGreaterThan(onHighPay);
  });
});
