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

export type Objective =
  | "maxHousehold"
  | "maxPayout"
  | "equal"
  | "minMonthly"
  | "custom";

export const OBJECTIVES: readonly Objective[] = [
  "maxHousehold",
  "maxPayout",
  "equal",
  "minMonthly",
  "custom",
];

export const OBJECTIVE_LABEL: Record<Objective, string> = {
  maxHousehold: "Maximera hushållsinkomst",
  maxPayout: "Maximera föräldrapenning",
  equal: "Jämn fördelning",
  minMonthly: "Förläng ledigheten",
  custom: "Egen fördelning",
};

export const OBJECTIVE_DESCRIPTION: Record<Objective, string> = {
  maxHousehold:
    "Lägg ledigheten på den som tjänar minst, så att den som tjänar mest fortsätter jobba — hushållet behåller den högre lönen och får mest pengar totalt.",
  maxPayout:
    "Lägg så många inkomstbaserade dagar som möjligt på den vårdnadshavare som tjänar mest — högst föräldrapenning, men hushållet förlorar den lönen under tiden.",
  equal: "Dela hemmatiden så jämnt som möjligt mellan vårdnadshavarna.",
  minMonthly:
    "Dela dagarna jämnt och ta ut dem i långsammast möjliga takt som ändå ger minst ditt önskade månadsbelopp — så räcker ledigheten så länge som möjligt.",
  custom:
    "Bestäm själv hur dagarna fördelas mellan vårdnadshavarna. De reserverade dagarna behålls alltid.",
};

export type WarningLevel = "info" | "warning" | "critical";

export type WarningCode =
  | "reservedForfeit"
  | "sgiProtection"
  | "sgiPaceEnforced"
  | "sgiGap"
  | "timingBeforeAge4"
  | "timingAfterAge4"
  | "doubleDaysWindow"
  | "incomeAboveCap"
  | "doubleDaysLimited"
  | "grundnivaFirst180"
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
  /**
   * How many of the income-based days are paid at grundnivå instead of the
   * income rate because the 240-day rule isn't met (the first 180 days).
   */
  grundnivaDays: number;
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
  /** Share of the days to caregiver A (0–1) for the "custom" objective. */
  customSplitA?: number;
  /**
   * Whether to spend the flat lägstanivå days (180 kr) in the plan. When false
   * they're left saved (the leave ends when income-based days run out). Defaults
   * to true.
   */
  includeLagsta?: boolean;
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

function payoutFor(
  days: TierCount,
  grossMonthlyIncome: number,
  grundnivaDays = 0,
): ParentPayout {
  const dailyRate = sjukpenningnivaDailyAmount(grossMonthlyIncome);
  const gnv = Math.max(0, Math.min(grundnivaDays, days.sjukpenning));
  const incomeSjuk = days.sjukpenning - gnv;
  return {
    sjukpenningDays: days.sjukpenning,
    lagstaDays: days.lagsta,
    dailyRate,
    grundnivaDays: gnv,
    amount:
      gnv * MONEY.grundnivaPerDay +
      incomeSjuk * dailyRate +
      days.lagsta * MONEY.lagstaPerDay,
  };
}

/**
 * How many of a parent's allocated income-based days fall in the first-180-day
 * grundnivå window when they don't meet the 240-day rule (already-used income
 * days count toward the 180).
 */
function grundnivaDaysFor(
  parent: PlanInput["parents"][ParentId],
  allocatedSjuk: number,
  usedSjuk: number,
): number {
  if (parent.meets240DayRule === false) {
    return Math.max(0, Math.min(allocatedSjuk, 180 - usedSjuk));
  }
  return 0;
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
  customSplitA: number,
  salaryA: number,
  salaryB: number,
): number {
  // Not enough income-based days to honour both reserved blocks: split them
  // proportionally so the unavoidable forfeiture is shared fairly.
  if (rA + rB > S) {
    if (rA + rB === 0) return 0;
    return clamp(Math.round((S * rA) / (rA + rB)), 0, S);
  }

  const lo = rA; // A must take at least its reserved
  const hi = S - rB; // …and must leave B's reserved for B

  if (objective === "custom") {
    // The user picks the share of the income-based days for A.
    return clamp(Math.round(customSplitA * S), lo, hi);
  }
  if (objective === "maxHousehold") {
    // Put the transferable income-based days on the LOWER earner, so the higher
    // earner keeps working and the household keeps the bigger salary. Ranked by
    // actual salary (correct even when both are above the cap and rates tie).
    if (salaryA < salaryB) return hi;
    if (salaryA > salaryB) return lo;
    return clamp(Math.round(S / 2), lo, hi);
  }
  if (objective === "maxPayout") {
    // Put income-based days on the higher-rate parent. When the rates are equal
    // the payout is identical either way, so split evenly instead of arbitrarily
    // favouring A.
    if (rateA > rateB) return hi;
    if (rateA < rateB) return lo;
    return clamp(Math.round(S / 2), lo, hi);
  }
  // "equal" / "minMonthly": aim for a 50/50 split of the income-based days,
  // within bounds. (minMonthly only changes the leave *pace*, not the split.)
  return clamp(Math.round(S / 2), lo, hi);
}

/** Monthly salary at the cap — the floor used when an above-cap figure is unknown. */
const CAP_MONTHLY_SALARY = Math.round(MONEY.sgiAnnualCap / 12);

