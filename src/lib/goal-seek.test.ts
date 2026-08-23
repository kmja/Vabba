import { describe, expect, it } from "vitest";

import {
  partTimeSalaryAt,
  solvePlan,
  type CaregiverPlanSpec,
} from "@/lib/goal-seek";
import {
  addDays,
  addMonths,
  addYears,
  differenceInDays,
  parseIsoDate,
} from "@/lib/dates";

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

describe("solvePlan — a length rather than a date", () => {
  it("measures the months from where that caregiver starts", () => {
    // Anna is home first at full pace; Bea asked for six months of her own,
    // which must be six months from where Anna leaves off — not six months
    // from the birth.
    const res = solvePlan(birth, birth, [
      cg({ name: "Anna", incomeDays: 90, manualPace: 7 }),
      cg({
        name: "Bea",
        incomeDays: 300,
        mode: "untilDate",
        targetMonths: 6,
      }),
    ]);
    const [anna, bea] = res.perCaregiver;
    expect(bea.targetMet).toBe(true);
    expect(bea.startsAt?.getTime()).toBe(anna.endsAt?.getTime());
    const months =
      differenceInDays(bea.startsAt!, bea.endsAt!) / 30.4;
    expect(months).toBeGreaterThan(5.8);
    expect(months).toBeLessThan(6.2);
  });

  it("moves with the caregiver before it", () => {
    // The same length, but Anna is home longer — Bea's six months slide
    // along rather than staying pinned to a date chosen earlier.
    const short = solvePlan(birth, birth, [
      cg({ name: "Anna", incomeDays: 40, manualPace: 7 }),
      cg({ name: "Bea", incomeDays: 300, mode: "untilDate", targetMonths: 6 }),
    ]);
    const long = solvePlan(birth, birth, [
      cg({ name: "Anna", incomeDays: 180, manualPace: 7 }),
      cg({ name: "Bea", incomeDays: 300, mode: "untilDate", targetMonths: 6 }),
    ]);
    expect(long.perCaregiver[1].startsAt!.getTime()).toBeGreaterThan(
      short.perCaregiver[1].startsAt!.getTime(),
    );
    // Both are still six months long.
    for (const res of [short, long]) {
      const bea = res.perCaregiver[1];
      const months = differenceInDays(bea.startsAt!, bea.endsAt!) / 30.4;
      expect(months).toBeGreaterThan(5.8);
      expect(months).toBeLessThan(6.2);
    }
  });

  it("reports the days missing when the length cannot be covered", () => {
    // Only her reserved days: six months at the post-1-year SGI floor needs
    // far more than 70, and the shortfall is what the allocation must close.
    const res = solvePlan(birth, birth, [
      cg({ name: "Anna", incomeDays: 300, manualPace: 7 }),
      cg({ name: "Bea", incomeDays: 70, mode: "untilDate", targetMonths: 6 }),
    ]);
    const bea = res.perCaregiver[1];
    expect(bea.targetMet).toBe(false);
    expect(bea.shortfallDays).toBeGreaterThan(0);
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
    // The point of the test: working the rest of the week exempts her from
    // the 5-days-a-week SGI floor, so the pace stays low on both sides of
    // the first birthday. (The exact figure moved when part-time pay
    // started being measured against a 5-day working week — less salary
    // left over means slightly more benefit is needed to clear the floor.)
    expect(anna.paces.phase1).toBeLessThan(2.5);
    expect(anna.paces.phase2).toBeLessThan(5);
    expect(anna.sgiLifted).toBe(false);
  });

  it("measures a part-timer's remaining salary against a 5-day working week", () => {
    // Föräldrapenning is a calendar-day benefit, but salary is only lost on
    // days you would have worked. Försäkringskassan sizes partial days the
    // same way — 50 % work is 2,5 dagar/vecka, not the 3,5 a 7-day week
    // would imply. Dividing by 7 overstated the pay left over, which then
    // let the budget solver settle on a slower pace than the floor allows.
    expect(partTimeSalaryAt(40000, 2.5)).toBeCloseTo(20000, 6);
    expect(partTimeSalaryAt(40000, 1.25)).toBeCloseTo(30000, 6);
    // At (and past) a full working week there is no salary left to keep.
    expect(partTimeSalaryAt(40000, 5)).toBe(0);
    expect(partTimeSalaryAt(40000, 7)).toBe(0);
    expect(partTimeSalaryAt(40000, 0)).toBe(40000);
  });

  it("flags when even the best pace cannot clear the floor", () => {
    const res = solvePlan(birth, birth, [
      cg({ mode: "budget", budgetFloor: 25000, incomeDays: 300, incomeRate: 300 }),
    ]);
    expect(res.perCaregiver[0].targetMet).toBe(false);
    expect(res.perCaregiver[0].paces.phase1).toBe(7);
  });
});

