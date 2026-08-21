/**
 * goal-seek.ts — Solve each caregiver's leave from their own goal.
 *
 * Caregivers are home in turn; each one's stretch is solved independently from
 * where the previous one ended (the cursor), according to their chosen mode:
 *
 * - `manual`: draw days at a chosen pace (with the optional switch-at-1-year
 *   phases), exactly like adjusting the levers by hand.
 * - `untilDate`: be home until a target date — plenty of days → full pace and
 *   the rest saved for later; scarce days → the pace stretches just enough;
 *   out of reach → the shortfall is reported in benefit days.
 * - `budget`: every stretch runs at the slowest pace that keeps household net
 *   income above a floor, maximising the calendar length of the leave.
 *
 * All modes respect the SGI rule: after the child turns 1, a caregiver on
 * leave must draw at least 5 days/week (unless they work part-time the rest of
 * the week). A caregiver can also deliberately save days (`saveDays`) and
 * delay their start (`startAt`), which leaves a gap where both work.
 *
 * Pure and framework-agnostic.
 */

import {
  buildLeaveIntervals,
  type LeaveBlock,
  type LeaveInterval,
  type PaceBreak,
} from "@/lib/projection";
import { addMonths, addYears, differenceInDays } from "@/lib/dates";
import { SGI_PROTECTION } from "@/lib/rules";
import { DEFAULT_MUNICIPAL_RATE, householdNet } from "@/lib/tax";

const DAYS_PER_MONTH = 30.4;
const MIN_PACE = 0.5;
const MAX_PACE = 7;

/** How a caregiver's stretch is planned. */
export type GoalMode = "manual" | "untilDate" | "budget";

export interface CaregiverPlanSpec {
  name: string;
  /** Works the non-benefit days of the week (exempt from the 5/7 SGI floor). */
  worksPartTime: boolean;
  /** Own gross monthly salary (for the part-time top-up). */
  salary: number;
  /** The other caregiver's gross monthly salary while this one is home. */
  partnerSalary: number;
  /** Income-based days allocated to this caregiver (incl. carried-over). */
  incomeDays: number;
  incomeRate: number;
  /** Flat lägstanivå days allocated (0 when they're excluded from the plan). */
  lagstaDays: number;
  lagstaRate: number;
  mode: GoalMode;
  /** manual: days/week (defaults to 7). */
  manualPace?: number;
  /** manual: explicit switch-at-1-year phases (from the results levers). */
  switchPhases?: { phase1: number; phase2: number } | null;
  /** untilDate: stay home until this date. */
  targetDate?: Date | null;
  /**
   * untilDate, as a length rather than a date: stay home this many months
   * from wherever THIS caregiver's stretch begins. Someone who asked for
   * "6 månader" meant six months of leave, not the calendar date that
   * happened to be six months out when they picked it — so it has to be
   * resolved against the cursor, after the caregivers before them are known.
   * Takes precedence over `targetDate`.
   */
  targetMonths?: number | null;
  /** budget: household net floor in kr/month. */
  budgetFloor?: number;
  /** Days to deliberately leave unused (drawn from lägsta first). */
  saveDays?: number;
  /** Start this caregiver's stretch later (a gap where both work). */
  startAt?: Date | null;
}

export interface CaregiverOutcome {
  name: string;
  startsAt: Date | null;
  endsAt: Date | null;
  /** Days actually drawn (allocated − saved). */
  usedDays: number;
  /** Days left unused: deliberate `saveDays` + anything cut by a date goal. */
  savedDays: number;
  paces: { phase1: number; phase2: number };
  /** untilDate: reached the date. budget: the floor holds. manual: true. */
  targetMet: boolean;
  /** untilDate only: benefit days missing to reach the target. */
  shortfallDays: number;
  /** True when the post-1-year SGI floor lifted this caregiver's pace. */
  sgiLifted: boolean;
  /**
   * Lowest household net (kr/month) during this caregiver's own stretch. In
   * budget mode, when the floor cannot be met the solver already runs at the
   * pace that pays most — so this is the highest floor that IS reachable.
   */
  lowestHouseholdNet: number | null;
}

export interface PlanSolve {
  /** All caregivers' dated segments, in leave order. */
  intervals: LeaveInterval[];
  perCaregiver: CaregiverOutcome[];
  endsAt: Date | null;
  savedTotal: number;
  /** Lowest household net (benefit + partner salary + part-time salary). */
  minHouseholdNet: number | null;
}

// -----------------------------------------------------------------------------
// Shared helpers
// -----------------------------------------------------------------------------

