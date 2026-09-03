/**
 * periods.ts — Solver for the editable leave-period list.
 *
 * The model: a plan is a list of leave PERIODS, each owned by one caregiver.
 * A period is either:
 *   - `fixed`: a specific LENGTH (days of leave) the user set, or
 *   - `leftover`: "as long as possible" — it takes whatever days are left.
 *
 * Allocation rules (per the product spec):
 *   1. Fixed periods take precedence — they consume their days from their
 *      caregiver's budget first.
 *   2. "As long as possible" periods claim the days left over from all the
 *      fixed periods.
 *   3. If BOTH caregivers have an "as long as possible" period, the leftover
 *      days are split between them; each is capped at their own remaining
 *      budget (a caregiver can't draw on the other's earmarked days). When a
 *      cap bites, the shortfall goes to the other caregiver so the leftover
 *      days are used where there's room.
 *
 * Every allocation honours the caregiver's remaining budget — a period can
 * never overdraw its caregiver's pot. Pure and framework-agnostic, so the
 * precedence rules are unit-testable in isolation.
 */

import type { PeriodSpec } from "@/lib/share";
import { addDays } from "@/lib/dates";
import { resolveStretch, YEAR1_PACE } from "@/lib/stretch";

export type PeriodKind = "fixed" | "leftover" | "dubbeldagar" | "birth";

export interface PeriodInput {
  id: string;
  caregiver: "A" | "B";
  kind: PeriodKind;
  /** Days of leave for a `fixed` period (ignored for `leftover`). */
  days: number;
  tier?: "income" | "lagsta";
  locked?: boolean;
}

export interface PeriodAllocation {
  id: string;
  caregiver: "A" | "B";
  kind: PeriodKind;
  /** Days actually allocated after the solve (never negative). */
  days: number;
  tier: "income" | "lagsta";
  locked?: boolean;
}

export interface SolvePeriodsInput {
  periods: PeriodInput[];
  /** Total days each caregiver may draw (their pot). */
  budgets: Record<"A" | "B", number>;
}

export interface SolvePeriodsResult {
  allocations: PeriodAllocation[];
  /** Days left unused per caregiver after the solve (forfeited/saved). */
  unused: Record<"A" | "B", number>;
  /** e.g. a fixed period that exceeded its caregiver's budget. */
  warnings: string[];
}

export function solvePeriods(input: SolvePeriodsInput): SolvePeriodsResult {
  const budgets = { A: Math.max(0, input.budgets.A), B: Math.max(0, input.budgets.B) };
  const remaining = { A: budgets.A, B: budgets.B };
  const warnings: string[] = [];
  const keep = (p: PeriodInput): PeriodAllocation => ({
    ...p,
    days: Math.max(0, Math.floor(p.days)),
    tier: p.tier ?? "income",
  });

  // 1. Explicit-length periods first, drawing from their caregiver's budget.
  //    `birth` is locked; `dubbeldagar` draws a day from BOTH caregivers.
  const allocations: PeriodAllocation[] = [];
  for (const p of input.periods) {
    if (p.kind === "leftover") continue;
    if (p.kind === "dubbeldagar") {
      const want = Math.max(0, Math.floor(p.days));
      const takeA = Math.min(want, remaining.A);
      const takeB = Math.min(want, remaining.B);
      if (takeA < want || takeB < want) {
        warnings.push(
          `Dubbeldagar (${p.id}) kräver ${want} dagar men bara ${takeA} hos ${p.caregiver === "A" ? "den andra" : "den andra vårdnadshavaren"} / ${takeB} finns kvar.`,
        );
      }
      allocations.push({ ...p, kind: "dubbeldagar", days: want, tier: p.tier ?? "income" });
      remaining.A -= takeA;
      remaining.B -= takeB;
      continue;
    }
    // fixed / birth: from the period's own caregiver.
    const want = Math.max(0, Math.floor(p.days));
    const take = Math.min(want, remaining[p.caregiver]);
    if (take < want) {
      warnings.push(
        `Perioden "${p.id}" kräver ${want} dagar men bara ${take} finns kvar.`,
      );
    }
    allocations.push(keep(p));
    allocations[allocations.length - 1].days = take;
    remaining[p.caregiver] -= take;
  }

  // Leftover days are a joint pool: what's left across both caregivers.
  const leftoverTotal = remaining.A + remaining.B;
  const leftovers = input.periods.filter((p) => p.kind === "leftover");

  if (leftoverTotal > 0 && leftovers.length > 0) {
    // 3. Even split when both caregivers have a leftover period; each capped
    //    at their own remaining budget.
    if (leftovers.length === 1) {
      const d = leftovers[0];
      const cap = remaining[d.caregiver];
      const give = Math.min(leftoverTotal, cap);
      allocations.push({ ...keep(d), kind: "leftover", days: give });
      remaining[d.caregiver] -= give;
    } else {
      // Even split in intent; the shortfall from a capped side is given to
      // the other so available days aren't left on the table.
      let a = Math.floor(leftoverTotal / 2);
      let b = leftoverTotal - a;
      const capA = remaining.A;
      const capB = remaining.B;
      if (a > capA) { b += a - capA; a = capA; }
      if (b > capB) { a += b - capB; b = capB; }
      // Re-clamp in case the redistributed side also overflows (defensive).
      if (a > capA) { b += a - capA; a = capA; }
      if (b > capB) { a += b - capB; b = capB; }
      const da = leftovers.find((p) => p.caregiver === "A");
      const db = leftovers.find((p) => p.caregiver === "B");
      if (da) { allocations.push({ ...keep(da), kind: "leftover", days: a }); remaining.A -= a; }
      if (db) { allocations.push({ ...keep(db), kind: "leftover", days: b }); remaining.B -= b; }
    }
  }

  // For each leftover period that got nothing (e.g. no days left), report it.
  for (const p of leftovers) {
    if (!allocations.some((al) => al.id === p.id)) {
      allocations.push({ ...keep(p), kind: "leftover", days: 0 });
    }
  }

  return { allocations, unused: remaining, warnings };
}

