/**
 * calc.ts — Day-accounting layer (framework-agnostic).
 *
 * "Get the accounting right before the optimizer." This module owns:
 *   - the planning input types shared across the app,
 *   - the budget for a given birth (incl. the multiple-birth bump),
 *   - how many days have been used and how many remain, per tier,
 *   - reserved-day forfeiture risk in the *current* snapshot,
 *   - the calendar deadlines that drive the timeline.
 *
 * No optimization decisions live here — only the bookkeeping the optimizer and
 * UI build on. All functions are pure.
 */

import {
  DAY_BUDGET,
  TIMING,
  DOUBLE_DAYS,
  totalDaysForBirth,
  type TierTotals,
} from "@/lib/rules";
import { parseIsoDate, birthdayAtAge, addMonths } from "@/lib/dates";

export type ParentId = "A" | "B";
export const PARENT_IDS: readonly ParentId[] = ["A", "B"];

/** A count of days split across the two tiers. */
export interface TierCount {
  sjukpenning: number;
  lagsta: number;
}

export interface ParentInput {
  /** Optional display name; UI falls back to "Förälder A/B". */
  name?: string;
  /** Gross monthly income in SEK (drives payout estimates). */
  grossMonthlyIncome: number;
  /** Days already used by this parent, per tier (default 0/0). */
  daysUsed: TierCount;
}

export interface PlanInput {
  /** Child's birth date or due date, strict ISO `YYYY-MM-DD`. */
  birthDate: string;
  /** Children in this birth (1 = single, 2 = twins …). */
  childrenInBirth: number;
  parents: Record<ParentId, ParentInput>;
}

// -----------------------------------------------------------------------------
// Small constructors / utilities
// -----------------------------------------------------------------------------

export function emptyTierCount(): TierCount {
  return { sjukpenning: 0, lagsta: 0 };
}

export function tierCountTotal(t: TierCount): number {
  return t.sjukpenning + t.lagsta;
}

export function defaultParentInput(grossMonthlyIncome = 0): ParentInput {
  return { grossMonthlyIncome, daysUsed: emptyTierCount() };
}

/** A blank, valid plan — handy as initial UI state. */
export function defaultPlanInput(birthDate: string): PlanInput {
  return {
    birthDate,
    childrenInBirth: 1,
    parents: { A: defaultParentInput(), B: defaultParentInput() },
  };
}

// -----------------------------------------------------------------------------
// Budget / usage / remaining
// -----------------------------------------------------------------------------

/** Total day budget for this plan's birth, per tier. */
export function planBudget(plan: PlanInput): TierTotals {
  return totalDaysForBirth(plan.childrenInBirth);
}

export interface UsageSummary {
  byParent: Record<ParentId, TierCount & { total: number }>;
  combined: TierCount & { total: number };
}

export function planUsage(plan: PlanInput): UsageSummary {
  const byParent = {} as Record<ParentId, TierCount & { total: number }>;
  const combined = { sjukpenning: 0, lagsta: 0, total: 0 };

  for (const id of PARENT_IDS) {
    const used = plan.parents[id].daysUsed;
    const sjukpenning = Math.max(0, used.sjukpenning);
    const lagsta = Math.max(0, used.lagsta);
    byParent[id] = { sjukpenning, lagsta, total: sjukpenning + lagsta };
    combined.sjukpenning += sjukpenning;
    combined.lagsta += lagsta;
  }
  combined.total = combined.sjukpenning + combined.lagsta;
  return { byParent, combined };
}

export interface RemainingSummary {
  budget: TierTotals;
  used: TierCount & { total: number };
  /** Days left at the family level, clamped at 0. */
  remaining: { sjukpenning: number; lagsta: number; total: number };
  /** True when recorded usage already exceeds the budget for that tier. */
  overAllocated: { sjukpenning: boolean; lagsta: boolean };
}

/**
 * The naive "days remaining per tier" calculation — budget minus days already
 * used, at the family (both-parents-combined) level. This is the core accounting
 * the rest of the app trusts.
 */
export function planRemaining(plan: PlanInput): RemainingSummary {
  const budget = planBudget(plan);
  const { combined } = planUsage(plan);

  return {
    budget,
    used: combined,
    remaining: {
      sjukpenning: Math.max(0, budget.sjukpenning - combined.sjukpenning),
      lagsta: Math.max(0, budget.lagsta - combined.lagsta),
      total: Math.max(0, budget.total - combined.total),
    },
    overAllocated: {
      sjukpenning: combined.sjukpenning > budget.sjukpenning,
      lagsta: combined.lagsta > budget.lagsta,
    },
  };
}

// -----------------------------------------------------------------------------
// Reserved-day forfeiture risk (current snapshot)
// -----------------------------------------------------------------------------

/**
 * Reserved days are non-transferable and forfeited if the owning parent doesn't
 * use them. We treat the reserved block as income-based (see rules TODO), so a
 * parent's reserved days are "covered" by the sjukpenning days they personally
 * use. Returns, per parent, how many of their reserved days are still unused in
 * the *current* snapshot (i.e. would be lost if they took no more days).
 */
export function reservedDaysAtRisk(plan: PlanInput): Record<ParentId, number> {
  const usage = planUsage(plan);
  const reserved = DAY_BUDGET.reservedDaysPerParent;
  const result = {} as Record<ParentId, number>;
  for (const id of PARENT_IDS) {
    result[id] = Math.max(0, reserved - usage.byParent[id].sjukpenning);
  }
  return result;
}

// -----------------------------------------------------------------------------
// Calendar deadlines (drive the timeline + warnings)
// -----------------------------------------------------------------------------

export interface PlanDeadlines {
  birth: Date;
  /** Last day dubbeldagar can be taken (child age 15 months). */
  doubleDaysDeadline: Date;
  /** Income-based days must be used before this (4th birthday). */
  sjukpenningDeadline: Date;
  /** All days expire here (12th birthday). */
  expiry: Date;
}

export function planDeadlines(plan: PlanInput): PlanDeadlines {
  const birth = parseIsoDate(plan.birthDate);
  return {
    birth,
    doubleDaysDeadline: addMonths(birth, DOUBLE_DAYS.withinFirstMonths),
    sjukpenningDeadline: birthdayAtAge(birth, TIMING.sjukpenningUntilAge),
    expiry: birthdayAtAge(birth, TIMING.allDaysExpireAtAge),
  };
}