function partTimeSalary(spec: CaregiverPlanSpec, pace: number): number {
  if (!spec.worksPartTime) return 0;
  const p = Math.max(0, Math.min(MAX_PACE, pace));
  return (spec.salary * (MAX_PACE - p)) / MAX_PACE;
}

/**
 * The household's net while this caregiver is home — each person taxed on
 * their own income. Föräldrapenning carries no jobbskatteavdrag, so it keeps
 * less of each krona than the partner's salary does.
 */
function netWhileHome(
  spec: CaregiverPlanSpec,
  rate: number,
  pace: number,
  municipalRate: number,
): number {
  return householdNet(
    [
      {
        benefit: (rate * pace * DAYS_PER_MONTH) / 7,
        salary: partTimeSalary(spec, pace),
      },
      { salary: spec.partnerSalary },
    ],
    municipalRate,
  );
}

/** The same, for a segment whose monthly benefit is already known. */
function netForSegment(
  spec: CaregiverPlanSpec,
  monthlyBenefit: number,
  pace: number,
  municipalRate: number,
): number {
  return householdNet(
    [
      { benefit: monthlyBenefit, salary: partTimeSalary(spec, pace) },
      { salary: spec.partnerSalary },
    ],
    municipalRate,
  );
}

/** The SGI floor for this caregiver's pace after the child's 1st birthday. */
function postYearFloor(spec: CaregiverPlanSpec): number {
  return spec.worksPartTime
    ? MIN_PACE
    : SGI_PROTECTION.minDaysPerWeekAfterAge1;
}

function schedule(
  phase1: number,
  phase2: number,
  oneYear: Date,
): PaceBreak[] {
  return [
    { until: oneYear, pace: phase1 },
    { until: null, pace: phase2 },
  ];
}

function round1(n: number): number {
  return Math.round(n * 10) / 10;
}

interface Pools {
  income: number;
  lagsta: number;
  saved: number;
}

/** Apply the deliberate `saveDays` — lägsta days are set aside first. */
function applySaveDays(spec: CaregiverPlanSpec): Pools {
  const total = spec.incomeDays + spec.lagstaDays;
  const save = Math.max(0, Math.min(spec.saveDays ?? 0, total));
  const fromLagsta = Math.min(save, spec.lagstaDays);
  const fromIncome = save - fromLagsta;
  return {
    income: spec.incomeDays - fromIncome,
    lagsta: spec.lagstaDays - fromLagsta,
    saved: save,
  };
}

function blocksFor(
  spec: CaregiverPlanSpec,
  pools: Pools,
  phases: { phase1: number; phase2: number },
  oneYear: Date,
): LeaveBlock[] {
  const sched = schedule(phases.phase1, phases.phase2, oneYear);
  return [
    {
      caregiver: spec.name,
      tier: "income" as const,
      days: pools.income,
      rate: spec.incomeRate,
      schedule: sched,
    },
    {
      caregiver: spec.name,
      tier: "lagsta" as const,
      days: pools.lagsta,
      rate: spec.lagstaRate,
      schedule: sched,
    },
  ].filter((b) => b.days > 0);
}

/** Cut intervals at `cutoff`; returns the clipped list and the days drawn. */
function truncateAt(
  intervals: LeaveInterval[],
  cutoff: Date,
): { clipped: LeaveInterval[]; used: number } {
  const clipped: LeaveInterval[] = [];
  let used = 0;
  for (const seg of intervals) {
    if (seg.startsAt.getTime() >= cutoff.getTime()) break;
    const cut = seg.endsAt.getTime() > cutoff.getTime();
    const end = cut ? cutoff : seg.endsAt;
    const calDays = Math.max(0, differenceInDays(seg.startsAt, end));
    used += (calDays / 7) * seg.pace;
    clipped.push(cut ? { ...seg, endsAt: end } : seg);
    if (cut) break;
  }
  return { clipped, used };
}

// -----------------------------------------------------------------------------
// Per-caregiver solvers
// -----------------------------------------------------------------------------

interface OneResult {
  intervals: LeaveInterval[];
  outcome: CaregiverOutcome;
}

