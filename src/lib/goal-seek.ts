/**
 * goal-seek.ts — Solve the leave plan backwards from a life constraint.
 *
 * The projection engine answers "given days and paces, when does the leave
 * end?". This module inverts it:
 *
 * - `solveUntilDate`: "we want to be home until <date>" — if the days are
 *   plentiful the leave runs at full pace and is cut at the target (the rest
 *   are saved for later); if they're scarce the paces are stretched just enough
 *   to reach the date; if even maximal stretching falls short, the shortfall is
 *   reported in benefit days.
 * - `solveBudget`: "the household needs at least <kr>/month after tax" — each
 *   leave stretch runs at the slowest pace that still clears the floor, which
 *   maximises the calendar length of the leave.
 *
 * Both respect the SGI rule: after the child turns 1, a caregiver on leave must
 * draw at least 5 days/week (unless they work part-time the rest of the week).
 *
 * Pure and framework-agnostic.
 */

import {
  buildLeaveIntervals,
  type LeaveBlock,
  type LeaveInterval,
  type PaceBreak,
} from "@/lib/projection";
import { addYears, differenceInDays } from "@/lib/dates";
import { SGI_PROTECTION, netAfterTax } from "@/lib/rules";

const DAYS_PER_MONTH = 30.4;
const MIN_PACE = 0.5;
const MAX_PACE = 7;

/** How the results-page paces are chosen. */
export type GoalMode = "manual" | "untilDate" | "budget";

export interface GoalCaregiverCtx {
  name: string;
  /** Works the non-benefit days of the week (exempt from the 5/7 SGI floor). */
  worksPartTime: boolean;
  /** Own gross monthly salary (for the part-time top-up). */
  salary: number;
  /** The other caregiver's gross monthly salary while this one is home. */
  partnerSalary: number;
}

/** A caregiver's allocated days, in leave order, before any schedule exists. */
export interface GoalBlockSpec {
  caregiver: string;
  tier: "income" | "lagsta";
  days: number;
  /** Daily kr for this tier. */
  rate: number;
}

export interface GoalSpec {
  birth: Date;
  /** Where the projection starts (birth, or today for an ongoing plan). */
  start: Date;
  blocks: GoalBlockSpec[];
  caregivers: GoalCaregiverCtx[];
}

export interface GoalResult {
  /** Dated leave segments (already truncated at the target when applicable). */
  intervals: LeaveInterval[];
  /** When the continuous leave ends (null when there is nothing to project). */
  endsAt: Date | null;
  /** untilDate: reached the date. budget: the floor holds in every stretch. */
  targetMet: boolean;
  /** untilDate only: benefit days missing to reach the target (0 otherwise). */
  shortfallDays: number;
  /** untilDate only: leftover days per caregiver when the leave is cut early. */
  savedByCaregiver: Record<string, number>;
  savedTotal: number;
  /** Days actually drawn per caregiver (allocated − saved). */
  usedDays: Record<string, number>;
  /** Lowest household net (own benefit + partner salary + part-time salary). */
  minHouseholdNet: number | null;
  /** Caregivers whose post-1-year pace was lifted to the SGI minimum. */
  sgiLifted: string[];
  /** Solved paces per caregiver (phase1 = before the 1st birthday). */
  paces: Record<string, { phase1: number; phase2: number }>;
}

function partTimeSalary(ctx: GoalCaregiverCtx, pace: number): number {
  if (!ctx.worksPartTime) return 0;
  const p = Math.max(0, Math.min(MAX_PACE, pace));
  return (ctx.salary * (MAX_PACE - p)) / MAX_PACE;
}

function householdNet(
  ctx: GoalCaregiverCtx,
  rate: number,
  pace: number,
): number {
  const ownGross = (rate * pace * DAYS_PER_MONTH) / 7;
  return netAfterTax(ownGross + ctx.partnerSalary + partTimeSalary(ctx, pace));
}

/** The SGI floor for a caregiver's pace after the child's 1st birthday. */
function postYearFloor(ctx: GoalCaregiverCtx): number {
  return ctx.worksPartTime ? MIN_PACE : SGI_PROTECTION.minDaysPerWeekAfterAge1;
}

function scheduleFor(phase1: number, phase2: number, oneYear: Date): PaceBreak[] {
  return [
    { until: oneYear, pace: phase1 },
    { until: null, pace: phase2 },
  ];
}

function ctxFor(spec: GoalSpec, name: string): GoalCaregiverCtx {
  return (
    spec.caregivers.find((c) => c.name === name) ?? {
      name,
      worksPartTime: false,
      salary: 0,
      partnerSalary: 0,
    }
  );
}