describe("solvePlan — dubbeldagar", () => {
  it("gives the second caregiver a dated overlap at the very start, on top of their own later stretch", () => {
    const res = solvePlan(birth, birth, [
      cg({ name: "Anna", incomeDays: 90, manualPace: 7 }),
      cg({ name: "Bea", incomeDays: 300, manualPace: 7, doubleDays: 20 }),
    ]);
    const overlap = res.intervals.filter(
      (s) => s.caregiver === "Bea" && s.startsAt.getTime() === birth.getTime(),
    );
    expect(overlap.length).toBeGreaterThan(0);
    // 20 days at pace 7 (every day counts) is 20 calendar days.
    const overlapEnd = overlap[overlap.length - 1].endsAt;
    expect(differenceInDays(birth, overlapEnd)).toBe(20);
    expect(overlap.every((s) => Math.abs(s.pace - 7) < 1e-9)).toBe(true);

    // Bea's own sequential stretch still starts where Anna's ends — the
    // overlap is additional, not a delay to her own turn — and only draws
    // what's left of her pool after the 20 spent on the overlap: 280 days
    // at pace 7 is 280 calendar days, not the 300 she'd get without it.
    const [anna, bea] = res.perCaregiver;
    expect(bea.startsAt?.getTime()).toBe(anna.endsAt?.getTime());
    expect(differenceInDays(bea.startsAt!, bea.endsAt!)).toBe(280);
    // Anna is unaffected — the days come out of Bea's own pool.
    expect(anna.usedDays).toBe(90);
    // Bea's total draw is still her full 300 — 20 spent concurrently with
    // Anna at the start, 280 in her own stretch after. Dubbeldagar aren't a
    // bonus on top of the allocated pool, just a different shape for it.
    expect(bea.usedDays).toBe(300);
  });

  it("is meaningless for the first caregiver — there's no one to overlap with yet", () => {
    const res = solvePlan(birth, birth, [
      cg({ name: "Anna", incomeDays: 90, manualPace: 7, doubleDays: 20 }),
    ]);
    expect(res.intervals.length).toBe(1);
    expect(res.perCaregiver[0].usedDays).toBe(90);
  });

  it("cannot draw more dubbeldagar than the caregiver's own pool holds", () => {
    const res = solvePlan(birth, birth, [
      cg({ name: "Anna", incomeDays: 90, manualPace: 7 }),
      cg({ name: "Bea", incomeDays: 10, manualPace: 7, doubleDays: 20 }),
    ]);
    const overlap = res.intervals.filter(
      (s) => s.caregiver === "Bea" && s.startsAt.getTime() === birth.getTime(),
    );
    const overlapEnd = overlap[overlap.length - 1].endsAt;
    expect(differenceInDays(birth, overlapEnd)).toBe(10);
    expect(res.perCaregiver[1].usedDays).toBe(10);
  });

  it("starts after a delay — e.g. a birth-days window that comes first", () => {
    const res = solvePlan(birth, birth, [
      cg({ name: "Anna", incomeDays: 90, manualPace: 7 }),
      cg({
        name: "Bea",
        incomeDays: 300,
        manualPace: 7,
        doubleDays: 20,
        doubleDaysDelay: 10,
      }),
    ]);
    const bea = res.intervals.filter((s) => s.caregiver === "Bea");
    expect(bea[0].startsAt.getTime()).toBe(addDays(birth, 10).getTime());
    expect(differenceInDays(bea[0].startsAt, bea[0].endsAt)).toBe(20);
  });

  it("puts BOTH caregivers on a whole day for the window, whatever pace the first one is otherwise on", () => {
    // A dubbeldag is one calendar day that both of them draw a full day
    // for. The first caregiver used to just carry on at their own goal's
    // pace through the window, so a plan claiming 20 dubbeldagar could
    // deliver as little as one and a half of them while charging the
    // family for forty days.
    const res = solvePlan(birth, birth, [
      cg({ name: "Anna", mode: "budget", budgetFloor: 0, incomeDays: 195 }),
      cg({ name: "Bea", mode: "budget", budgetFloor: 0, incomeDays: 195, doubleDays: 20 }),
    ]);
    const window = res.doubleDaysWindow!;
    expect(window).not.toBeNull();

    const drawnInWindow = (name: string) =>
      res.intervals
        .filter((s) => s.caregiver === name)
        .reduce((sum, s) => {
          const from = Math.max(s.startsAt.getTime(), window.startsAt.getTime());
          const to = Math.min(s.endsAt.getTime(), window.endsAt.getTime());
          return to > from ? sum + ((to - from) / 86_400_000 / 7) * s.pace : sum;
        }, 0);

    expect(differenceInDays(window.startsAt, window.endsAt)).toBe(20);
    expect(drawnInWindow("Bea")).toBeCloseTo(20, 6);
    // Anna is on a slow pace either side of the window and a whole day
    // inside it — otherwise these are not dubbeldagar at all.
    expect(drawnInWindow("Anna")).toBeCloseTo(20, 6);
    expect(res.perCaregiver[0].paces.phase1).toBeLessThan(7);
  });

  it("cannot draw more dubbeldagar than the FIRST caregiver's pool holds either", () => {
    // One day out of each pot, so the shorter pot bounds the window.
    const res = solvePlan(birth, birth, [
      cg({ name: "Anna", incomeDays: 12, manualPace: 7 }),
      cg({ name: "Bea", incomeDays: 300, manualPace: 7, doubleDays: 40 }),
    ]);
    const window = res.doubleDaysWindow!;
    expect(differenceInDays(window.startsAt, window.endsAt)).toBe(12);
  });

  it("clamps the window to the 15-month deadline", () => {
    // The deadline is a day budget as much as a date: one calendar day per
    // dubbeldag, so a window starting late simply has fewer left in it.
    const late = solvePlan(birth, birth, [
      cg({ name: "Anna", incomeDays: 390, manualPace: 7 }),
      cg({
        name: "Bea",
        incomeDays: 390,
        manualPace: 7,
        doubleDays: 60,
        doubleDaysDelay: 420,
      }),
    ]);
    const deadline = addMonths(birth, 15);
    expect(late.doubleDaysWindow!.endsAt.getTime()).toBeLessThanOrEqual(
      deadline.getTime(),
    );

    // Starting past the deadline leaves no window at all.
    const past = solvePlan(birth, birth, [
      cg({ name: "Anna", incomeDays: 390, manualPace: 7 }),
      cg({
        name: "Bea",
        incomeDays: 390,
        manualPace: 7,
        doubleDays: 60,
        doubleDaysDelay: 500,
      }),
    ]);
    expect(past.doubleDaysWindow).toBeNull();
  });
});

