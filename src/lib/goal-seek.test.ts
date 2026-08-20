import { describe, expect, it } from "vitest";

import { solvePlan, type CaregiverPlanSpec } from "@/lib/goal-seek";
import { addDays, differenceInDays, parseIsoDate } from "@/lib/dates";

const birth = parseIsoDate("2025-01-15");

function cg(overrides: Partial<CaregiverPlanSpec> = {}): CaregiverPlanSpec {
  return {
    name: "Anna",
    worksPartTime: false,
    salary: 35000,
    partnerSalary: 0,
    incomeDays: 390,
    incomeRate: 1000,
    lagstaDays: 0,
    lagstaRate: 180,
    mode: "manual",
    ...overrides,
  };
}

describe("solvePlan — manual", () => {
  it("chains caregivers sequentially and lifts pace to the SGI floor", () => {
    const res = solvePlan(birth, birth, [
      cg({ name: "Anna", incomeDays: 90, manualPace: 7 }),
      cg({ name: "Bea", incomeDays: 300, manualPace: 2 }),
    ]);
    const [anna, bea] = res.perCaregiver;
    // Bea starts where Anna ends.
    expect(bea.startsAt?.getTime()).toBe(anna.endsAt?.getTime());
    // Bea's slow pace extends past year 1 → lifted to 5 after the birthday.
    expect(bea.paces.phase2).toBe(5);
    expect(bea.sgiLifted).toBe(true);
    expect(anna.sgiLifted).toBe(false);
  });

  it("saves deliberately set-aside days, lägsta first", () => {
    const res = solvePlan(birth, birth, [
      cg({ incomeDays: 300, lagstaDays: 45, saveDays: 100 }),
    ]);
    const [anna] = res.perCaregiver;
    expect(anna.savedDays).toBe(100);
    expect(anna.usedDays).toBe(245);
    // 45 came from lägsta, 55 from income → the projection draws 245 income.
    expect(res.intervals.every((s) => s.tier === "income")).toBe(true);
  });

  it("honours a delayed start (a gap where both work)", () => {
    const late = addDays(birth, 60);
    const res = solvePlan(birth, birth, [
      cg({ incomeDays: 90, startAt: late }),
    ]);
    expect(res.perCaregiver[0].startsAt?.getTime()).toBe(late.getTime());
  });
});

describe("solvePlan — untilDate", () => {
  it("cuts at the target and saves the leftover days", () => {
    const target = addDays(birth, 90);
    const res = solvePlan(birth, birth, [
      cg({ mode: "untilDate", targetDate: target }),
    ]);
    const [anna] = res.perCaregiver;
    expect(anna.targetMet).toBe(true);
    expect(res.endsAt?.getTime()).toBe(target.getTime());
    expect(anna.savedDays).toBeGreaterThan(290);
    expect(anna.savedDays).toBeLessThan(310);
  });

  it("stretches just enough to reach a far target", () => {
    const target = addDays(birth, 540);
    const res = solvePlan(birth, birth, [
      cg({ mode: "untilDate", targetDate: target }),
    ]);
    const [anna] = res.perCaregiver;
    expect(anna.targetMet).toBe(true);
    expect(anna.savedDays).toBe(0);
    const overshoot = differenceInDays(target, res.endsAt!);
    expect(overshoot).toBeGreaterThanOrEqual(0);
    expect(overshoot).toBeLessThan(30);
    expect(anna.paces.phase1).toBeLessThan(7);
    expect(anna.paces.phase2).toBeGreaterThanOrEqual(5);
  });

  it("reports the shortfall when the target is out of reach", () => {
    const res = solvePlan(birth, birth, [
      cg({ mode: "untilDate", targetDate: addDays(birth, 730), incomeDays: 60 }),
    ]);
    expect(res.perCaregiver[0].targetMet).toBe(false);
    expect(res.perCaregiver[0].shortfallDays).toBeGreaterThan(100);
  });

  it("lets the second caregiver target the whole leave's end date", () => {
    const target = addDays(birth, 200);
    const res = solvePlan(birth, birth, [
      cg({ name: "Anna", incomeDays: 90, manualPace: 7 }),
      cg({ name: "Bea", incomeDays: 300, mode: "untilDate", targetDate: target }),
    ]);
    expect(res.endsAt?.getTime()).toBe(target.getTime());
    expect(res.perCaregiver[1].savedDays).toBeGreaterThan(0);
  });
});

describe("solvePlan — budget", () => {
  it("finds the slowest pace that clears the household floor", () => {
    const res = solvePlan(birth, birth, [
      cg({
        mode: "budget",
        budgetFloor: 30000,
        incomeDays: 300,
        partnerSalary: 30000,
      }),
    ]);
    const [anna] = res.perCaregiver;
    expect(anna.targetMet).toBe(true);
    // Taxed per person: the partner's 30 000 salary nets ≈ 23 600 on its own
    // (jobbskatteavdrag), so Anna only needs ≈ 8 300 of benefit to clear the
    // floor — pace 1,9 nets 30 099 for the household where 1,8 falls short.
    expect(anna.paces.phase1).toBeGreaterThan(1.5);
    expect(anna.paces.phase1).toBeLessThan(2.3);
    expect(anna.paces.phase2).toBeGreaterThanOrEqual(5);
    expect(anna.sgiLifted).toBe(true);
    expect(res.minHouseholdNet).toBeGreaterThanOrEqual(29999);
  });

  it("lets part-time workers keep a slow pace after year 1", () => {
    const res = solvePlan(birth, birth, [
      cg({
        mode: "budget",
        budgetFloor: 20000,
        incomeDays: 300,
        worksPartTime: true,
        salary: 30000,
      }),
    ]);
    const [anna] = res.perCaregiver;
    expect(anna.paces.phase1).toBeLessThan(1.5);
    expect(anna.paces.phase2).toBeLessThan(5);
    expect(anna.sgiLifted).toBe(false);
  });

  it("flags when even the best pace cannot clear the floor", () => {
    const res = solvePlan(birth, birth, [
      cg({ mode: "budget", budgetFloor: 25000, incomeDays: 300, incomeRate: 300 }),
    ]);
    expect(res.perCaregiver[0].targetMet).toBe(false);
    expect(res.perCaregiver[0].paces.phase1).toBe(7);
  });
});
