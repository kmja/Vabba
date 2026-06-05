/**
 * rules.ts — Encoded Försäkringskassan föräldrapenning ruleset.
 * =============================================================================
 *
 * Framework-agnostic. NO React / Next / DOM imports. Pure data + pure functions
 * so the ruleset can be unit-tested in isolation and ported elsewhere (e.g. a
 * native app) without dragging UI along. This single file is the source of
 * truth; an annual update should be a one-file edit.
 *
 * ⚠️  THIS IS A PLANNING AID, NOT OFFICIAL ADVICE.
 *     Every figure below must be confirmed against forsakringskassan.se before
 *     anyone relies on it. Amounts and edge rules change — usually every January
 *     when the prisbasbelopp is updated. Underlying law: Socialförsäkringsbalken
 *     kapitel 11–12.
 *
 * VERIFICATION STATUS
 * -------------------
 * Figures last checked against public sources in **June 2026**, reflecting the
 * rules for benefits paid during 2026. Each constant carries a comment pointing
 * at where to re-verify it. Items still needing a primary-source check are
 * marked `TODO(confirm)`.
 *
 * Primary sources:
 *  - Föräldrapenning overview:
 *    https://www.forsakringskassan.se/privatperson/foralder/foraldrapenning
 *  - Aktuella belopp (amounts):
 *    https://www.forsakringskassan.se/privatperson/e-tjanster-blanketter-och-informationsmaterial/aktuella-belopp
 *  - Dubbeldagar:
 *    https://www.forsakringskassan.se/privatperson/foralder/foraldrapenning/foraldralediga-tillsammans---dubbeldagar
 */

// -----------------------------------------------------------------------------
// Provenance / staleness metadata (surface this in the UI so users know the
// ruleset can go stale).
// -----------------------------------------------------------------------------

export const RULESET_YEAR = 2026;

/** ISO date these figures were last verified against public sources. */
export const RULESET_VERIFIED_ON = "2026-06-04";

export const RULESET_PRIMARY_SOURCE =
  "https://www.forsakringskassan.se/privatperson/foralder/foraldrapenning";

// -----------------------------------------------------------------------------
// Domain types
// -----------------------------------------------------------------------------

/**
 * The two day "tiers" in the budget.
 *  - `sjukpenning` — income-based (~80% of SGI), the valuable days.
 *  - `lagsta`      — lägstanivå, a flat low daily amount, not income-based.
 *
 * (Grundnivå is not a separate tier in the budget; it is the *floor amount* paid
 * on `sjukpenning` days to a parent with little/no established SGI. See
 * `sjukpenningnivaDailyAmount`.)
 */
export type BenefitTier = "sjukpenning" | "lagsta";

export const BENEFIT_TIERS: readonly BenefitTier[] = ["sjukpenning", "lagsta"];

/** Human-readable Swedish labels for the tiers, for UI reuse. */
export const TIER_LABEL: Record<BenefitTier, string> = {
  sjukpenning: "Sjukpenningnivå",
  lagsta: "Lägstanivå",
};

// -----------------------------------------------------------------------------
// Day budget
// -----------------------------------------------------------------------------

export const DAY_BUDGET = {
  /** Total days for a single child, both parents combined. */
  totalPerChild: 480,

  /** Income-based days (~80% of SGI) in the 480. Source: FK föräldrapenning. */
  sjukpenningDays: 390,

  /** Flat-rate (lägstanivå) days in the 480. */
  lagstaDays: 90,

  /**
   * How the 480 splits between the two parents. Each parent gets 240
   * (195 sjukpenning + 45 lägsta). Either parent may transfer days to the other
   * EXCEPT the reserved ones below.
   */
  perParent: {
    total: 240,
    sjukpenningDays: 195,
    lagstaDays: 45,
  },

  /**
   * Reserved, non-transferable days per parent ("reserverade dagar", the
   * so-called pappa-/mammamånader). Forfeited if unused — a key thing the
   * optimizer must warn about.
   *
   * These 90 days are on sjukpenningnivå (income-based) — confirmed June 2026
   * against FK: "90 dagar på sjukpenningnivå är reserverade och kan inte föras
   * över till den andra föräldern." Our model treats reserved days as
   * `sjukpenning`, which matches.
   */
  reservedDaysPerParent: 90,

  /**
   * Multiple birth bump: extra days per additional child beyond the first.
   * Each additional child adds 180 days, split 90 sjukpenningnivå + 90
   * lägstanivå (confirmed June 2026). So twins (2) = +180 (480/180 split totals
   * below), triplets (3) = +360, etc. Unlike the reserved days, the extra days
   * are freely transferable between the parents.
   */
  multipleBirthExtraPerChild: {
    sjukpenning: 90,
    lagsta: 90,
  },
} as const;