/**
 * Emit the plan as a period list — the SAME format edited periods use. This is
 * the goal method's only output: a list of periods, ordered in time, that the
 * plan then runs through the identical rules. So generated and hand-edited
 * periods are indistinguishable.
 *
 * Order: the locked birth window first (overlaps the start via buildPlanPeriods),
 * then the shared dubbeldagar window, then each caregiver's income stretch
 * followed by their lägstanivå stretch, the leading caregiver first.
 */
export function periodsFromPlan(split: PlanDaySplit): PeriodSpec[] {
  const other: "A" | "B" = split.first === "A" ? "B" : "A";
  const out: PeriodSpec[] = [];
  if (split.birthDays > 0) {
    out.push({ id: "birth", caregiver: other, kind: "birth", days: split.birthDays, tier: "income", locked: true });
  }
  // The leading caregiver's income (+ lägstanivå) comes first — matching how
  // the solver orders the first block — then the shared dubbeldagar window,
  // then the other caregiver's.
  for (const id of [split.first] as const) {
    const inc = Math.max(0, Math.round(split.incomeDays[id]));
    const lag = Math.max(0, Math.round(split.lagstaDays[id]));
    if (inc > 0) out.push({ id: `${id}-income`, caregiver: id, kind: "fixed", days: inc, tier: "income" });
    if (lag > 0) out.push({ id: `${id}-lagsta`, caregiver: id, kind: "fixed", days: lag, tier: "lagsta" });
  }
  if (split.doubleDays > 0) {
    out.push({ id: "dubbeldagar-0", caregiver: other, kind: "dubbeldagar", days: split.doubleDays, tier: "income" });
  }
  const otherCg: "A" | "B" = other;
  const inc = Math.max(0, Math.round(split.incomeDays[otherCg]));
  const lag = Math.max(0, Math.round(split.lagstaDays[otherCg]));
  if (inc > 0) out.push({ id: `${otherCg}-income`, caregiver: otherCg, kind: "fixed", days: inc, tier: "income" });
  if (lag > 0) out.push({ id: `${otherCg}-lagsta`, caregiver: otherCg, kind: "fixed", days: lag, tier: "lagsta" });
  return out;
}

/** The day split a plan was generated from (see periodsFromPlan). */
export interface PlanDaySplit {
  incomeDays: Record<"A" | "B", number>;
  lagstaDays: Record<"A" | "B", number>;
  doubleDays: number;
  birthDays: number;
  first: "A" | "B";
}

/** A period dated into the calendar by the stretch resolver. */
export interface DatedPeriod extends PeriodAllocation {
  startsAt: Date;
  endsAt: Date;
  pace: { phase1: number; phase2: number };
  overrunDays: number;
}

