/**
 * optimizer.ts — Suggest how two parents should split their remaining days.
 *
 * The allocation is a small constrained problem. Following the brief, we use a
 * straightforward scoring approach rather than anything fancier:
 *
 *   - Assume the family uses *all* remaining days (unused days are eventually
 *     forfeited, so using them is the baseline).
 *   - The only real lever for payout is how the income-based (`sjukpenning`)
 *     days are split, because those are valued at each parent's daily rate,
 *     while flat (`lagsta`) days pay the same 180 kr regardless of who takes
 *     them.
 *   - Hard constraint: each parent must personally use their own reserved days
 *     or they're forfeited (they can't be transferred).
 *   - We expose two objectives the trade-off actually hinges on — maximise
 *     kronor vs. split time at home evenly — and return both so the UI can show
 *     the comparison.
 *
 * Everything here is pure and deterministic (an `asOf` date is injected rather
 * than read from the clock) so it can be unit-tested.
 */

import {
  MONEY,
  TIMING,
  DOUBLE_DAYS,
  SGI_PROTECTION,
  sjukpenningnivaDailyAmount,
  isAboveSgiCap,
} from "@/lib/rules";
import {
  type PlanInput,
  type ParentId,
  type TierCount,
  type RemainingSummary,
  PARENT_IDS,
  planBudget,
  planRemaining,
  reservedDaysAtRisk,
  planUsage,
  planDeadlines,
  resolveMonthlyIncome,
} from "@/lib/calc";
import { parseIsoDate, differenceInDays } from "@/lib/dates";

export type Objective = "maxPayout" | "equal";

export const OBJECTIVES: readonly Objective[] = ["maxPayout", "equal"];

export const OBJECTIVE_LABEL: Record<Objective, string> = {
  maxPayout: "Maximera ersättning",
  equal: "Jämn fördelning",
};

export const OBJECTIVE_DESCRIPTION: Record<Objective, string> = {
  maxPayout:
    "Lägg så många inkomstbaserade dagar som möjligt på den förälder som tjänar mest (utan att förlora reserverade dagar).",
  equal: "Dela hemmatiden så jämnt som möjligt mellan föräldrarna.",
};

export type WarningLevel = "info" | "warning" | "critical";

export type WarningCode =
  | "reservedForfeit"
  | "sgiProtection"
  | "sgiGap"
  | "timingBeforeAge4"
  | "timingAfterAge4"
  | "doubleDaysWindow"
  | "incomeAboveCap"
  | "doubleDaysLimited"
  | "overAllocated";

export interface PlanWarning {
  level: WarningLevel;
  code: WarningCode;
  message: string;
}

export interface ParentPayout {
  sjukpenningDays: number;
  lagstaDays: number;
  /** Daily amount on the income-based tier for this parent. */
  dailyRate: number;
  /** Total kronor from the days allocated to this parent. */
  amount: number;
}

export interface OptimizedPlan {
  objective: Objective;
  /** Days to allocate to each parent (in addition to days already used). */
  allocation: Record<ParentId, TierCount>;
  payout: { A: ParentPayout; B: ParentPayout; total: number };
  /** Allocated day totals per parent (sjukpenning + lagsta). */
  allocatedTotals: Record<ParentId, number>;
  /** Reserved days that would still be forfeited under this plan, per parent. */
  forfeitedReserved: Record<ParentId, number>;
  /** Dubbeldagar included (both parents home on the same day), per parent. */
  doubleDays: number;
  warnings: PlanWarning[];
}

export interface OptimizeOptions {
  objective?: Objective;
  /** Reference "today" for timing checks. Defaults to the current date. */
  asOf?: Date;
  /** Requested dubbeldagar (both parents drawing a day simultaneously). */
  doubleDays?: number;
}

export interface OptimizeResult {
  recommended: OptimizedPlan;
  /** The other objective(s), for side-by-side comparison. */
  alternatives: OptimizedPlan[];
  remaining: RemainingSummary;
}