// -----------------------------------------------------------------------------
// Timing constraints (everything keyed off the child's age)
// -----------------------------------------------------------------------------

export const TIMING = {
  /**
   * Income-based (`sjukpenning`) days must be used before this birthday.
   * After it, unused income-based days beyond the saved-day allowance below are
   * forfeited.
   */
  sjukpenningUntilAge: 4,

  /**
   * From the child's 4th birthday you may keep at most this many days IN TOTAL
   * (both parents combined). Plan so you don't "drop" days at the 4-year mark.
   */
  maxDaysSavedFromAge4: 96,

  /** Lägstanivå days may be saved until this birthday. */
  lagstaUntilAge: 12,

  /** All föräldrapenning days expire at this birthday. */
  allDaysExpireAtAge: 12,
} as const;

export const DOUBLE_DAYS = {
  /**
   * "Dubbeldagar": days both parents draw föräldrapenning simultaneously.
   * Doubled from 30 → 60 on 1 July 2024. Taking one dubbeldag spends two days
   * from the budget (one per parent).
   */
  maxDays: 60,

  /** Dubbeldagar may only be taken during the child's first N months. */
  withinFirstMonths: 15,

  /** Dubbeldagar cannot be drawn from the 90 reserved days. */
  excludesReservedDays: true,
} as const;

// -----------------------------------------------------------------------------
// Money
// -----------------------------------------------------------------------------

export const MONEY = {
  /** Prisbasbelopp 2026. Source: SCB / FK aktuella belopp. Updated yearly. */
  prisbasbelopp: 59_200,

  /** SGI for föräldrapenning is capped at 10 × prisbasbelopp. */
  sgiCapMultiplier: 10,

  /**
   * SGI annual cap = sgiCapMultiplier × prisbasbelopp = 592 000 kr (2026).
   * Kept as a derived constant (not a getter) so the whole object stays a plain
   * `as const` literal.
   */
  sgiAnnualCap: 10 * 59_200,

  /** SGI is multiplied by this factor before the benefit is computed. */
  sgiAdjustmentFactor: 0.97,

  /** Replacement rate applied to adjusted SGI ("knappt 80 %"). */
  replacementRate: 0.8,

  /** Benefit is a daily amount: adjusted SGI is divided across the year. */
  daysPerYearDivisor: 365,

  /**
   * Highest föräldrapenning on sjukpenningnivå, 2026. Equivalent to the SGI cap
   * run through the formula (592000 × 0.97 × 0.8 / 365 ≈ 1259). Capped here so we
   * never exceed the published max regardless of rounding.
   */
  maxSjukpenningPerDay: 1_259,

  /**
   * Grundnivå: the floor amount paid on income-based days to a parent with
   * little/no established SGI. Confirmed 250 kr/day for 2026 (unchanged).
   */
  grundnivaPerDay: 250,

  /** Lägstanivå: flat daily amount on the non-income-based days. */
  lagstaPerDay: 180,
} as const;

// -----------------------------------------------------------------------------
// SGI protection (a major optimization lever — letting SGI lapse loses money)
// -----------------------------------------------------------------------------

export const SGI_PROTECTION = {
  /**
   * SGI is fully protected while on parental leave during the child's first
   * year, regardless of leave intensity.
   */
  fullyProtectedUntilAgeMonths: 12,

  /**
   * After the child turns 1, to keep SGI a parent must either work or draw
   * föräldrapenning for at least this many WHOLE days per week (red days
   * included) when fully on leave. Working part-time, you must instead draw
   * föräldrapenning matching the reduction in working hours (e.g. 75 % work →
   * 1.25 days/week, 50 % → 2.5 days/week). Confirmed June 2026.
   */
  minDaysPerWeekAfterAge1: 5,

  /**
   * Even if SGI is lowered, the föräldrapenning amount itself stays protected
   * until the child turns 2 — take leave again before then and you keep the
   * previous level. (Surfaced as context; not used in calculations.)
   */
  benefitAmountProtectedUntilAgeYears: 2,
} as const;

