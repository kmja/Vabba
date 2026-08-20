import { useState } from "react";
import { IconChevronDown } from "@tabler/icons-react";

import {
  OBJECTIVE_DESCRIPTION,
  type Objective,
  type OptimizeResult,
} from "@/lib/optimizer";
import { monthlyNet } from "@/lib/tax";
import { approxMonthlyGross } from "@/lib/format";
import type { ParentId, PlanInput } from "@/lib/calc";
import { cn } from "@/lib/utils";
import { formatDays, formatSek } from "@/lib/format";

function parentName(plan: PlanInput, id: ParentId): string {
  return plan.parents[id].name?.trim() || `Vårdnadshavare ${id}`;
}

export function SplitSuggestion({
  result,
  objective,
  plan,
  splitA,
  onSplitChange,
  goalSummary,
}: {
  result: OptimizeResult;
  objective: Objective;
  plan: PlanInput;
  /** Current A-share (0–1) shown by the live results slider. */
  splitA?: number;
  /** Live split handler; when set, a draggable split slider is shown. */
  onSplitChange?: (splitA: number) => void;
  /** One-line result of the solved plan, shown when any goal is active. */
  goalSummary: string | null;
}) {
  const [open, setOpen] = useState(false);
  const rec = result.recommended;
  const aDays = rec.allocatedTotals.A;
  const bDays = rec.allocatedTotals.B;
  const pctA = Math.round((splitA ?? 0.5) * 100);

  // Each caregiver's föräldrapenning taxed as their own income, at the rate
  // their monthly benefit puts them in — not the household total at one rate.
  const netOfPayout = (amount: number, dailyRate: number) => {
    const monthly = approxMonthlyGross(dailyRate, 7);
    if (monthly <= 0) return 0;
    return amount * (monthlyNet({ benefit: monthly }) / monthly);
  };
  const netTotal = Math.round(
    netOfPayout(rec.payout.A.amount, rec.payout.A.dailyRate) +
      netOfPayout(rec.payout.B.amount, rec.payout.B.dailyRate),
  );

  const maxAlt = result.alternatives.find((a) => a.objective === "maxPayout");
  const diffVsMax = maxAlt ? rec.payout.total - maxAlt.payout.total : 0;

  return (
    <section
      className={cn(
        "bg-card text-card-foreground ml-[calc(50%_-_50vw)] w-screen space-y-3 border-b py-3",
        !open && "sticky top-0 z-30",
      )}
    >
      <div className="space-y-3 px-4 sm:px-6">
        <div className="flex items-center justify-between gap-2">
          <span className="font-semibold">Justera planen</span>
          <button
            type="button"
            onClick={() => setOpen((o) => !o)}
            aria-expanded={open}
            className="text-muted-foreground hover:text-foreground flex items-center gap-1 text-xs"
          >
            {open ? "Färre inställningar" : "Fler inställningar"}
            <IconChevronDown
              className={cn("size-4 transition-transform", open && "rotate-180")}
            />
          </button>
        </div>

        {/* Collapsed: the one line that describes the whole solved plan. The
            per-caregiver dials live on their own period blocks below. */}
        {!open && goalSummary && (
          <p className="text-muted-foreground text-xs tabular-nums">
            {goalSummary}
          </p>
        )}
      </div>

      {open && (
        <div className="space-y-4 px-4 sm:px-6">
          {/* Day split between the caregivers */}
          {onSplitChange && splitA !== undefined && (
            <div className="space-y-1">
              <div className="flex items-center justify-between">
                <span className="text-sm font-medium">Fördelning av dagarna</span>
                <span className="text-muted-foreground text-xs">
                  dra för att testa olika upplägg
                </span>
              </div>
              <input
                id="results-split"
                type="range"
                min={0}
                max={100}
                value={pctA}
                onChange={(e) => onSplitChange(Number(e.target.value) / 100)}
                className="accent-primary w-full"
              />
              <div className="flex justify-between text-xs font-medium tabular-nums">
                <span>
                  {parentName(plan, "A")} · {formatDays(aDays)} ({pctA}%)
                </span>
                <span>
                  {parentName(plan, "B")} · {formatDays(bDays)} ({100 - pctA}%)
                </span>
              </div>
            </div>
          )}

          <p className="text-muted-foreground text-sm">
            {OBJECTIVE_DESCRIPTION[objective]}
          </p>

          <p className="text-muted-foreground text-xs">
            Takt, deltid och längd finjusteras på varje period nedan.
          </p>

          {/* Total payout */}
          <div className="bg-secondary/40 rounded-lg border p-4 text-center">
            <div className="text-muted-foreground text-sm">
              Total ersättning (föräldrapenning)
            </div>
            <div className="text-3xl font-bold tracking-tight tabular-nums">
              {formatSek(rec.payout.total)}
            </div>
            <div className="text-muted-foreground text-xs">
              ≈ {formatSek(netTotal)} efter skatt
            </div>
            {diffVsMax !== 0 && (
              <div className="text-muted-foreground mt-1 text-xs">
                <span className="text-foreground font-semibold">
                  −{formatSek(Math.abs(diffVsMax))}
                </span>{" "}
                i föräldrapenning mot max — men hushållet behåller mer lön (se
                ovan)
              </div>
            )}
            {diffVsMax === 0 && (
              <div className="mt-1 text-xs font-medium text-emerald-600 dark:text-emerald-400">
                Maximal föräldrapenning
              </div>
            )}
          </div>

          {rec.doubleDays > 0 && (
            <p className="text-foreground text-xs">
              Inkluderar {rec.doubleDays} dubbeldagar då ni är lediga samtidigt —
              det motsvarar {rec.doubleDays * 2} dagar ur den gemensamma potten.
            </p>
          )}
          <p className="text-muted-foreground text-xs">
            De reserverade dagarna (90 per vårdnadshavare) behålls alltid.
            Beloppet är före skatt; eventuell föräldralön visas separat ovan.
          </p>
        </div>
      )}
    </section>
  );
}
