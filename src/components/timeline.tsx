import { Fragment, useState } from "react";
import { IconChevronDown } from "@tabler/icons-react";

import {
  type IncomeSource,
  type MonthlyRow,
  formatMonths,
  householdMonthly,
  householdNetMonthly,
  incomeSources,
} from "@/components/monthly-estimate";
import { cn } from "@/lib/utils";
import { approxLeaveMonths, formatDays, formatPace, formatSek } from "@/lib/format";
import { MONEY } from "@/lib/rules";
import type { LeaveInterval } from "@/lib/projection";

export interface LeaveProjection {
  /** Ordered stretches of leave; boundaries become timeline markers. */
  segments: LeaveInterval[];
}

export const CG_BAR = ["bg-chart-1", "bg-chart-2", "bg-chart-3", "bg-chart-4"];
const CG_BORDER_L = [
  "border-l-chart-1",
  "border-l-chart-2",
  "border-l-chart-3",
  "border-l-chart-4",
];
const CG_BORDER_R = [
  "border-r-chart-1",
  "border-r-chart-2",
  "border-r-chart-3",
  "border-r-chart-4",
];

/**
 * Where the money in a stretch comes from, one row per source: label, brutto
 * (small, muted), netto (bold, what is actually kept — the rightmost column,
 * closest to the eye). Both are right-aligned and tabular so each reads
 * straight down to the total it sums to. Shared between the plain PeriodCard
 * and the period pager's own blocks.
 *
 * Where more than one caregiver's sources are mixed together (both on leave
 * at once), each source carries a `group` — the caregiver it belongs to —
 * and a heading row for it precedes their first source, so e.g. two
 * "Föräldrapenning" rows read as two different people's, not a duplicate.
 */
export function IncomeBreakdownTable({ sources }: { sources: IncomeSource[] }) {
  return (
    <div
      data-income-sources
      className="grid grid-cols-[1fr_auto_auto] items-baseline gap-x-3 gap-y-1"
    >
      <span />
      <span className="text-muted-foreground text-right text-[10px] tracking-wide uppercase">
        brutto
      </span>
      <span className="text-muted-foreground text-right text-[10px] tracking-wide uppercase">
        netto
      </span>
      {sources.map((s, i) => {
        const newGroup = s.group !== undefined && s.group !== sources[i - 1]?.group;
        return (
          <Fragment key={s.key}>
            {newGroup && (
              <span className="col-span-3 mt-1.5 text-xs font-medium first:mt-0">
                {s.group}
              </span>
            )}
            <span className="text-muted-foreground min-w-0 truncate text-xs">
              {s.label}
            </span>
            <span className="text-muted-foreground text-right text-xs tabular-nums">
              {formatSek(s.gross)}
            </span>
            <span className="text-right text-sm font-semibold tabular-nums">
              {formatSek(s.net)}
            </span>
          </Fragment>
        );
      })}
    </div>
  );
}

/**
 * The detail for one caregiver's leave period. Collapsed: after-tax household
 * income, duration, and any conditional notes. Expanded (click chevron): fine
 * print — gross amounts, per-day rate, pace. Shared with the period pager.
 */
export function PeriodCard({
  row,
  colorIdx,
  side = "left",
  municipalRate,
}: {
  row: MonthlyRow;
  colorIdx: number;
  side?: "left" | "right";
  /** The household's kommunalskatt; the national average when unset. */
  municipalRate?: number;
}) {
  const [open, setOpen] = useState(false);
  const hasHousehold = (row.householdBase ?? 0) > 0;
  const household = householdMonthly(row);
  const sources = incomeSources(row, municipalRate);
  const months =
    row.leaveMonths != null
      ? formatMonths(row.leaveMonths)
      : approxLeaveMonths(row.days, row.daysPerWeek);

  return (
    <div
      className={cn(
        "bg-card rounded-md border shadow-sm",
        side === "right"
          ? `border-r-4 ${CG_BORDER_R[colorIdx % CG_BORDER_R.length]}`
          : `border-l-4 ${CG_BORDER_L[colorIdx % CG_BORDER_L.length]}`,
      )}
    >
      <div className="p-3">
        {/* Header: name + goal tag + expand toggle */}
        <div className="flex items-start justify-between gap-2">
          <div className="flex flex-wrap items-baseline gap-x-2 gap-y-0.5">
            <span className="text-sm font-medium">{row.name}</span>
            {row.goalLabel && (
              <span className="text-muted-foreground bg-secondary rounded-full px-2 py-0.5 text-xs font-medium">
                {row.goalLabel}
              </span>
            )}
          </div>
          <button
            type="button"
            onClick={() => setOpen((o) => !o)}
            aria-expanded={open}
            aria-label={`Visa detaljer – ${row.name}`}
            className="text-muted-foreground hover:text-foreground mt-0.5 shrink-0 transition-colors"
          >
            <IconChevronDown
              className={cn("size-4 transition-transform", open && "rotate-180")}
            />
          </button>
        </div>

        {/* After-tax headline — the number people actually care about */}
        <div className="mt-1.5 flex items-baseline justify-between gap-2">
          <span className="text-muted-foreground text-xs">
            {hasHousehold ? "Hushåll" : "Per månad"} · efter skatt
          </span>
          <span className="text-2xl font-bold tabular-nums sm:text-xl">
            ≈ {formatSek(householdNetMonthly(row, municipalRate))}
            <span className="text-muted-foreground text-xs font-normal">/mån</span>
          </span>
        </div>

        {/* Where it comes from — the netto column reads down to the total
            above it. */}
        <div className="mt-3 border-t pt-2.5">
          <IncomeBreakdownTable sources={sources} />
        </div>

        <div className="text-muted-foreground mt-3 text-xs tabular-nums">
          <span className="text-foreground font-medium">{months}</span> ·{" "}
          {formatDays(row.days)} · {formatPace(row.daysPerWeek)} dagar/vecka
        </div>
      </div>

      {/* Fine print: the terms behind those numbers — shown on demand */}
      {open && (
        <div className="text-muted-foreground space-y-0.5 border-t px-3 pt-2 pb-3 text-xs">
          <div className="tabular-nums">
            Hushåll brutto ≈ {formatSek(household)}/mån ·{" "}
            {formatSek(row.dailyRate)}/dag föräldrapenning
          </div>
          {row.supplement && (
            <div>
              Föräldralön i ca{" "}
              {String(row.supplement.months).replace(".", ",")} mån
              {row.aboveCap ? " · täcker även lön över taket" : ""}
            </div>
          )}
          {row.grundnivaFirstDays ? (
            <div>
              Första {formatDays(row.grundnivaFirstDays)} på grundnivå (
              {formatSek(MONEY.grundnivaPerDay)}/dag)
            </div>
          ) : null}
          {row.extraDays ? (
            <div>inkl. {formatDays(row.extraDays)} sparade från tidigare barn</div>
          ) : null}
          {row.savedDays ? (
            <div>
              sparar {formatDays(row.savedDays)} till senare (klämdagar, lov …)
            </div>
          ) : null}
        </div>
      )}
    </div>
  );
}

