/**
 * plan-periods.ts — Bridge between the editable period list and the plan's
 * dated intervals shown on the results page.
 *
 * When the user has configured periods, we build the "Perioder" list from
 * those (via lib/periods + lib/stretch) instead of the goal-based solver. Each
 * period becomes a LeaveInterval: the dated stretch at its SGI-compliant post-
 * 1-year pace, with a monthly estimate from the caregiver's daily rate.
 */
import type { DatedPeriod } from "@/lib/periods";
import type { LeaveInterval } from "@/lib/projection";

const DAYS_PER_MONTH = 30.4;

/**
 * Turn allocated, dated periods into the segments the period pager renders.
 * `caregiver` is set to the display name so the pager can group blocks and
 * match income rows; the pace used is the post-1-year (SGI) pace.
 */
export function periodIntervals(
  periods: DatedPeriod[],
  names: Record<"A" | "B", string>,
  rateOf: (cg: "A" | "B") => number,
): LeaveInterval[] {
  return periods
    .filter((p) => p.days > 0)
    .map((p) => {
      const pace = Math.max(0.5, p.pace.phase2);
      return {
        startsAt: p.startsAt,
        endsAt: p.endsAt,
        pace,
        monthly: Math.round((rateOf(p.caregiver) * pace * DAYS_PER_MONTH) / 7),
        tier: "income" as const,
        caregiver: names[p.caregiver],
      };
    });
}