// -----------------------------------------------------------------------------
// Core allocation
// -----------------------------------------------------------------------------

function payoutFor(days: TierCount, grossMonthlyIncome: number): ParentPayout {
  const dailyRate = sjukpenningnivaDailyAmount(grossMonthlyIncome);
  return {
    sjukpenningDays: days.sjukpenning,
    lagstaDays: days.lagsta,
    dailyRate,
    amount: days.sjukpenning * dailyRate + days.lagsta * MONEY.lagstaPerDay,
  };
}

/**
 * Choose how many of the `S` remaining income-based days go to parent A.
 * `rA`/`rB` are each parent's reserved days that must stay with them.
 */
function chooseSjukpenningSplitForA(
  objective: Objective,
  S: number,
  rA: number,
  rB: number,
  rateA: number,
  rateB: number,
): number {
  // Not enough income-based days to honour both reserved blocks: split them
  // proportionally so the unavoidable forfeiture is shared fairly.
  if (rA + rB > S) {
    if (rA + rB === 0) return 0;
    return clamp(Math.round((S * rA) / (rA + rB)), 0, S);
  }

  const lo = rA; // A must take at least its reserved
  const hi = S - rB; // …and must leave B's reserved for B

  if (objective === "maxPayout") {
    // Put income-based days on the higher-rate parent.
    return rateA >= rateB ? hi : lo;
  }
  // "equal": aim for a 50/50 split of the income-based days, within bounds.
  return clamp(Math.round(S / 2), lo, hi);
}

/** Split `L` flat days to even out total home-time between the parents. */
function chooseLagstaSplitForA(L: number, sA: number, sB: number): number {
  if (L <= 0) return 0;
  // Solve sA + lA = sB + lB with lA + lB = L  ->  lA = (L + sB - sA) / 2.
  return clamp(Math.round((L + sB - sA) / 2), 0, L);
}

function clamp(n: number, lo: number, hi: number): number {
  return Math.max(lo, Math.min(hi, n));
}

function buildPlan(
  plan: PlanInput,
  objective: Objective,
  remaining: RemainingSummary,
  asOf: Date,
  doubleDays = 0,
): OptimizedPlan {
  const S = remaining.remaining.sjukpenning;
  const L = remaining.remaining.lagsta;

  const reservedRisk = reservedDaysAtRisk(plan);
  const rA = reservedRisk.A;
  const rB = reservedRisk.B;

  const incomeA = resolveMonthlyIncome(plan.parents.A);
  const incomeB = resolveMonthlyIncome(plan.parents.B);
  const rateA = sjukpenningnivaDailyAmount(incomeA);
  const rateB = sjukpenningnivaDailyAmount(incomeB);

  // Dubbeldagar: both parents draw a day at the same time. They come from the
  // non-reserved income-based pool (never the reserved days), are capped at the
  // statutory max and only before the 15-month deadline. Each spends one day per
  // parent (two from the family pool).
  const requestedDouble = Math.max(0, Math.floor(doubleDays));
  const transferable = Math.max(0, S - rA - rB);
  const doubleStillOpen =
    differenceInDays(asOf, planDeadlines(plan).doubleDaysDeadline) > 0;
  const maxDouble = doubleStillOpen
    ? Math.min(DOUBLE_DAYS.maxDays, Math.floor(transferable / 2))
    : 0;
  const effectiveDouble = Math.min(requestedDouble, maxDouble);

  // Split the remaining single days after carving out the dubbeldagar.
  const S2 = S - 2 * effectiveDouble;
  const sA = chooseSjukpenningSplitForA(objective, S2, rA, rB, rateA, rateB);
  const sB = S2 - sA;
  const lA = chooseLagstaSplitForA(L, sA, sB);
  const lB = L - lA;

  const allocation: Record<ParentId, TierCount> = {
    A: { sjukpenning: sA + effectiveDouble, lagsta: lA },
    B: { sjukpenning: sB + effectiveDouble, lagsta: lB },
  };

  const payoutA = payoutFor(allocation.A, incomeA);
  const payoutB = payoutFor(allocation.B, incomeB);

  // Reserved days are single days, so forfeiture is judged on the split (the
  // dubbeldagar added on top don't count toward the reserved block).
  const forfeitedReserved: Record<ParentId, number> = {
    A: Math.max(0, rA - sA),
    B: Math.max(0, rB - sB),
  };

  const allocatedTotals: Record<ParentId, number> = {
    A: allocation.A.sjukpenning + lA,
    B: allocation.B.sjukpenning + lB,
  };

  const warnings = buildWarnings(plan, {
    objective,
    remaining,
    allocation,
    allocatedTotals,
    forfeitedReserved,
    asOf,
  });

  if (requestedDouble > effectiveDouble) {
    warnings.push({
      level: "warning",
      code: "doubleDaysLimited",
      message: doubleStillOpen
        ? `Bara ${effectiveDouble} av ${requestedDouble} dubbeldagar får plats i den kvarvarande potten — dubbeldagar kan inte tas från de reserverade dagarna.`
        : `Dubbeldagar kan bara tas innan barnet fyllt ${DOUBLE_DAYS.withinFirstMonths} månader.`,
    });
  }

  return {
    objective,
    allocation,
    payout: { A: payoutA, B: payoutB, total: payoutA.amount + payoutB.amount },
    allocatedTotals,
    forfeitedReserved,
    doubleDays: effectiveDouble,
    warnings,
  };
}