/** Build dated intervals from per-caregiver phase paces. */
function intervalsAt(
  spec: GoalSpec,
  paces: Record<string, { phase1: number; phase2: number }>,
  oneYear: Date,
): LeaveInterval[] {
  const blocks: LeaveBlock[] = spec.blocks.map((b) => {
    const p = paces[b.caregiver] ?? { phase1: MAX_PACE, phase2: MAX_PACE };
    return { ...b, schedule: scheduleFor(p.phase1, p.phase2, oneYear) };
  });
  return buildLeaveIntervals(spec.start, blocks);
}

function endOf(intervals: LeaveInterval[], start: Date): Date {
  return intervals.length > 0 ? intervals[intervals.length - 1].endsAt : start;
}

/** Sum of allocated days per caregiver in the spec. */
function allocatedByCaregiver(spec: GoalSpec): Record<string, number> {
  const out: Record<string, number> = {};
  for (const b of spec.blocks) {
    out[b.caregiver] = (out[b.caregiver] ?? 0) + b.days;
  }
  return out;
}

function minNetOver(
  spec: GoalSpec,
  intervals: LeaveInterval[],
): number | null {
  let min: number | null = null;
  for (const seg of intervals) {
    const ctx = ctxFor(spec, seg.caregiver ?? "");
    const net = netAfterTax(
      seg.monthly + ctx.partnerSalary + partTimeSalary(ctx, seg.pace),
    );
    if (min === null || net < min) min = net;
  }
  return min;
}

function sgiLiftedNames(
  spec: GoalSpec,
  paces: Record<string, { phase1: number; phase2: number }>,
  intervals: LeaveInterval[],
  oneYear: Date,
): string[] {
  const out: string[] = [];
  for (const [name, p] of Object.entries(paces)) {
    const ctx = ctxFor(spec, name);
    if (ctx.worksPartTime) continue;
    const extendsPast = intervals.some(
      (s) => s.caregiver === name && s.endsAt.getTime() > oneYear.getTime(),
    );
    if (extendsPast && p.phase1 < SGI_PROTECTION.minDaysPerWeekAfterAge1 - 1e-9)
      out.push(name);
  }
  return out;
}

function round1(n: number): number {
  return Math.round(n * 10) / 10;
}

/**
 * Cut the intervals at `cutoff` and account how many benefit days each
 * caregiver actually drew. A straddling interval is shortened pro rata.
 */
function truncateAt(
  intervals: LeaveInterval[],
  cutoff: Date,
): { clipped: LeaveInterval[]; usedDays: Record<string, number> } {
  const clipped: LeaveInterval[] = [];
  const usedDays: Record<string, number> = {};
  for (const seg of intervals) {
    if (seg.startsAt.getTime() >= cutoff.getTime()) break;
    const cut = seg.endsAt.getTime() > cutoff.getTime();
    const end = cut ? cutoff : seg.endsAt;
    const calDays = Math.max(0, differenceInDays(seg.startsAt, end));
    const days = (calDays / 7) * seg.pace;
    const key = seg.caregiver ?? "";
    usedDays[key] = (usedDays[key] ?? 0) + days;
    clipped.push(cut ? { ...seg, endsAt: end } : seg);
    if (cut) break;
  }
  return { clipped, usedDays };
}

function buildResult(
  spec: GoalSpec,
  paces: Record<string, { phase1: number; phase2: number }>,
  intervals: LeaveInterval[],
  oneYear: Date,
  extra: Pick<
    GoalResult,
    "targetMet" | "shortfallDays" | "savedByCaregiver" | "usedDays"
  >,
): GoalResult {
  const savedTotal = Object.values(extra.savedByCaregiver).reduce(
    (a, b) => a + b,
    0,
  );
  return {
    intervals,
    endsAt: intervals.length > 0 ? endOf(intervals, spec.start) : null,
    minHouseholdNet: minNetOver(spec, intervals),
    sgiLifted: sgiLiftedNames(spec, paces, intervals, oneYear),
    paces,
    savedTotal,
    ...extra,
  };
}

/**
 * Reach `target` as the end of the continuous leave.
 *
 * Plenty of days → full pace, cut at the target, leftovers saved. Scarce days →
 * the paces are scaled down together (never below the SGI floor after year 1)
 * just enough to land on the target. Impossible → maximal stretch plus a
 * shortfall in benefit days.
 */