function outcomeOf(
  spec: CaregiverPlanSpec,
  intervals: LeaveInterval[],
  phases: { phase1: number; phase2: number },
  pools: Pools,
  oneYear: Date,
  extra: Pick<CaregiverOutcome, "targetMet" | "shortfallDays"> & {
    extraSaved?: number;
  },
  municipalRate: number,
): OneResult {
  const allocated = spec.incomeDays + spec.lagstaDays;
  const saved = pools.saved + (extra.extraSaved ?? 0);
  const extendsPastYear = intervals.some(
    (s) => s.endsAt.getTime() > oneYear.getTime(),
  );
  let lowestNet: number | null = null;
  for (const seg of intervals) {
    const net = netForSegment(spec, seg.monthly, seg.pace, municipalRate);
    if (lowestNet === null || net < lowestNet) lowestNet = net;
  }
  return {
    intervals,
    outcome: {
      name: spec.name,
      startsAt: intervals.length > 0 ? intervals[0].startsAt : null,
      endsAt:
        intervals.length > 0 ? intervals[intervals.length - 1].endsAt : null,
      usedDays: Math.max(0, allocated - saved),
      savedDays: saved,
      paces: phases,
      targetMet: extra.targetMet,
      shortfallDays: extra.shortfallDays,
      sgiLifted:
        !spec.worksPartTime &&
        extendsPastYear &&
        phases.phase1 < SGI_PROTECTION.minDaysPerWeekAfterAge1 - 1e-9,
      lowestHouseholdNet: lowestNet,
    },
  };
}

function solveManual(
  spec: CaregiverPlanSpec,
  pools: Pools,
  cursor: Date,
  oneYear: Date,
  municipalRate: number,
): OneResult {
  const sgiMin = SGI_PROTECTION.minDaysPerWeekAfterAge1;
  let phases: { phase1: number; phase2: number };
  if (spec.switchPhases) {
    const floor = spec.worksPartTime ? MIN_PACE : sgiMin;
    phases = {
      phase1: Math.max(MIN_PACE, spec.switchPhases.phase1),
      phase2: Math.max(floor, spec.switchPhases.phase2),
    };
  } else {
    const p = Math.max(1, spec.manualPace ?? MAX_PACE);
    // Below the SGI floor and not part-time: keep the chosen pace while SGI is
    // protected (year 1), then lift to the minimum.
    phases = {
      phase1: p,
      phase2: !spec.worksPartTime && p < sgiMin ? sgiMin : p,
    };
  }
  const intervals = buildLeaveIntervals(
    cursor,
    blocksFor(spec, pools, phases, oneYear),
  );
  return outcomeOf(
    spec,
    intervals,
    phases,
    pools,
    oneYear,
    { targetMet: true, shortfallDays: 0 },
    municipalRate,
  );
}

function solveUntilDate(
  spec: CaregiverPlanSpec,
  pools: Pools,
  cursor: Date,
  oneYear: Date,
  target: Date,
  municipalRate: number,
): OneResult {
  const f2 = postYearFloor(spec);
  const pacesAt = (s: number) => ({
    phase1: round1(MIN_PACE + s * (MAX_PACE - MIN_PACE)),
    phase2: round1(f2 + s * (MAX_PACE - f2)),
  });
  const intervalsAt = (s: number) =>
    buildLeaveIntervals(cursor, blocksFor(spec, pools, pacesAt(s), oneYear));
  const endAt = (s: number) => {
    const iv = intervalsAt(s);
    return iv.length > 0 ? iv[iv.length - 1].endsAt : cursor;
  };

  // Already past the target when this caregiver would start: nothing to take.
  if (target.getTime() <= cursor.getTime()) {
    return outcomeOf(
      spec,
      [],
      pacesAt(1),
      pools,
      oneYear,
      {
        targetMet: false,
        shortfallDays: 0,
        extraSaved: pools.income + pools.lagsta,
      },
      municipalRate,
    );
  }

  // Plenty of days: full pace, cut at the target, the rest saved.
  if (endAt(1).getTime() >= target.getTime()) {
    const { clipped, used } = truncateAt(intervalsAt(1), target);
    const available = pools.income + pools.lagsta;
    return outcomeOf(
      spec,
      clipped,
      pacesAt(1),
      pools,
      oneYear,
      {
        targetMet: true,
        shortfallDays: 0,
        extraSaved: Math.max(0, available - used),
      },
      municipalRate,
    );
  }

  // Even maximal stretching falls short: report the missing days.
  const endSlow = endAt(0);
  if (endSlow.getTime() < target.getTime()) {
    const intervals = intervalsAt(0);
    const tailPace =
      intervals.length > 0
        ? intervals[intervals.length - 1].pace
        : SGI_PROTECTION.minDaysPerWeekAfterAge1;
    const missingCal = differenceInDays(endSlow, target);
    return outcomeOf(
      spec,
      intervals,
      pacesAt(0),
      pools,
      oneYear,
      {
        targetMet: false,
        shortfallDays: Math.ceil((missingCal / 7) * tailPace),
      },
      municipalRate,
    );
  }

  // Stretch just enough: fastest pace scale that still reaches the target.
  let lo = 0;
  let hi = 1;
  for (let i = 0; i < 40; i++) {
    const mid = (lo + hi) / 2;
    if (endAt(mid).getTime() >= target.getTime()) lo = mid;
    else hi = mid;
  }
  return outcomeOf(
    spec,
    intervalsAt(lo),
    pacesAt(lo),
    pools,
    oneYear,
    { targetMet: true, shortfallDays: 0 },
    municipalRate,
  );
}