// -----------------------------------------------------------------------------
// Warnings
// -----------------------------------------------------------------------------

interface WarningContext {
  objective: Objective;
  remaining: RemainingSummary;
  allocation: Record<ParentId, TierCount>;
  allocatedTotals: Record<ParentId, number>;
  forfeitedReserved: Record<ParentId, number>;
  asOf: Date;
}

function parentName(plan: PlanInput, id: ParentId): string {
  return plan.parents[id].name?.trim() || `Förälder ${id}`;
}

function buildWarnings(plan: PlanInput, ctx: WarningContext): PlanWarning[] {
  const warnings: PlanWarning[] = [];
  const usage = planUsage(plan);

  // 1. Over-allocated input (recorded usage exceeds the budget).
  if (ctx.remaining.overAllocated.sjukpenning || ctx.remaining.overAllocated.lagsta) {
    warnings.push({
      level: "critical",
      code: "overAllocated",
      message:
        "De dagar som redan är uttagna överstiger budgeten. Kontrollera de inmatade siffrorna.",
    });
  }

  // 2. Reserved-day forfeiture (only possible when too few income-based days
  //    remain to cover both parents' reserved blocks).
  for (const id of PARENT_IDS) {
    const lost = ctx.forfeitedReserved[id];
    if (lost > 0) {
      warnings.push({
        level: "critical",
        code: "reservedForfeit",
        message: `${parentName(plan, id)} förlorar ${lost} reserverade dagar i den här planen — de kan inte föras över till den andra föräldern.`,
      });
    }
  }

  // 3. SGI protection: general advisory + a per-parent gap flag.
  warnings.push({
    level: "info",
    code: "sgiProtection",
    message: `För att behålla SGI bör varje förälder som är ledig ta ut minst ${SGI_PROTECTION.minDaysPerWeekAfterAge1} dagar per vecka (eller arbeta) efter att barnet fyllt 1 år.`,
  });
  for (const id of PARENT_IDS) {
    const totalForParent =
      usage.byParent[id].total + ctx.allocatedTotals[id];
    const hasIncome = resolveMonthlyIncome(plan.parents[id]) > 0;
    if (hasIncome && totalForParent === 0) {
      warnings.push({
        level: "warning",
        code: "sgiGap",
        message: `${parentName(plan, id)} tar inte ut några dagar i den här planen. Se till att hen arbetar under tiden, annars kan SGI:n sänkas.`,
      });
    }
  }

  // 4. Timing: can the remaining income-based days physically be used before the
  //    child turns 4?
  const deadlines = planDeadlines(plan);
  const daysUntilAge4 = differenceInDays(ctx.asOf, deadlines.sjukpenningDeadline);
  const sjukRemaining = ctx.remaining.remaining.sjukpenning;
  if (daysUntilAge4 <= 0) {
    if (sjukRemaining > 0) {
      warnings.push({
        level: "warning",
        code: "timingAfterAge4",
        message: `Barnet har fyllt 4 år. Inkomstbaserade dagar går inte längre att ta ut fritt, och högst ${TIMING.maxDaysSavedFromAge4} sparade dagar kan användas fram till 12-årsdagen.`,
      });
    }
  } else if (sjukRemaining > daysUntilAge4) {
    warnings.push({
      level: "warning",
      code: "timingBeforeAge4",
      message: `Det återstår ${sjukRemaining} inkomstbaserade dagar men bara ${daysUntilAge4} kalenderdagar tills barnet fyller 4 år. Alla hinner inte tas ut i tid — som mest ${TIMING.maxDaysSavedFromAge4} dagar får sparas efter 4-årsdagen.`,
    });
  }

  // 5. Double-days window (informational).
  const daysUntilDoubleClose = differenceInDays(
    ctx.asOf,
    deadlines.doubleDaysDeadline,
  );
  if (daysUntilDoubleClose > 0) {
    warnings.push({
      level: "info",
      code: "doubleDaysWindow",
      message: `Ni kan ta ut upp till ${DOUBLE_DAYS.maxDays} dubbeldagar tills barnet är ${DOUBLE_DAYS.withinFirstMonths} månader. En dubbeldag förbrukar två dagar (en per förälder) och kan inte tas från de reserverade dagarna.`,
    });
  }

  // 6. Income above the SGI cap (extra income doesn't raise the benefit).
  for (const id of PARENT_IDS) {
    if (isAboveSgiCap(resolveMonthlyIncome(plan.parents[id]))) {
      warnings.push({
        level: "info",
        code: "incomeAboveCap",
        message: `${parentName(plan, id)} tjänar över taket (${formatCapShort()}). Dagarna värderas till högsta beloppet ${MONEY.maxSjukpenningPerDay} kr/dag och högre lön ökar inte föräldrapenningen.`,
      });
    }
  }

  return warnings;
}