export function solveUntilDate(spec: GoalSpec, target: Date): GoalResult {
  const oneYear = addYears(spec.birth, 1);
  const allocated = allocatedByCaregiver(spec);
  const names = Object.keys(allocated);

  // s ∈ [0, 1]: 0 = paces at their floors (longest leave), 1 = full pace.
  const pacesAt = (s: number) => {
    const out: Record<string, { phase1: number; phase2: number }> = {};
    for (const name of names) {
      const f2 = postYearFloor(ctxFor(spec, name));
      out[name] = {
        phase1: round1(MIN_PACE + s * (MAX_PACE - MIN_PACE)),
        phase2: round1(f2 + s * (MAX_PACE - f2)),
      };
    }
    return out;
  };
  const endAt = (s: number) =>
    endOf(intervalsAt(spec, pacesAt(s), oneYear), spec.start);

  const noSaved: Record<string, number> = {};
  for (const name of names) noSaved[name] = 0;

  // Plenty of days: run at full pace and cut the leave at the target.
  if (endAt(1).getTime() >= target.getTime()) {
    const paces = pacesAt(1);
    const full = intervalsAt(spec, paces, oneYear);
    const { clipped, usedDays } = truncateAt(full, target);
    const saved: Record<string, number> = {};
    for (const name of names) {
      saved[name] = Math.max(0, allocated[name] - (usedDays[name] ?? 0));
      usedDays[name] = usedDays[name] ?? 0;
    }
    return buildResult(spec, paces, clipped, oneYear, {
      targetMet: true,
      shortfallDays: 0,
      savedByCaregiver: saved,
      usedDays,
    });
  }

  // Even maximal stretching falls short: report the missing days.
  const endSlow = endAt(0);
  if (endSlow.getTime() < target.getTime()) {
    const paces = pacesAt(0);
    const intervals = intervalsAt(spec, paces, oneYear);
    const tailPace =
      intervals.length > 0
        ? intervals[intervals.length - 1].pace
        : SGI_PROTECTION.minDaysPerWeekAfterAge1;
    const missingCal = differenceInDays(endSlow, target);
    return buildResult(spec, paces, intervals, oneYear, {
      targetMet: false,
      shortfallDays: Math.ceil((missingCal / 7) * tailPace),
      savedByCaregiver: noSaved,
      usedDays: allocated,
    });
  }

  // Stretch just enough: the fastest pace scale whose end still reaches the
  // target (end date decreases monotonically in s).
  let lo = 0;
  let hi = 1;
  for (let i = 0; i < 40; i++) {
    const mid = (lo + hi) / 2;
    if (endAt(mid).getTime() >= target.getTime()) lo = mid;
    else hi = mid;
  }
  const paces = pacesAt(lo);
  const intervals = intervalsAt(spec, paces, oneYear);
  return buildResult(spec, paces, intervals, oneYear, {
    targetMet: true,
    shortfallDays: 0,
    savedByCaregiver: noSaved,
    usedDays: allocated,
  });
}

/**
 * The slowest pace per stretch that keeps the household's net monthly income
 * at or above `floorNet` — the longest affordable leave. Where even full pace
 * can't clear the floor, the income-maximising pace is used and the result is
 * flagged (`targetMet: false`).
 */
export function solveBudget(spec: GoalSpec, floorNet: number): GoalResult {
  const oneYear = addYears(spec.birth, 1);
  const allocated = allocatedByCaregiver(spec);

  // Smallest pace in [minPace, 7] whose household net clears the floor; if
  // none does, the pace that pays the most (part-timers can earn more at a
  // LOWER pace, so this is not always 7).
  const paceForFloor = (
    ctx: GoalCaregiverCtx,
    rate: number,
    minPace: number,
  ): number => {
    let best: number | null = null;
    let argmax = minPace;
    let maxNet = -Infinity;
    for (let i = Math.round(minPace * 10); i <= MAX_PACE * 10; i++) {
      const pace = i / 10;
      const net = householdNet(ctx, rate, pace);
      if (net > maxNet) {
        maxNet = net;
        argmax = pace;
      }
      if (best === null && net >= floorNet) best = pace;
    }
    return best ?? argmax;
  };

  const paces: Record<string, { phase1: number; phase2: number }> = {};
  const blocks: LeaveBlock[] = spec.blocks.map((b) => {
    const ctx = ctxFor(spec, b.caregiver);
    const phase1 = paceForFloor(ctx, b.rate, MIN_PACE);
    const phase2 = paceForFloor(ctx, b.rate, postYearFloor(ctx));
    // Represent the caregiver by their income-tier paces (shown on the card).
    if (b.tier === "income" || !paces[b.caregiver]) {
      paces[b.caregiver] = { phase1, phase2 };
    }
    return { ...b, schedule: scheduleFor(phase1, phase2, oneYear) };
  });

  const intervals = buildLeaveIntervals(spec.start, blocks);
  const minNet = minNetOver(spec, intervals);
  const noSaved: Record<string, number> = {};
  for (const name of Object.keys(allocated)) noSaved[name] = 0;

  return buildResult(spec, paces, intervals, oneYear, {
    targetMet: minNet === null || minNet >= floorNet - 1,
    shortfallDays: 0,
    savedByCaregiver: noSaved,
    usedDays: allocated,
  });
}