describe("solvePlan — the income days' expiry date", () => {
  it("will not stretch income days past the child's 4th birthday", () => {
    // "As long as possible" used to mean 0,5 dagar/vecka indefinitely — a
    // part-timer's plan ran to the child's 9th birthday, spending days that
    // are forfeited at 4.
    const res = solvePlan(birth, birth, [
      cg({
        mode: "budget",
        budgetFloor: 0,
        incomeDays: 195,
        lagstaDays: 45,
        worksPartTime: true,
      }),
    ]);
    const age4 = addYears(birth, 4);
    for (const seg of res.intervals) {
      if (seg.tier !== "income") continue;
      expect(seg.endsAt.getTime()).toBeLessThanOrEqual(age4.getTime());
    }
    expect(res.incomeDaysPastDeadline).toBe(0);
    // Lägstanivå days are not bound by the 4-year date — they last until
    // 12 — so they may still run on past it.
    expect(res.endsAt!.getTime()).toBeGreaterThan(age4.getTime());
  });

  it("holds the floor in manual mode too", () => {
    const res = solvePlan(birth, birth, [
      cg({ mode: "manual", manualPace: 1, incomeDays: 390, lagstaDays: 90 }),
    ]);
    // A hand-picked 1 day/week cannot fit 390 days before the 4th birthday.
    expect(res.perCaregiver[0].paces.phase1).toBeGreaterThan(1);
    expect(res.incomeDaysPastDeadline).toBe(0);
  });

  it("reports the overrun when no pace can fit the days that are left", () => {
    // Starting six months before the deadline with a full pot: even every
    // single day of the week does not get through 390 of them.
    const res = solvePlan(birth, addYears(birth, 4 - 0.5), [
      cg({ incomeDays: 390, lagstaDays: 90, manualPace: 7 }),
    ]);
    expect(res.perCaregiver[0].paces.phase1).toBe(7);
    expect(res.incomeDaysPastDeadline).toBeGreaterThan(0);
  });

  it("leaves an ordinary plan alone", () => {
    const res = solvePlan(birth, birth, [
      cg({ name: "Anna", incomeDays: 195, lagstaDays: 45, manualPace: 7 }),
      cg({ name: "Bea", incomeDays: 195, lagstaDays: 45, manualPace: 7 }),
    ]);
    expect(res.perCaregiver.map((o) => o.paces.phase1)).toEqual([7, 7]);
    expect(res.incomeDaysPastDeadline).toBe(0);
  });
});