function formatCapShort(): string {
  // 592 000 kr/år
  return `${MONEY.sgiAnnualCap.toLocaleString("sv-SE")} kr/år`;
}

// -----------------------------------------------------------------------------
// Public entry point
// -----------------------------------------------------------------------------

export function optimize(
  plan: PlanInput,
  options: OptimizeOptions = {},
): OptimizeResult {
  const objective = options.objective ?? "maxPayout";
  const asOf = options.asOf ?? new Date();
  const remaining = planRemaining(plan);

  const doubleDays = options.doubleDays ?? 0;
  const recommended = buildPlan(plan, objective, remaining, asOf, doubleDays);
  const alternatives = OBJECTIVES.filter((o) => o !== objective).map((o) =>
    buildPlan(plan, o, remaining, asOf, doubleDays),
  );

  return { recommended, alternatives, remaining };
}

// -----------------------------------------------------------------------------
// Solo (sole-custody) mode — one parent holds all the days, no reserved split
// -----------------------------------------------------------------------------

export interface SoloResult {
  remaining: RemainingSummary;
  /** Everything remaining goes to the single parent. */
  payout: ParentPayout;
  allocatedTotal: number;
  warnings: PlanWarning[];
}

function buildSoloWarnings(
  plan: PlanInput,
  remaining: RemainingSummary,
  asOf: Date,
): PlanWarning[] {
  const warnings: PlanWarning[] = [];

  if (remaining.overAllocated.sjukpenning || remaining.overAllocated.lagsta) {
    warnings.push({
      level: "critical",
      code: "overAllocated",
      message:
        "De dagar som redan är uttagna överstiger budgeten. Kontrollera de inmatade siffrorna.",
    });
  }

  warnings.push({
    level: "info",
    code: "sgiProtection",
    message: `För att behålla SGI bör du som är ledig ta ut minst ${SGI_PROTECTION.minDaysPerWeekAfterAge1} dagar per vecka (eller arbeta) efter att barnet fyllt 1 år.`,
  });

  const deadlines = planDeadlines(plan);
  const daysUntilAge4 = differenceInDays(asOf, deadlines.sjukpenningDeadline);
  const sjukRemaining = remaining.remaining.sjukpenning;
  if (daysUntilAge4 <= 0) {
    if (sjukRemaining > 0) {
      warnings.push({
        level: "warning",
        code: "timingAfterAge4",
        message: `Barnet har fyllt 4 år. Inkomstbaserade dagar går inte längre att ta ut fritt, och högst ${TIMING.maxDaysSavedFromAge4} sparade dagar kan användas fram till 12-årsdagen.`,
      });
    }
  } else if (sjukRemaining > daysUntilAge4) {
    warnings.push({
      level: "warning",
      code: "timingBeforeAge4",
      message: `Det återstår ${sjukRemaining} inkomstbaserade dagar men bara ${daysUntilAge4} kalenderdagar tills barnet fyller 4 år. Alla hinner inte tas ut i tid — som mest ${TIMING.maxDaysSavedFromAge4} dagar får sparas efter 4-årsdagen.`,
    });
  }

  if (isAboveSgiCap(resolveMonthlyIncome(plan.parents.A))) {
    warnings.push({
      level: "info",
      code: "incomeAboveCap",
      message: `Du tjänar över taket (${formatCapShort()}). Dagarna värderas till högsta beloppet ${MONEY.maxSjukpenningPerDay} kr/dag och högre lön ökar inte föräldrapenningen.`,
    });
  }

  return warnings;
}