// -----------------------------------------------------------------------------
// Pure helpers
// -----------------------------------------------------------------------------

/**
 * Estimate SGI (sjukpenninggrundande inkomst) from gross monthly income.
 *
 * Simplification: for an employee SGI ≈ expected annual income ≈ monthly × 12,
 * capped at 10 prisbasbelopp. Real SGI rules consider expected future income,
 * have a lower floor, and special cases for self-employed — out of v1 scope.
 *
 * @param grossMonthlyIncome gross SEK per month
 */
export function estimateSgi(grossMonthlyIncome: number): number {
  const annual = Math.max(0, grossMonthlyIncome) * 12;
  return Math.min(annual, MONEY.sgiAnnualCap);
}

/**
 * Daily amount on the income-based (`sjukpenning`) tier for a given gross
 * monthly income. Floored at grundnivå and capped at the published yearly max.
 */
export function sjukpenningnivaDailyAmount(grossMonthlyIncome: number): number {
  const sgi = estimateSgi(grossMonthlyIncome);
  const raw = Math.round(
    (sgi * MONEY.sgiAdjustmentFactor * MONEY.replacementRate) /
      MONEY.daysPerYearDivisor,
  );
  const capped = Math.min(raw, MONEY.maxSjukpenningPerDay);
  return Math.max(capped, MONEY.grundnivaPerDay);
}

/** Daily amount on the flat (`lagsta`) tier. Constant; income-independent. */
export function lagstanivaDailyAmount(): number {
  return MONEY.lagstaPerDay;
}

/** Daily amount for a tier given a parent's income. */
export function dailyAmountForTier(
  tier: BenefitTier,
  grossMonthlyIncome: number,
): number {
  return tier === "sjukpenning"
    ? sjukpenningnivaDailyAmount(grossMonthlyIncome)
    : lagstanivaDailyAmount();
}

export interface TierTotals {
  total: number;
  sjukpenning: number;
  lagsta: number;
}

/**
 * Total day budget for a birth, accounting for the multiple-birth bump.
 * @param childrenInBirth number of children born together (1 = single, 2 = twins…)
 */
export function totalDaysForBirth(childrenInBirth = 1): TierTotals {
  const extraChildren = Math.max(0, Math.floor(childrenInBirth) - 1);
  const extraSjuk =
    extraChildren * DAY_BUDGET.multipleBirthExtraPerChild.sjukpenning;
  const extraLagsta =
    extraChildren * DAY_BUDGET.multipleBirthExtraPerChild.lagsta;
  return {
    total: DAY_BUDGET.totalPerChild + extraSjuk + extraLagsta,
    sjukpenning: DAY_BUDGET.sjukpenningDays + extraSjuk,
    lagsta: DAY_BUDGET.lagstaDays + extraLagsta,
  };
}

/** Convenience: is this income above the SGI cap (so extra income is "wasted")? */
export function isAboveSgiCap(grossMonthlyIncome: number): boolean {
  return grossMonthlyIncome * 12 > MONEY.sgiAnnualCap;
}

/**
 * A monthly gross income guaranteed to sit just above the SGI cap. The "income
 * is above the cap" shortcut uses this so a parent can opt into the maximum
 * daily amount without entering an exact salary — above the cap the precise
 * figure is irrelevant. Derived from the cap so it stays correct when the
 * prisbasbelopp changes.
 */
export const ABOVE_CAP_MONTHLY_INCOME = Math.ceil(MONEY.sgiAnnualCap / 12) + 1;

// -----------------------------------------------------------------------------
// Tax (for net estimates only — not part of the benefit rules)
// -----------------------------------------------------------------------------

export const TAX = {
  /**
   * Försäkringskassan withholds a flat 30 % preliminary tax on parental benefit
   * by default. Final tax depends on total income and municipality, so any net
   * figure derived from this is a rough estimate.
   */
  defaultWithholdingRate: 0.3,
} as const;

/** Rough net amount after FK's default 30 % preliminary tax withholding. */
export function netAfterTax(amount: number): number {
  return Math.round(amount * (1 - TAX.defaultWithholdingRate));
}