function solveBudget(
  spec: CaregiverPlanSpec,
  pools: Pools,
  cursor: Date,
  oneYear: Date,
  floorNet: number,
  municipalRate: number,
): OneResult {
  // Smallest pace in [minPace, 7] whose household net clears the floor; if
  // none does, the pace that pays the most (part-timers can earn more at a
  // LOWER pace, so this is not always 7).
  const paceForFloor = (rate: number, minPace: number): number => {
    let best: number | null = null;
    let argmax = minPace;
    let maxNet = -Infinity;
    for (let i = Math.round(minPace * 10); i <= MAX_PACE * 10; i++) {
      const pace = i / 10;
      const net = netWhileHome(spec, rate, pace, municipalRate);
      if (net > maxNet) {
        maxNet = net;
        argmax = pace;
      }
      if (best === null && net >= floorNet) best = pace;
    }
    return best ?? argmax;
  };

  const f2 = postYearFloor(spec);
  const phases = {
    phase1: paceForFloor(spec.incomeRate, MIN_PACE),
    phase2: paceForFloor(spec.incomeRate, f2),
  };
  const lagstaPhases = {
    phase1: paceForFloor(spec.lagstaRate, MIN_PACE),
    phase2: paceForFloor(spec.lagstaRate, f2),
  };
  const blocks: LeaveBlock[] = [
    {
      caregiver: spec.name,
      tier: "income" as const,
      days: pools.income,
      rate: spec.incomeRate,
      schedule: schedule(phases.phase1, phases.phase2, oneYear),
    },
    {
      caregiver: spec.name,
      tier: "lagsta" as const,
      days: pools.lagsta,
      rate: spec.lagstaRate,
      schedule: schedule(lagstaPhases.phase1, lagstaPhases.phase2, oneYear),
    },
  ].filter((b) => b.days > 0);

  const intervals = buildLeaveIntervals(cursor, blocks);
  let met = true;
  for (const seg of intervals) {
    const net = netForSegment(spec, seg.monthly, seg.pace, municipalRate);
    if (net < floorNet - 1) met = false;
  }
  return outcomeOf(
    spec,
    intervals,
    phases,
    pools,
    oneYear,
    { targetMet: met, shortfallDays: 0 },
    municipalRate,
  );
}

// -----------------------------------------------------------------------------
// The plan: caregivers in turn
// -----------------------------------------------------------------------------

export function solvePlan(
  birth: Date,
  start: Date,
  caregivers: CaregiverPlanSpec[],
  /** The household's kommunalskatt — every net here is measured with it. */
  municipalRate: number = DEFAULT_MUNICIPAL_RATE,
): PlanSolve {
  const oneYear = addYears(birth, 1);
  const intervals: LeaveInterval[] = [];
  const perCaregiver: CaregiverOutcome[] = [];
  let cursor = start;

  for (const spec of caregivers) {
    if (spec.startAt && spec.startAt.getTime() > cursor.getTime()) {
      cursor = spec.startAt;
    }
    const pools = applySaveDays(spec);
    // A length goal only becomes a date once we know where this caregiver
    // starts, which is where the one before them ended.
    const target =
      spec.mode === "untilDate"
        ? spec.targetMonths != null && spec.targetMonths > 0
          ? addMonths(cursor, spec.targetMonths)
          : (spec.targetDate ?? null)
        : null;
    const one =
      target
        ? solveUntilDate(spec, pools, cursor, oneYear, target, municipalRate)
        : spec.mode === "budget"
          ? solveBudget(
              spec,
              pools,
              cursor,
              oneYear,
              spec.budgetFloor ?? 0,
              municipalRate,
            )
          : solveManual(spec, pools, cursor, oneYear, municipalRate);
    intervals.push(...one.intervals);
    perCaregiver.push(one.outcome);
    if (one.outcome.endsAt) cursor = one.outcome.endsAt;
  }

  let minNet: number | null = null;
  for (const seg of intervals) {
    const spec = caregivers.find((c) => c.name === seg.caregiver);
    if (!spec) continue;
    const net = netForSegment(spec, seg.monthly, seg.pace, municipalRate);
    if (minNet === null || net < minNet) minNet = net;
  }

  return {
    intervals,
    perCaregiver,
    endsAt: intervals.length > 0 ? intervals[intervals.length - 1].endsAt : null,
    savedTotal: perCaregiver.reduce((a, o) => a + o.savedDays, 0),
    minHouseholdNet: minNet,
  };
}