export interface BuildPeriodsInput {
  periods: PeriodSpec[];
  budgets: Record<"A" | "B", number>;
  /** Calendar day the plan begins (the birth, or the first caregiver's start). */
  start: Date;
  oneYear: Date;
  incomeDeadline: Date;
  /**
   * Goal-derived paces per caregiver, so seeded periods run at the pace the
   * plan actually implies (e.g. a 3-month goal) instead of the slowest one.
   */
  phases?: Partial<Record<"A" | "B", { phase1: number; phase2: number }>>;
  /** How many calendar days after the start a dubbeldagar window begins. */
  dubbeldagarDelay?: number;
}

export interface BuildPeriodsResult {
  periods: DatedPeriod[];
  unused: Record<"A" | "B", number>;
  warnings: string[];
}

/**
 * Allocate the period list, then date each period. `birth` is locked and
 * overlaps the very start (the birth giver's leave starts AT the birth date),
 * so it never advances the cursor. Everything else is dated sequentially from
 * the birth in allocation order (fixed/birth/dubbeldagar in list order, then
 * leftover), so reordering fixed periods reschedules them. The stretch resolver
 * enforces the SGI 5-days/week floor and the age-4 income-day deadline.
 */
export function buildPlanPeriods(input: BuildPeriodsInput): BuildPeriodsResult {
  const { allocations, unused, warnings } = solvePeriods({
    periods: input.periods.map((p) => ({ ...p })),
    budgets: input.budgets,
  });
  const start = input.start;
  let cursor = start;
  const periods: DatedPeriod[] = [];

  // 1. Locked birth window(s) first — they overlap the start, so they never
  //    move the cursor. The birth giver's leave still begins at `start`.
  for (const al of allocations) {
    if (al.kind !== "birth") continue;
    const ph = input.phases?.[al.caregiver];
    const stretch = resolveStretch({
      days: al.days,
      start: cursor,
      oneYear: input.oneYear,
      incomeDeadline: input.incomeDeadline,
      phase1: ph?.phase1,
      minPhase2: ph?.phase2,
    });
    periods.push({
      ...al,
      locked: true,
      startsAt: cursor,
      endsAt: stretch.endsAt,
      pace: stretch.pace,
      overrunDays: stretch.overrunDays,
    });
  }

  // 2. Everything else in allocation order, each advancing the cursor.
  for (const al of allocations) {
    if (al.kind === "birth") continue;
    const ph = input.phases?.[al.caregiver];
    // Dubbeldagar is a shared calendar window both caregivers are home for,
    // overlapping the first caregiver's leave — dated as its own block, delayed
    // past the birth-days, and it does not advance the main cursor.
    if (al.kind === "dubbeldagar") {
      const wStart = addDays(start, input.dubbeldagarDelay ?? 0);
      const pace = ph?.phase1 ?? YEAR1_PACE;
      periods.push({
        ...al,
        startsAt: wStart,
        endsAt: addDays(wStart, al.days),
        pace: { phase1: pace, phase2: pace },
        overrunDays: 0,
      });
      continue;
    }
    const stretch = resolveStretch({
      days: al.days,
      start: cursor,
      oneYear: input.oneYear,
      incomeDeadline: input.incomeDeadline,
      phase1: ph?.phase1,
      minPhase2: ph?.phase2,
    });
    periods.push({
      ...al,
      startsAt: cursor,
      endsAt: stretch.endsAt,
      pace: stretch.pace,
      overrunDays: stretch.overrunDays,
    });
    cursor = stretch.endsAt;
  }

  // The lead caregiver draws a FULL day (MAX_PACE) during the dubbeldagar
  // window — both are home. That creates a pace-break segment at the window,
  // which the pager merges with the second caregiver's into the "both home"
  // block. Emit it for the leading caregiver (the one whose open leave the
  // window overlaps).
  const dd = allocations.find((a) => a.kind === "dubbeldagar");
  if (dd) {
    const wStart = addDays(start, input.dubbeldagarDelay ?? 0);
    const wEnd = addDays(wStart, dd.days);
    const leading = allocations.find(
      (a) => a.kind === "fixed" && a.caregiver !== dd.caregiver,
    );
    if (leading) {
      periods.push({
        id: `${leading.id}-leadwindow`,
        caregiver: leading.caregiver,
        kind: "fixed",
        days: dd.days,
        tier: leading.tier,
        startsAt: wStart,
        endsAt: wEnd,
        pace: { phase1: 7, phase2: 7 },
        overrunDays: 0,
      });
    }
  }
  return { periods, unused, warnings };
}
