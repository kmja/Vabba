/**
 * dates.ts — Small, dependency-free calendar helpers.
 *
 * Föräldrapenning deadlines are calendar-exact (the child's 4th birthday, 12th
 * birthday, age 15 months …) so we do real date arithmetic rather than
 * approximating with "days = months × 30". Kept separate from `rules.ts` and the
 * UI so it can be unit-tested on its own.
 *
 * All helpers treat dates as calendar dates at local midnight and never mutate
 * their input.
 */

/** True if `iso` is a real calendar date in strict `YYYY-MM-DD` form. */
export function isValidIsoDate(iso: string): boolean {
  if (!/^\d{4}-\d{2}-\d{2}$/.test(iso)) return false;
  const [y, m, d] = iso.split("-").map(Number);
  if (m < 1 || m > 12 || d < 1 || d > 31) return false;
  const date = new Date(y, m - 1, d);
  // Reject overflow (e.g. 2025-02-31 → rolls into March).
  return (
    date.getFullYear() === y &&
    date.getMonth() === m - 1 &&
    date.getDate() === d
  );
}

/** Parse a strict `YYYY-MM-DD` string to a local-midnight Date. Throws if invalid. */
export function parseIsoDate(iso: string): Date {
  if (!isValidIsoDate(iso)) {
    throw new Error(`Invalid ISO date: ${iso}`);
  }
  const [y, m, d] = iso.split("-").map(Number);
  return new Date(y, m - 1, d);
}

/** Format a Date back to `YYYY-MM-DD` (local). */
export function toIsoDate(date: Date): string {
  const y = date.getFullYear();
  const m = String(date.getMonth() + 1).padStart(2, "0");
  const d = String(date.getDate()).padStart(2, "0");
  return `${y}-${m}-${d}`;
}

export function addDays(date: Date, days: number): Date {
  const next = new Date(date);
  next.setDate(next.getDate() + days);
  return next;
}

export function addMonths(date: Date, months: number): Date {
  const next = new Date(date);
  const targetMonth = next.getMonth() + months;
  next.setMonth(targetMonth);
  return next;
}

/**
 * Add whole years. Note: a 29 Feb date plus a year lands on 1 Mar in non-leap
 * years (standard JS Date overflow behaviour) — acceptable for planning.
 */
export function addYears(date: Date, years: number): Date {
  return addMonths(date, years * 12);
}

/**
 * Whole calendar months from `from` to `to` (floored). Negative if `to` is
 * before `from`. Used to place events on a month-by-month timeline.
 */
export function monthsBetween(from: Date, to: Date): number {
  let months =
    (to.getFullYear() - from.getFullYear()) * 12 +
    (to.getMonth() - from.getMonth());
  if (to.getDate() < from.getDate()) months -= 1;
  return months;
}

/** The date the child reaches a given age in whole years (their Nth birthday). */
export function birthdayAtAge(birthDate: Date, ageYears: number): Date {
  return addYears(birthDate, ageYears);
}

/** Whole days from `from` to `to` (floored). Negative if `to` precedes `from`. */
export function differenceInDays(from: Date, to: Date): number {
  const MS_PER_DAY = 24 * 60 * 60 * 1000;
  // Normalize to midnight to avoid DST/partial-day drift.
  const a = new Date(from.getFullYear(), from.getMonth(), from.getDate());
  const b = new Date(to.getFullYear(), to.getMonth(), to.getDate());
  return Math.round((b.getTime() - a.getTime()) / MS_PER_DAY);
}
