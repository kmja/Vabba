import { useState } from "react";
import { IconChevronLeft, IconChevronRight } from "@tabler/icons-react";

import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { CG_BAR, PeriodCard, type LeaveProjection } from "@/components/timeline";
import type { MonthlyRow } from "@/components/monthly-estimate";
import type { GoalMode } from "@/lib/goal-seek";
import type { PlanDeadlines } from "@/lib/calc";
import type { LeaveInterval } from "@/lib/projection";
import { differenceInDays, toIsoDate } from "@/lib/dates";
import { formatDate, formatSek } from "@/lib/format";
import { formatMonths } from "@/components/monthly-estimate";
import { cn } from "@/lib/utils";

/** Callbacks that let the pager's date edits drive the plan ("custom" mode). */
export interface PeriodEditing {
  /** Caregiver display name → parent id. */
  idByName: Record<string, "A" | "B">;
  modeById: Record<"A" | "B", GoalMode>;
  hasStartOverride: Record<"A" | "B", boolean>;
  /** Editing a period's end sets that caregiver's "hemma till" date goal. */
  onEndDate: (id: "A" | "B", iso: string) => void;
  /** Back to the automatic length (manual mode). */
  onClearEnd: (id: "A" | "B") => void;
  /** Editing a period's start delays it (a gap where both work). */
  onStartDate: (id: "A" | "B", iso: string | null) => void;
}

interface Period {
  caregiver: string;
  startsAt: Date;
  endsAt: Date;
  segments: LeaveInterval[];
}

/** Contiguous same-caregiver runs of the projection's segments. */
function toPeriods(segments: LeaveInterval[]): Period[] {
  const out: Period[] = [];
  for (const seg of segments) {
    const last = out[out.length - 1];
    if (last && last.caregiver === (seg.caregiver ?? "")) {
      last.endsAt = seg.endsAt;
      last.segments.push(seg);
    } else {
      out.push({
        caregiver: seg.caregiver ?? "",
        startsAt: seg.startsAt,
        endsAt: seg.endsAt,
        segments: [seg],
      });
    }
  }
  return out;
}

/**
 * The results centrepiece: each stretch of leave as a discrete block to flip
 * through. The start and end dates are directly editable — an end date becomes
 * that caregiver's "hemma till" goal, a start date delays their period.
 */
