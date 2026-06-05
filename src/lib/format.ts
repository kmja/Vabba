/**
 * format.ts — Swedish-locale display helpers. UI-only; no business logic.
 */

const sekFormatter = new Intl.NumberFormat("sv-SE", {
  style: "currency",
  currency: "SEK",
  maximumFractionDigits: 0,
});

const numberFormatter = new Intl.NumberFormat("sv-SE");

const dateFormatter = new Intl.DateTimeFormat("sv-SE", {
  year: "numeric",
  month: "long",
  day: "numeric",
});

const monthYearFormatter = new Intl.DateTimeFormat("sv-SE", {
  year: "numeric",
  month: "short",
});

export function formatSek(amount: number): string {
  return sekFormatter.format(Math.round(amount));
}

export function formatNumber(value: number): string {
  return numberFormatter.format(value);
}

export function formatDate(date: Date): string {
  return dateFormatter.format(date);
}

export function formatMonthYear(date: Date): string {
  return monthYearFormatter.format(date);
}

export function formatDays(value: number): string {
  return `${formatNumber(value)} ${value === 1 ? "dag" : "dagar"}`;
}

/** Rough leave duration in calendar weeks for `days` taken at `daysPerWeek`. */
export function approxLeaveWeeks(days: number, daysPerWeek = 7): number {
  const perWeek = daysPerWeek > 0 ? daysPerWeek : 7;
  return Math.round(days / perWeek);
}

/** Rough leave duration in calendar months for `days` taken at `daysPerWeek`. */
export function approxLeaveMonths(days: number, daysPerWeek = 7): string {
  const perWeek = daysPerWeek > 0 ? daysPerWeek : 7;
  const months = ((days / perWeek) * 7) / 30.4;
  if (months <= 0) return "0 mån";
  if (months < 1) return "< 1 mån";
  return `≈ ${months.toFixed(months < 10 ? 1 : 0)} mån`;
}

/** Rough leave duration in months, assuming 7 benefit days drawn per week. */
export function approxMonths(days: number): string {
  return approxLeaveMonths(days, 7);
}

/**
 * Rough gross benefit per calendar month when drawing days at `dailyRate` at a
 * given weekly pace. Föräldrapenning is paid per day taken, so monthly income
 * scales with days/week. Uses 30.4 days/month to stay consistent with the
 * duration helpers above.
 */
export function approxMonthlyGross(dailyRate: number, daysPerWeek = 7): number {
  const perWeek = daysPerWeek > 0 ? daysPerWeek : 7;
  return Math.round((dailyRate * perWeek * 30.4) / 7);
}
