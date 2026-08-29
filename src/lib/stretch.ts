/**
 * stretch.ts — Turn a period's allocated days into a dated calendar stretch,
 * honouring the hard constraints:
 *
 *   - Before the child's 1st birthday SGI is shielded, so the pace can be
 *     slow (stretching the leave); after it the pace is floored at the SGI
 *     minimum (configurable, 5 days/week by default) unless the caregiver
 *     works the rest of the week.
 *   - Income-based days are forfeited at the 4th birthday — a stretch that
 *     would draw past it reports the overrun rather than silently losing the
 *     days.
 *
 * Pure and framework-agnostic.
 */
import { addDays, differenceInDays } from "@/lib/dates";

export const SGI_MIN_DAYS_PER_WEEK = 5;
/** Default slow pace in the child's first year (SGI is shielded there). */
export const YEAR1_PACE = 0.5;
/** Days in a working week Försäkringskassan sizes partial leave against. */
export const WORK_WEEK = 5;

export interface StretchSpec {
  /** Days of leave this period draws (income + flat already summed). */
  days: number;
  /** Calendar day the leave begins. */
  start: Date;
  /** Child's 1st birthday — the SGI pace floor starts here. */
  oneYear: Date;
  /** Child's 4th birthday — income days expire here. */
  incomeDeadline: Date;
  /** Pace before the 1st birthday (defaults to a slow, SGI-shielded pace). */
  phase1?: number;
  /** The floor applied after the 1st birthday (defaults to 5 d/wk). */
  minPhase2?: number;
}

export interface Stretch {
  startsAt: Date;
  endsAt: Date;
  pace: { phase1: number; phase2: number };
  /** Income-based days that spill past the income deadline (0 normally). */
  overrunDays: number;
}

export function resolveStretch(spec: StretchSpec): Stretch {
  const days = Math.max(0, Math.floor(spec.days));
  const minPhase2 = spec.minPhase2 ?? SGI_MIN_DAYS_PER_WEEK;
  const phase1 = Math.max(0, spec.phase1 ?? YEAR1_PACE);
  const phase2 = Math.max(minPhase2, phase1);
  const oneYear = spec.oneYear.getTime() >= spec.start.getTime() ? spec.oneYear : spec.start;

  let endsAt = spec.start;
  let used = 0;

  const calDaysBefore = Math.max(0, differenceInDays(spec.start, oneYear));
  const drawBefore = (calDaysBefore / 7) * phase1;
  if (days > 0 && calDaysBefore > 0) {
    const first = Math.min(days, drawBefore);
    used += first;
    // If all days fit before the first birthday, end inside phase 1.
    if (first < days) {
      endsAt = oneYear;
    } else {
      endsAt = addDays(spec.start, Math.round((first / phase1) * 7));
      used = first;
      return { startsAt: spec.start, endsAt, pace: { phase1, phase2 }, overrunDays: 0 };
    }
  }

  const rest = days - used;
  let overrun = 0;
  if (rest > 0) {
    endsAt = addDays(oneYear, Math.round((rest / phase2) * 7));
    if (endsAt.getTime() > spec.incomeDeadline.getTime()) {
      // Everything in phase 2 after the deadline is income days drawn too late.
      const calPast = Math.max(0, differenceInDays(spec.incomeDeadline, endsAt));
      overrun = Math.round((calPast / 7) * phase2);
      endsAt = endsAt; // keep the stretch; the caller surfaces the overrun.
    }
  }

  return {
    startsAt: spec.start,
    endsAt,
    pace: { phase1, phase2 },
    overrunDays: overrun,
  };
}
