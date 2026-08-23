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
import { addDays, addMonths, addYears, differenceInDays } from "@/lib/dates";
import { DOUBLE_DAYS, SGI_PROTECTION, TIMING } from "@/lib/rules";
import { DEFAULT_MUNICIPAL_RATE, householdNet } from "@/lib/tax";

const DAYS_PER_MONTH = 30.4;
const MIN_PACE = 0.5;
const MAX_PACE = 7;

/**
 * Days a normal working week actually contains.
 *
 * Föräldrapenning is a calendar-day benefit — all 7 days of the week can be
 * drawn — but salary is only lost on the days you would otherwise have
 * worked. So a part-timer's remaining pay is measured against 5, not 7.
 * Försäkringskassan sizes partial days the same way: 75 % work is 1,25
 * dagar/vecka, 50 % is 2,5 (see SGI_PROTECTION in rules.ts).
 */
export const WORK_WEEK = 5;

/**
 * What a caregiver still earns while drawing `pace` days of benefit a week.
 * Exported because the results page builds the same figure for its own rows,
 * and two copies of this formula drifted apart once already.
 */
export function partTimeSalaryAt(salary: number, pace: number): number {
  const p = Math.max(0, Math.min(WORK_WEEK, pace));
  return (salary * (WORK_WEEK - p)) / WORK_WEEK;
}

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
  /**
   * Dubbeldagar: this caregiver ALSO draws income-based days concurrently
   * with the start of the leave — both caregivers home at once — spent
   * from their own pool before their sequential stretch (below) continues
   * with what's left of it. Meaningless for the first caregiver, who is
   * already there from the start.
   */
  doubleDays?: number;
  /** Calendar days after the very start of the leave before the dubbeldagar
   *  overlap begins — e.g. a birth-days window, which comes first. */
  doubleDaysDelay?: number;
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
  /** All caregivers' dated segments, in leave order — includes the
   *  dubbeldagar overlap below, so day totals and net-floor checks see it. */
  intervals: LeaveInterval[];
  perCaregiver: CaregiverOutcome[];
  endsAt: Date | null;
  savedTotal: number;
  /** Lowest household net (benefit + partner salary + part-time salary). */
  minHouseholdNet: number | null;
  /**
   * Dubbeldagar: the second caregiver's concurrent overlap with the first,
   * called out separately (rather than left for the UI to find inside
   * `intervals`, where it sits out of chronological order — it was pushed
   * in alongside that caregiver's own later, sequential stretch).
   */
  doubleDaysWindow: {
    caregiver: string;
    startsAt: Date;
    endsAt: Date;
    rate: number;
  } | null;
  /**
   * Income-based days the schedule still draws after they expire at the 4th
   * birthday. Normally 0 — the solvers hold a pace floor that keeps them
   * inside the window — but when there are more days than calendar left even
   * at full pace, this is what would be lost.
   */
  incomeDaysPastDeadline: number;
}

// -----------------------------------------------------------------------------
// Shared helpers
// -----------------------------------------------------------------------------