/**
 * Sole-custody planning: the single parent (A) is entitled to all the days, so
 * there is no split, no reserved-day transfer and no dubbeldagar. Returns the
 * remaining days and what they're worth to that parent.
 */
export function optimizeSolo(
  plan: PlanInput,
  options: { asOf?: Date } = {},
): SoloResult {
  const asOf = options.asOf ?? new Date();
  const budget = planBudget(plan);
  const usedSjuk = Math.max(0, plan.parents.A.daysUsed.sjukpenning);
  const usedLagsta = Math.max(0, plan.parents.A.daysUsed.lagsta);

  const remaining: RemainingSummary = {
    budget,
    used: {
      sjukpenning: usedSjuk,
      lagsta: usedLagsta,
      total: usedSjuk + usedLagsta,
    },
    remaining: {
      sjukpenning: Math.max(0, budget.sjukpenning - usedSjuk),
      lagsta: Math.max(0, budget.lagsta - usedLagsta),
      total: Math.max(0, budget.total - (usedSjuk + usedLagsta)),
    },
    overAllocated: {
      sjukpenning: usedSjuk > budget.sjukpenning,
      lagsta: usedLagsta > budget.lagsta,
    },
  };

  const days: TierCount = {
    sjukpenning: remaining.remaining.sjukpenning,
    lagsta: remaining.remaining.lagsta,
  };
  const payout = payoutFor(days, resolveMonthlyIncome(plan.parents.A));

  return {
    remaining,
    payout,
    allocatedTotal: days.sjukpenning + days.lagsta,
    warnings: buildSoloWarnings(plan, remaining, asOf),
  };
}

/** Validate that the child's birth date parses — handy guard for the UI. */
export function isPlannableBirthDate(birthDate: string): boolean {
  try {
    parseIsoDate(birthDate);
    return true;
  } catch {
    return false;
  }
}
