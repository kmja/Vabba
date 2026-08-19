import { useState } from "react";
import { IconChevronDown } from "@tabler/icons-react";

import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { CG_BAR, PeriodCard, type LeaveProjection } from "@/components/timeline";
import type { MonthlyRow } from "@/components/monthly-estimate";
import type { GoalMode } from "@/lib/goal-seek";
import type { PlanDeadlines } from "@/lib/calc";
import type { LeaveInterval } from "@/lib/projection";
import { differenceInDays, toIsoDate } from "@/lib/dates";
import { formatDate } from "@/lib/format";
import { formatMonths } from "@/components/monthly-estimate";
import { cn } from "@/lib/utils";

/** Callbacks that let a period's date edits drive the plan ("custom" mode). */
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
  /** What makes this stretch its own block, when it isn't simply "them". */
  phase: string | null;
  /** Where this sits in its caregiver's run of periods. */
  firstOfCaregiver: boolean;
  lastOfCaregiver: boolean;
  /** When their whole run began — föräldralön is counted from there. */
  caregiverStart: Date;
}

function paceText(pace: number): string {
  return `${Number(pace.toFixed(1)).toString().replace(".", ",")} dagar/vecka`;
}

/**
 * The projection's segments, grouped into the blocks a reader would call
 * separate periods: a new caregiver, obviously — but also a change of pace
 * (the SGI floor lifts it at the 1-year mark) or of tier, since either one
 * changes the dates AND the money. Merging those into one card meant a block
 * whose headline income was true for only part of it.
 */
function toPeriods(segments: LeaveInterval[]): Period[] {
  const out: Period[] = [];
  for (const seg of segments) {
    const cg = seg.caregiver ?? "";
    const last = out[out.length - 1];
    const same =
      last &&
      last.caregiver === cg &&
      Math.abs(last.segments[0].pace - seg.pace) < 0.05 &&
      last.segments[0].tier === seg.tier;
    if (same) {
      last.endsAt = seg.endsAt;
      last.segments.push(seg);
    } else {
      out.push({
        caregiver: cg,
        startsAt: seg.startsAt,
        endsAt: seg.endsAt,
        segments: [seg],
        phase: null,
        firstOfCaregiver: last?.caregiver !== cg,
        lastOfCaregiver: true,
        caregiverStart: last?.caregiver === cg ? last.caregiverStart : seg.startsAt,
      });
      if (last?.caregiver === cg) last.lastOfCaregiver = false;
    }
  }
  // Name the blocks that share a caregiver, so the pager can tell them apart.
  for (const per of out) {
    const solo = out.filter((o) => o.caregiver === per.caregiver).length === 1;
    per.phase = solo
      ? null
      : per.segments[0].tier === "lagsta"
        ? "lägstanivå"
        : paceText(per.segments[0].pace);
  }
  return out;
}

/**
 * The economy of one block. The caregiver's row describes their whole
 * stretch, so the pace, the days, the length and the föräldralön months are
 * narrowed to what actually falls inside this block.
 */