function partTimeSalary(spec: CaregiverPlanSpec, pace: number): number {
  if (!spec.worksPartTime) return 0;
  return partTimeSalaryAt(spec.salary, pace);
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

/**
 * A stretch where this caregiver's own pace is pinned to a full day a week
 * regardless of their goal — dubbeldagar, where both of them draw a whole
 * day on the same calendar day, one out of each of their pots.
 */
export interface OverlapWindow {
  from: Date;
  to: Date;
}

/**
 * Facts about the calendar that outrank a caregiver's goal. Bundled rather
 * than passed as two more positional arguments, since every solver needs
 * both and neither belongs to the caregiver's own preferences.
 */
interface Limits {
  /** Dubbeldagar — a stretch pinned to a full day a week. */
  overlap?: OverlapWindow | null;
  /** Slowest pace that still gets the income days used before they expire. */
  minPace?: number;
}

/**
 * The slowest pace at which this caregiver's income-based days still land
 * before they are forfeited.
 *
 * Income days expire at the child's 4th birthday (bar the small saved-day
 * allowance), so a plan drawing them more slowly than this is spending days
 * that will not exist by the time it reaches them. Returns 0 when there is
 * nothing to fit, and the full pace when the deadline has already passed —
 * in that case nothing fits and the caller reports the overrun instead.
 */
function deadlinePaceFloor(
  incomeDays: number,
  cursor: Date,
  deadline: Date,
): number {
  if (incomeDays <= 0) return 0;
  const calendar = differenceInDays(cursor, deadline);
  if (calendar <= 0) return MAX_PACE;
  // Rounded UP to the tenth the solvers actually quantise to. Rounding the
  // other way would hand back a floor just under what fits, which is how a
  // plan ends up a handful of days over the line.
  const exact = (incomeDays * 7) / calendar;
  return Math.min(MAX_PACE, Math.ceil(exact * 10) / 10);
}

function schedule(
  phase1: number,
  phase2: number,
  oneYear: Date,
  overlap?: OverlapWindow | null,
): PaceBreak[] {
  const base: PaceBreak[] = [
    { until: oneYear, pace: phase1 },
    { until: null, pace: phase2 },
  ];
  if (!overlap) return base;
  // `breakAt` takes the first entry whose `until` is still ahead of the
  // cursor, so the window can simply be spliced in front of the ordinary
  // phases — it wins while the cursor is inside it and is skipped after,
  // even when it runs past the first birthday.
  return [
    { until: overlap.from, pace: phase1 },
    { until: overlap.to, pace: MAX_PACE },
    ...base,
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
  overlap?: OverlapWindow | null,
): LeaveBlock[] {
  const sched = schedule(phases.phase1, phases.phase2, oneYear, overlap);
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
  limits: Limits = {},
): OneResult {
  const sgiMin = SGI_PROTECTION.minDaysPerWeekAfterAge1;
  // A hand-picked pace is still bounded by when the days expire.
  const floorPace = limits.minPace ?? 0;
  let phases: { phase1: number; phase2: number };
  if (spec.switchPhases) {
    const floor = spec.worksPartTime ? MIN_PACE : sgiMin;
    phases = {
      phase1: Math.max(MIN_PACE, floorPace, spec.switchPhases.phase1),
      phase2: Math.max(floor, floorPace, spec.switchPhases.phase2),
    };
  } else {
    const p = Math.max(1, floorPace, spec.manualPace ?? MAX_PACE);
    // Below the SGI floor and not part-time: keep the chosen pace while SGI is
    // protected (year 1), then lift to the minimum.
    phases = {
      phase1: p,
      phase2: !spec.worksPartTime && p < sgiMin ? sgiMin : p,
    };
  }
  const intervals = buildLeaveIntervals(
    cursor,
    blocksFor(spec, pools, phases, oneYear, limits.overlap),
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
  limits: Limits = {},
): OneResult {
  // The slowest end of the stretch range is whichever binds harder: the
  // floor this caregiver is allowed to run at, or the one the expiry date
  // forces on them.
  const slowest = Math.max(MIN_PACE, limits.minPace ?? 0);
  const f2 = Math.max(postYearFloor(spec), limits.minPace ?? 0);
  const pacesAt = (s: number) => ({
    phase1: round1(slowest + s * (MAX_PACE - slowest)),
    phase2: round1(f2 + s * (MAX_PACE - f2)),
  });
  const intervalsAt = (s: number) =>
    buildLeaveIntervals(
      cursor,
      blocksFor(spec, pools, pacesAt(s), oneYear, limits.overlap),
    );
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
  limits: Limits = {},
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

  // "As long as possible" still cannot outlast the days themselves: the
  // expiry floor overrides the slowest pace the net floor would allow.
  const slowest = Math.max(MIN_PACE, limits.minPace ?? 0);
  const f2 = Math.max(postYearFloor(spec), limits.minPace ?? 0);
  const phases = {
    phase1: paceForFloor(spec.incomeRate, slowest),
    phase2: paceForFloor(spec.incomeRate, f2),
  };
  // Lägstanivå days keep running until the child is 12, so only the SGI
  // floor binds them — the 4-year expiry is about income-based days.
  const lagstaPhases = {
    phase1: paceForFloor(spec.lagstaRate, MIN_PACE),
    phase2: paceForFloor(spec.lagstaRate, postYearFloor(spec)),
  };
  const blocks: LeaveBlock[] = [
    {
      caregiver: spec.name,
      tier: "income" as const,
      days: pools.income,
      rate: spec.incomeRate,
      schedule: schedule(phases.phase1, phases.phase2, oneYear, limits.overlap),
    },
    {
      caregiver: spec.name,
      tier: "lagsta" as const,
      days: pools.lagsta,
      rate: spec.lagstaRate,
      schedule: schedule(
        lagstaPhases.phase1,
        lagstaPhases.phase2,
        oneYear,
        limits.overlap,
      ),
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
  // Income-based days are forfeited at the 4th birthday, so no goal may
  // stretch them past it — see `deadlinePaceFloor`.
  const incomeDeadline = addYears(birth, TIMING.sjukpenningUntilAge);
  const intervals: LeaveInterval[] = [];
  const perCaregiver: CaregiverOutcome[] = [];
  let cursor = start;
  let doubleDaysWindow: PlanSolve["doubleDaysWindow"] = null;

  // ---------------------------------------------------------------------
  // Dubbeldagar have to be settled before anybody is solved.
  //
  // A dubbeldag is one calendar day that BOTH caregivers draw a whole day
  // for, one out of each of their own pots. That makes it a fact about the
  // first caregiver's schedule too, not just the second's — and the first
  // caregiver is solved first, so the window cannot be discovered halfway
  // through the loop. Work it out up front, bounded by everything that can
  // limit it, then hand it to both sides.
  // ---------------------------------------------------------------------
  const ddIndex = caregivers.findIndex(
    (c, i) => i > 0 && (c.doubleDays ?? 0) > 0,
  );
  let ddDays = 0;
  let overlap: OverlapWindow | null = null;
  if (ddIndex > 0) {
    const ddSpec = caregivers[ddIndex];
    const first = caregivers[0];
    const firstStart =
      first.startAt && first.startAt.getTime() > start.getTime()
        ? first.startAt
        : start;
    const from = addDays(firstStart, ddSpec.doubleDaysDelay ?? 0);
    // One calendar day per dubbeldag, so the deadline is a day budget too.
    const roomToDeadline = Math.max(
      0,
      differenceInDays(from, addMonths(birth, DOUBLE_DAYS.withinFirstMonths)),
    );
    ddDays = Math.floor(
      Math.max(
        0,
        Math.min(
          ddSpec.doubleDays ?? 0,
          applySaveDays(ddSpec).income,
          applySaveDays(first).income,
          roomToDeadline,
        ),
      ),
    );
    if (ddDays > 0) overlap = { from, to: addDays(from, ddDays) };
  }

  for (const [i, spec] of caregivers.entries()) {
    if (spec.startAt && spec.startAt.getTime() > cursor.getTime()) {
      cursor = spec.startAt;
    }
    let pools = applySaveDays(spec);

    // The second caregiver's half of the dubbeldagar window: their own
    // concurrent stretch alongside the first caregiver's opening days. Spent
    // from their pot, so it comes off what is left for their sequential
    // solve below. Kept in `intervals` (so day totals and net-floor checks
    // see it) but ALSO called out on its own — pushed here it lands out of
    // chronological order relative to the first caregiver's still-ongoing
    // stretch, which the UI needs to know to merge the two into one "both
    // home" block. The first caregiver's half is not here: it is a pinned
    // stretch inside their own schedule (see `overlap` above), because they
    // are already on leave and simply draw a full day for those dates.
    const dd = i === ddIndex ? ddDays : 0;
    if (dd > 0 && overlap) {
      const ddIntervals = buildLeaveIntervals(overlap.from, [
        {
          caregiver: spec.name,
          tier: "income",
          days: dd,
          rate: spec.incomeRate,
          schedule: [{ until: null, pace: MAX_PACE }],
        },
      ]);
      intervals.push(...ddIntervals);
      if (ddIntervals.length > 0) {
        doubleDaysWindow = {
          caregiver: spec.name,
          startsAt: ddIntervals[0].startsAt,
          endsAt: ddIntervals[ddIntervals.length - 1].endsAt,
          rate: spec.incomeRate,
        };
      }
      pools = { ...pools, income: pools.income - dd };
    }

    // A length goal only becomes a date once we know where this caregiver
    // starts, which is where the one before them ended.
    const target =
      spec.mode === "untilDate"
        ? spec.targetMonths != null && spec.targetMonths > 0
          ? addMonths(cursor, spec.targetMonths)
          : (spec.targetDate ?? null)
        : null;
    // Only the first caregiver carries the pinned window — they are the one
    // already on leave while the other joins them.
    const limits: Limits = {
      overlap: i === 0 ? overlap : null,
      minPace: deadlinePaceFloor(pools.income, cursor, incomeDeadline),
    };
    const one =
      target
        ? solveUntilDate(
            spec,
            pools,
            cursor,
            oneYear,
            target,
            municipalRate,
            limits,
          )
        : spec.mode === "budget"
          ? solveBudget(
              spec,
              pools,
              cursor,
              oneYear,
              spec.budgetFloor ?? 0,
              municipalRate,
              limits,
            )
          : solveManual(spec, pools, cursor, oneYear, municipalRate, limits);
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

  // Whatever the pace floor could not rescue: income days still scheduled
  // past the point they stop existing.
  let pastDeadline = 0;
  for (const seg of intervals) {
    if (seg.tier !== "income") continue;
    if (seg.endsAt.getTime() <= incomeDeadline.getTime()) continue;
    const from =
      seg.startsAt.getTime() > incomeDeadline.getTime()
        ? seg.startsAt
        : incomeDeadline;
    pastDeadline += (differenceInDays(from, seg.endsAt) / 7) * seg.pace;
  }

  return {
    intervals,
    perCaregiver,
    endsAt: intervals.length > 0 ? intervals[intervals.length - 1].endsAt : null,
    savedTotal: perCaregiver.reduce((a, o) => a + o.savedDays, 0),
    minHouseholdNet: minNet,
    doubleDaysWindow,
    incomeDaysPastDeadline: Math.round(pastDeadline),
  };
}
