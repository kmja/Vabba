import { describe, expect, it } from "vitest";

import { solveBudget, solveUntilDate, type GoalSpec } from "@/lib/goal-seek";
import { addDays, differenceInDays, parseIsoDate } from "@/lib/dates";

const birth = parseIsoDate("2025-01-15");

function spec(overrides: Partial<GoalSpec> = {}): GoalSpec {
  return {
    birth,
    start: birth,
    blocks: [{ caregiver: "Anna", tier: "income", days: 390, rate: 1000 }],
    caregivers: [
      { name: "Anna", worksPartTime: false, salary: 35000, partnerSalary: 0 },
    ],
    ...overrides,
  };
}

describe("solveUntilDate", () => {
  it("cuts the leave at the target and saves the leftover days", () => {
    const target = addDays(birth, 90);
    const res = solveUntilDate(spec(), target);
    expect(res.targetMet).toBe(true);
    expect(res.endsAt?.getTime()).toBe(target.getTime());
    // 90 calendar days at 7/week ≈ 90 benefit days used → ~300 saved.
    expect(res.savedByCaregiver["Anna"]).toBeGreaterThan(290);
    expect(res.savedByCaregiver["Anna"]).toBeLessThan(310);
    expect(res.paces["Anna"].phase1).toBe(7);
  });

  it("stretches the paces just enough to reach a far target", () => {
    const target = addDays(birth, 540); // beyond the 390-day full-pace end
    const res = solveUntilDate(spec(), target);
    expect(res.targetMet).toBe(true);
    expect(res.shortfallDays).toBe(0);
    expect(res.savedTotal).toBe(0);
    // Lands on (or just past) the target, not wildly beyond it.
    const overshoot = differenceInDays(target, res.endsAt!);
    expect(overshoot).toBeGreaterThanOrEqual(0);
    expect(overshoot).toBeLessThan(30);
    // Stretching happened, but never below the SGI floor after year 1.
    expect(res.paces["Anna"].phase1).toBeLessThan(7);
    expect(res.paces["Anna"].phase2).toBeGreaterThanOrEqual(5);
  });

  it("reports the missing days when the target is out of reach", () => {
    const res = solveUntilDate(
      spec({
        blocks: [{ caregiver: "Anna", tier: "income", days: 60, rate: 1000 }],
      }),
      addDays(birth, 730),
    );
    expect(res.targetMet).toBe(false);
    expect(res.shortfallDays).toBeGreaterThan(100);
  });
});

describe("solveBudget", () => {
  it("finds the slowest pace that clears the household floor", () => {
    const res = solveBudget(
      spec({
        blocks: [{ caregiver: "Anna", tier: "income", days: 300, rate: 1000 }],
        caregivers: [
          {
            name: "Anna",
            worksPartTime: false,
            salary: 35000,
            partnerSalary: 30000,
          },
        ],
      }),
      30000,
    );
    expect(res.targetMet).toBe(true);
    // net(own + 30 000) ≥ 30 000 ⇒ own gross ≈ 12 857 ⇒ pace ≈ 3.0.
    expect(res.paces["Anna"].phase1).toBeGreaterThan(2.5);
    expect(res.paces["Anna"].phase1).toBeLessThan(3.5);
    // After year 1 the SGI floor kicks in.
    expect(res.paces["Anna"].phase2).toBeGreaterThanOrEqual(5);
    expect(res.sgiLifted).toContain("Anna");
    expect(res.minHouseholdNet).toBeGreaterThanOrEqual(29999);
  });

  it("lets part-time workers keep a slow pace after year 1", () => {
    const res = solveBudget(
      spec({
        blocks: [{ caregiver: "Anna", tier: "income", days: 300, rate: 1000 }],
        caregivers: [
          { name: "Anna", worksPartTime: true, salary: 30000, partnerSalary: 0 },
        ],
      }),
      20000,
    );
    expect(res.paces["Anna"].phase1).toBeLessThan(1.5);
    expect(res.paces["Anna"].phase2).toBeLessThan(5);
    expect(res.sgiLifted).toHaveLength(0);
  });

  it("flags when even the best pace cannot clear the floor", () => {
    const res = solveBudget(
      spec({
        blocks: [{ caregiver: "Anna", tier: "income", days: 300, rate: 300 }],
      }),
      25000,
    );
    expect(res.targetMet).toBe(false);
    expect(res.paces["Anna"].phase1).toBe(7);
  });
});