function rowForPeriod(base: MonthlyRow, p: Period): MonthlyRow {
  const seg = p.segments[0];
  const months = differenceInDays(p.startsAt, p.endsAt) / 30.4;
  const days = Math.round(
    p.segments.reduce(
      (a, s) => a + (differenceInDays(s.startsAt, s.endsAt) / 7) * s.pace,
      0,
    ),
  );
  const basePace = base.daysPerWeek;
  // Part-time pay is what they earn on the days they are NOT drawing benefit,
  // so it moves with the pace of this block.
  const partTimeSalary =
    base.partTimeSalary && basePace < 7
      ? (base.partTimeSalary * (7 - seg.pace)) / (7 - basePace)
      : base.partTimeSalary;
  const supp = base.supplement;
  // Rounded, because it is shown as "i ca N mån" — a raw overlap would read
  // as 2.3026315789473686.
  const suppMonths = supp
    ? Math.round(
        Math.max(
          0,
          Math.min(
            months,
            supp.months - differenceInDays(p.caregiverStart, p.startsAt) / 30.4,
          ),
        ) * 10,
      ) / 10
    : 0;
  return {
    ...base,
    daysPerWeek: seg.pace,
    // Back out the daily rate this block is actually paid at — lägstanivå
    // blocks pay a different one from the income-based ones.
    dailyRate: seg.pace > 0 ? (seg.monthly * 7) / (30.4 * seg.pace) : 0,
    days,
    leaveMonths: months,
    partTimeSalary,
    // Each block IS a phase now; the "efter 1 år" footnote has become the
    // next block.
    secondPhase: undefined,
    supplement:
      supp && suppMonths > 0.1
        ? { ...supp, months: suppMonths, total: supp.monthly * suppMonths }
        : undefined,
    // Facts about the whole stretch belong to one end of it.
    grundnivaFirstDays: p.firstOfCaregiver ? base.grundnivaFirstDays : undefined,
    extraDays: p.firstOfCaregiver ? base.extraDays : undefined,
    savedDays: p.lastOfCaregiver ? base.savedDays : undefined,
  };
}

