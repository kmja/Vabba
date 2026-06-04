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

/** Rough leave duration in months, assuming 7 benefit days drawn per week. */
export function approxMonths(days: number): string {
  const months = days / 30.4;
  if (months < 1) return "< 1 mån";
  return `≈ ${months.toFixed(months < 10 ? 1 : 0)} mån`;
}
