import { Card, CardContent } from "@/components/ui/card";
import {
  LeaveLevers,
  type PhaseControls,
  type PartTime,
} from "@/components/leave-levers";
import {
  OBJECTIVE_DESCRIPTION,
  type Objective,
  type OptimizeResult,
} from "@/lib/optimizer";
import { netAfterTax } from "@/lib/rules";
import type { ParentId, PlanInput } from "@/lib/calc";
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
  paceA,
  paceB,
  onSetTargetA,
  onSetTargetB,
  phaseA,
  phaseB,
  bonusFullA,
  bonusFullB,
  householdBaseA,
  householdBaseB,
  salaryA,
  salaryB,
  partTimeA,
  partTimeB,
}: {
  result: OptimizeResult;
  objective: Objective;
  plan: PlanInput;
  /** Current A-share (0–1) shown by the live results slider. */
  splitA?: number;
  /** Live split handler; when set, a draggable split slider is shown. */
  onSplitChange?: (splitA: number) => void;
  paceA: number;
  paceB: number;
  onSetTargetA: (minMonthly: number) => void;
  onSetTargetB: (minMonthly: number) => void;
  phaseA: PhaseControls;
  phaseB: PhaseControls;
  bonusFullA: number;
  bonusFullB: number;
  householdBaseA: number;
  householdBaseB: number;
  salaryA: number;
  salaryB: number;
  partTimeA: PartTime;
  partTimeB: PartTime;
}) {
  const rec = result.recommended;
  const aDays = rec.allocatedTotals.A;
  const bDays = rec.allocatedTotals.B;
  const pctA = Math.round((splitA ?? 0.5) * 100);

  const maxAlt = result.alternatives.find((a) => a.objective === "maxPayout");
  const diffVsMax = maxAlt ? rec.payout.total - maxAlt.payout.total : 0;

  return (
    <Card>
      {/* Minimal sticky controls: the caregiver split slider stays pinned
          while the detail below scrolls. */}
      <div className="bg-card sticky top-0 z-30 space-y-2 border-b px-6 pt-2 pb-3">
        <div className="flex items-center justify-between gap-2">
          <span className="font-semibold">Justera planen</span>
          {onSplitChange && splitA !== undefined && (
            <span className="text-muted-foreground text-xs">
              dra för att testa olika upplägg
            </span>
          )}
        </div>
        {onSplitChange && splitA !== undefined && (
          <div className="space-y-1">
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
      </div>
      <CardContent className="space-y-4">
        <p className="text-muted-foreground text-sm">
          {OBJECTIVE_DESCRIPTION[objective]}
        </p>

        {/* Per-person pay ↔ duration levers */}
        <div className="space-y-3">
          <div className="text-muted-foreground text-xs">
            Finjustera takten per vårdnadshavare:
          </div>
          <LeaveLevers
            name={parentName(plan, "A")}
            days={aDays}
            dailyRate={rec.payout.A.dailyRate}
            pace={paceA}
            bonusFullMonthly={bonusFullA}
            salary={salaryA}
            partnerSalary={householdBaseA}
            partTime={partTimeA}
            onSetTarget={onSetTargetA}
            phase={phaseA}
          />
          <LeaveLevers
            name={parentName(plan, "B")}
            days={bDays}
            dailyRate={rec.payout.B.dailyRate}
            pace={paceB}
            bonusFullMonthly={bonusFullB}
            salary={salaryB}
            partnerSalary={householdBaseB}
            partTime={partTimeB}
            onSetTarget={onSetTargetB}
            phase={phaseB}
          />
        </div>

        {/* Total payout */}
        <div className="bg-secondary/40 rounded-lg border p-4 text-center">
          <div className="text-muted-foreground text-sm">
            Total ersättning (föräldrapenning)
          </div>
          <div className="text-3xl font-bold tracking-tight tabular-nums">
            {formatSek(rec.payout.total)}
          </div>
          <div className="text-muted-foreground text-xs">
            ≈ {formatSek(netAfterTax(rec.payout.total))} efter skatt
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
      </CardContent>
    </Card>
  );
}