/** A parent's actual gross monthly salary for household-income ranking. */
function householdSalary(parent: PlanInput["parents"][ParentId]): number {
  if (parent.grossMonthlyIncome > 0) return parent.grossMonthlyIncome;
  return parent.incomeAboveCap ? CAP_MONTHLY_SALARY : 0;
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
  customSplitA = 0.5,
  includeLagsta = true,
): OptimizedPlan {
  const S = remaining.remaining.sjukpenning;
  // Lägstanivå days are optional — when not taken, the leave ends as the
  // income-based days run out.
  const L = includeLagsta ? remaining.remaining.lagsta : 0;

  const reservedRisk = reservedDaysAtRisk(plan);
  const rA = reservedRisk.A;
  const rB = reservedRisk.B;

  const incomeA = resolveMonthlyIncome(plan.parents.A);
  const incomeB = resolveMonthlyIncome(plan.parents.B);
  const rateA = sjukpenningnivaDailyAmount(incomeA);
  const rateB = sjukpenningnivaDailyAmount(incomeB);

  // Actual salaries drive the household-income split (which keeps the higher
  // earner working). Falls back to the cap when an above-cap figure is unknown.
  const salaryA = householdSalary(plan.parents.A);
  const salaryB = householdSalary(plan.parents.B);

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
  const sA = chooseSjukpenningSplitForA(
    objective,
    S2,
    rA,
    rB,
    rateA,
    rateB,
    customSplitA,
    salaryA,
    salaryB,
  );
  const sB = S2 - sA;
  const lA =
    objective === "custom"
      ? clamp(Math.round(customSplitA * L), 0, L)
      : objective === "maxHousehold"
        ? // Flat days follow the income-based ones — onto the lower earner.
          salaryA < salaryB
          ? L
          : salaryA > salaryB
            ? 0
            : chooseLagstaSplitForA(L, sA, sB)
        : chooseLagstaSplitForA(L, sA, sB);
  const lB = L - lA;

  const allocation: Record<ParentId, TierCount> = {
    A: { sjukpenning: sA + effectiveDouble, lagsta: lA },
    B: { sjukpenning: sB + effectiveDouble, lagsta: lB },
  };

  // 240-day rule: a non-qualifying parent's first 180 income-based days pay
  // grundnivå. Already-used income days count toward the 180.
  const usage = planUsage(plan);
  const payoutA = payoutFor(
    allocation.A,
    incomeA,
    grundnivaDaysFor(plan.parents.A, allocation.A.sjukpenning, usage.byParent.A.sjukpenning),
  );
  const payoutB = payoutFor(
    allocation.B,
    incomeB,
    grundnivaDaysFor(plan.parents.B, allocation.B.sjukpenning, usage.byParent.B.sjukpenning),
  );

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
  return plan.parents[id].name?.trim() || `Vårdnadshavare ${id}`;
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
        message: `${parentName(plan, id)} förlorar ${lost} reserverade dagar i den här planen — de kan inte föras över till den andra vårdnadshavaren.`,
      });
    }
  }

  // 3. SGI protection: general advisory + a per-parent gap flag.
  warnings.push({
    level: "info",
    code: "sgiProtection",
    message: `Under barnets första år är SGI skyddad oavsett takt. Efter 1-årsdagen behåller varje vårdnadshavare som är ledig sin SGI genom att ta ut minst ${SGI_PROTECTION.minDaysPerWeekAfterAge1} dagar per vecka — eller arbeta resten av veckan.`,
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
      message: `Ni kan ta ut upp till ${DOUBLE_DAYS.maxDays} dubbeldagar tills barnet är ${DOUBLE_DAYS.withinFirstMonths} månader. En dubbeldag förbrukar två dagar (en per vårdnadshavare) och kan inte tas från de reserverade dagarna.`,
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

  // 7. 240-day rule not met → first 180 income-based days at grundnivå.
  for (const id of PARENT_IDS) {
    if (plan.parents[id].meets240DayRule === false) {
      warnings.push({
        level: "warning",
        code: "grundnivaFirst180",
        message: `${parentName(plan, id)} uppfyller inte 240-dagarsvillkoret, så de första 180 inkomstbaserade dagarna betalas på grundnivå (${MONEY.grundnivaPerDay} kr/dag) i stället för på sjukpenningnivå.`,
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
  const customSplitA = options.customSplitA ?? 0.5;
  const includeLagsta = options.includeLagsta ?? true;
  const recommended = buildPlan(
    plan,
    objective,
    remaining,
    asOf,
    doubleDays,
    customSplitA,
    includeLagsta,
  );
  const alternatives = OBJECTIVES.filter((o) => o !== objective).map((o) =>
    buildPlan(plan, o, remaining, asOf, doubleDays, customSplitA, includeLagsta),
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
    message: `Under barnets första år är SGI skyddad oavsett takt. Efter 1-årsdagen behåller du SGI genom att ta ut minst ${SGI_PROTECTION.minDaysPerWeekAfterAge1} dagar per vecka — eller arbeta resten av veckan.`,
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

  if (plan.parents.A.meets240DayRule === false) {
    warnings.push({
      level: "warning",
      code: "grundnivaFirst180",
      message: `Du uppfyller inte 240-dagarsvillkoret, så de första 180 inkomstbaserade dagarna betalas på grundnivå (${MONEY.grundnivaPerDay} kr/dag) i stället för på sjukpenningnivå.`,
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
  options: { asOf?: Date; includeLagsta?: boolean } = {},
): SoloResult {
  const asOf = options.asOf ?? new Date();
  const includeLagsta = options.includeLagsta ?? true;
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
    lagsta: includeLagsta ? remaining.remaining.lagsta : 0,
  };
  const payout = payoutFor(
    days,
    resolveMonthlyIncome(plan.parents.A),
    grundnivaDaysFor(plan.parents.A, days.sjukpenning, usedSjuk),
  );

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