/**
 * The results centrepiece: every stretch of leave listed top to bottom, each
 * one an accordion — the header carries who, when and how long, and opening
 * it shows the editable span and the economy of that stretch. The start and
 * end dates are directly editable: an end date becomes that caregiver's
 * "hemma till" goal, a start date delays their period.
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
  // Which block is expanded. One at a time keeps the list scannable; the
  // open one can be clicked shut.
  const [openIdx, setOpenIdx] = useState<number | null>(0);
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

  const total = formatMonths(
    differenceInDays(periods[0].startsAt, periods[periods.length - 1].endsAt) /
      30.4,
  );

  return (
    <section className="space-y-3">
      <div className="flex items-center justify-between gap-2">
        <h2 className="leading-none font-semibold">Perioder</h2>
        <span className="text-muted-foreground text-xs tabular-nums">
          {total} totalt
        </span>
      </div>

      <div className="space-y-2">
        {periods.map((p, i) => {
          const isOpen = openIdx === i;
          const base = rows.find((r) => r.name === p.caregiver);
          const row = base ? rowForPeriod(base, p) : undefined;
          const id = editing.idByName[p.caregiver];
          const mode: GoalMode = id ? editing.modeById[id] : "manual";
          const colorIdx = Math.max(0, cgOrder.indexOf(p.caregiver));
          const months = formatMonths(
            differenceInDays(p.startsAt, p.endsAt) / 30.4,
          );
          const prev = periods[i - 1];
          const gapBefore = prev
            ? differenceInDays(prev.endsAt, p.startsAt)
            : differenceInDays(deadlines.birth, p.startsAt);

          return (
            <div
              key={i}
              className={cn(
                "bg-card rounded-lg border shadow-sm transition-colors",
                isOpen && "border-primary/40",
              )}
            >
              <button
                type="button"
                data-period-header
                aria-expanded={isOpen}
                aria-controls={`period-panel-${i}`}
                onClick={() => setOpenIdx(isOpen ? null : i)}
                className="active:bg-secondary/40 flex w-full items-center gap-3 rounded-lg px-4 py-3 text-left"
              >
                <span
                  className={cn(
                    "size-2.5 shrink-0 rounded-sm",
                    CG_BAR[colorIdx % CG_BAR.length],
                  )}
                />
                <span className="min-w-0 flex-1">
                  <span className="flex flex-wrap items-baseline gap-x-2 gap-y-1 text-sm font-semibold">
                    {p.caregiver} är hemma
                    {p.phase && (
                      <span className="text-muted-foreground bg-secondary rounded-full px-2 py-0.5 text-xs font-medium">
                        {p.phase}
                      </span>
                    )}
                  </span>
                  <span className="text-muted-foreground mt-0.5 block text-xs tabular-nums">
                    {formatDate(p.startsAt)} – {formatDate(p.endsAt)} · {months}
                  </span>
                </span>
                <IconChevronDown
                  className={cn(
                    "text-muted-foreground size-4 shrink-0 transition-transform duration-300",
                    isOpen && "rotate-180",
                  )}
                />
              </button>

              {/* Animated height: 0fr ↔ 1fr. The content stays mounted, and
                  `inert` keeps a shut panel out of focus order. */}
              <div
                id={`period-panel-${i}`}
                inert={!isOpen}
                className="grid transition-[grid-template-rows] duration-300 ease-out motion-reduce:transition-none"
                style={{ gridTemplateRows: isOpen ? "1fr" : "0fr" }}
              >
                <div className="overflow-hidden">
                  <div className="px-4 pt-1 pb-4">
                    {/* Editable span — edits become goals ("custom" planning). */}
                    <div className="grid grid-cols-2 gap-3">
                      <div className="space-y-1">
                        <Label htmlFor={`period-start-${i}`} className="text-xs">
                          Från
                        </Label>
                        <Input
                          id={`period-start-${i}`}
                          type="date"
                          value={toIsoDate(p.startsAt)}
                          // A later block starts where the previous one ended
                          // — only the start of the whole stretch can move.
                          disabled={!p.firstOfCaregiver}
                          onChange={(e) =>
                            id &&
                            e.target.value &&
                            editing.onStartDate(id, e.target.value)
                          }
                        />
                      </div>
                      <div className="space-y-1">
                        <Label htmlFor={`period-end-${i}`} className="text-xs">
                          Till
                        </Label>
                        <Input
                          id={`period-end-${i}`}
                          type="date"
                          value={toIsoDate(p.endsAt)}
                          disabled={!p.lastOfCaregiver}
                          onChange={(e) =>
                            id &&
                            e.target.value &&
                            editing.onEndDate(id, e.target.value)
                          }
                        />
                      </div>
                    </div>
                    <div className="mt-1.5 flex flex-wrap gap-x-3 gap-y-1">
                      {mode === "untilDate" && id && p.lastOfCaregiver && (
                        <button
                          type="button"
                          onClick={() => editing.onClearEnd(id)}
                          className="text-muted-foreground hover:text-foreground active:text-foreground inline-flex min-h-10 items-center text-xs underline underline-offset-2 sm:min-h-0"
                        >
                          Släpp slutdatumet (automatisk längd)
                        </button>
                      )}
                      {id &&
                        p.firstOfCaregiver &&
                        editing.hasStartOverride[id] && (
                          <button
                            type="button"
                            onClick={() => editing.onStartDate(id, null)}
                            className="text-muted-foreground hover:text-foreground active:text-foreground inline-flex min-h-10 items-center text-xs underline underline-offset-2 sm:min-h-0"
                          >
                            Återställ startdatumet
                          </button>
                        )}
                    </div>

                    {gapBefore > 3 && (
                      <p className="text-muted-foreground mt-2 text-xs">
                        Glapp före perioden: ≈ {Math.round(gapBefore)} dagar
                        {prev ? " då båda jobbar" : " efter födseln"} — dagarna
                        väntar.
                      </p>
                    )}

                    {/* The economy of this period. */}
                    {row && (
                      <div className="mt-3">
                        <PeriodCard row={row} colorIdx={colorIdx} />
                      </div>
                    )}
                  </div>
                </div>
              </div>
            </div>
          );
        })}
      </div>

      <p className="text-muted-foreground text-xs">
        Ledigheten slutar {formatDate(periods[periods.length - 1].endsAt)} ·
        inkomstdagar tas ut före {formatDate(deadlines.sjukpenningDeadline)} ·
        alla dagar förfaller {formatDate(deadlines.expiry)}.
      </p>
    </section>
  );
}