export function PeriodPager({
  projection,
  rows = [],
  deadlines,
  editing,
}: {
  projection?: LeaveProjection;
  rows?: MonthlyRow[];
  deadlines: PlanDeadlines;
  editing: PeriodEditing;
}) {
  const [idx, setIdx] = useState(0);
  const segments = projection?.segments ?? [];
  const periods = toPeriods(segments);
  const cgOrder = periods
    .map((p) => p.caregiver)
    .filter((name, i, arr) => arr.indexOf(name) === i);

  // No dated periods (e.g. no days left) — fall back to plain cards.
  if (periods.length === 0) {
    return (
      <section className="space-y-3">
        <h2 className="leading-none font-semibold">Perioder</h2>
        {rows.map((row, i) => (
          <PeriodCard key={i} row={row} colorIdx={i} />
        ))}
      </section>
    );
  }

  const current = Math.min(idx, periods.length - 1);
  const p = periods[current];
  const row = rows.find((r) => r.name === p.caregiver);
  const id = editing.idByName[p.caregiver];
  const mode: GoalMode = id ? editing.modeById[id] : "manual";
  const colorIdx = Math.max(0, cgOrder.indexOf(p.caregiver));
  const months = formatMonths(differenceInDays(p.startsAt, p.endsAt) / 30.4);
  const prev = periods[current - 1];
  const next = periods[current + 1];
  const gapBefore = prev
    ? differenceInDays(prev.endsAt, p.startsAt)
    : differenceInDays(deadlines.birth, p.startsAt);
  const lagstaSeg = p.segments.find((s) => s.tier === "lagsta");

  return (
    <section className="space-y-3">
      <div className="flex items-center justify-between gap-2">
        <h2 className="leading-none font-semibold">Perioder</h2>
        <span className="text-muted-foreground text-xs tabular-nums">
          {current + 1} av {periods.length}
        </span>
      </div>

      {/* Overview strip: one chip per period, tap to jump. */}
      <div className="flex items-center gap-1.5">
        {periods.map((per, i) => (
          <button
            key={i}
            type="button"
            aria-label={`Period ${i + 1}: ${per.caregiver}`}
            onClick={() => setIdx(i)}
            className={cn(
              "h-3.5 flex-1 rounded-full transition-opacity sm:h-2.5",
              CG_BAR[Math.max(0, cgOrder.indexOf(per.caregiver)) % CG_BAR.length],
              i === current ? "opacity-100" : "opacity-35 hover:opacity-60",
            )}
          />
        ))}
      </div>

      <div className="bg-card rounded-lg border p-4 shadow-sm">
        <div className="flex items-center justify-between gap-2">
          <span className="flex items-center gap-2 text-sm font-semibold">
            <span
              className={cn(
                "inline-block size-2.5 rounded-sm",
                CG_BAR[colorIdx % CG_BAR.length],
              )}
            />
            {p.caregiver} är hemma
          </span>
          <span className="text-muted-foreground text-xs tabular-nums">
            {months}
          </span>
        </div>

        {/* Editable span — edits become goals ("custom" planning). */}
        <div className="mt-3 grid grid-cols-2 gap-3">
          <div className="space-y-1">
            <Label htmlFor={`period-start-${current}`} className="text-xs">
              Från
            </Label>
            <Input
              id={`period-start-${current}`}
              type="date"
              value={toIsoDate(p.startsAt)}
              onChange={(e) =>
                id && e.target.value && editing.onStartDate(id, e.target.value)
              }
            />
          </div>
          <div className="space-y-1">
            <Label htmlFor={`period-end-${current}`} className="text-xs">
              Till
            </Label>
            <Input
              id={`period-end-${current}`}
              type="date"
              value={toIsoDate(p.endsAt)}
              onChange={(e) =>
                id && e.target.value && editing.onEndDate(id, e.target.value)
              }
            />
          </div>
        </div>
        <div className="mt-1.5 flex flex-wrap gap-x-3 gap-y-1">
          {mode === "untilDate" && id && (
            <button
              type="button"
              onClick={() => editing.onClearEnd(id)}
              className="text-muted-foreground hover:text-foreground text-xs underline underline-offset-2"
            >
              Släpp slutdatumet (automatisk längd)
            </button>
          )}
          {id && editing.hasStartOverride[id] && (
            <button
              type="button"
              onClick={() => editing.onStartDate(id, null)}
              className="text-muted-foreground hover:text-foreground text-xs underline underline-offset-2"
            >
              Återställ startdatumet
            </button>
          )}
        </div>

        {gapBefore > 3 && (
          <p className="text-muted-foreground mt-2 text-xs">
            Glapp före perioden: ≈ {Math.round(gapBefore)} dagar
            {prev ? " då båda jobbar" : " efter födseln"} — dagarna väntar.
          </p>
        )}

        {/* The economy of this period. */}
        {row && (
          <div className="mt-3">
            <PeriodCard row={row} colorIdx={colorIdx} />
          </div>
        )}
        {lagstaSeg && (
          <p className="text-muted-foreground mt-2 text-xs">
            Från {formatDate(lagstaSeg.startsAt)}: lägstanivå ≈{" "}
            {formatSek(lagstaSeg.monthly)}/mån.
          </p>
        )}
      </div>

      <div className="flex items-center justify-between">
        <Button
          type="button"
          variant="outline"
          size="sm"
          disabled={current === 0}
          onClick={() => setIdx(current - 1)}
        >
          <IconChevronLeft /> {prev ? prev.caregiver : "Föregående"}
        </Button>
        <Button
          type="button"
          variant="outline"
          size="sm"
          disabled={current >= periods.length - 1}
          onClick={() => setIdx(current + 1)}
        >
          {next ? next.caregiver : "Nästa"} <IconChevronRight />
        </Button>
      </div>

      <p className="text-muted-foreground text-xs">
        Ledigheten slutar {formatDate(periods[periods.length - 1].endsAt)} ·
        inkomstdagar tas ut före {formatDate(deadlines.sjukpenningDeadline)} ·
        alla dagar förfaller {formatDate(deadlines.expiry)}.
      </p>
    </section>
  );
}
