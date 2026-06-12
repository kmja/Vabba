import {
  Card,
  CardContent,
  CardDescription,
  CardHeader,
  CardTitle,
} from "@/components/ui/card";
import { Label } from "@/components/ui/label";
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
}: {
  result: OptimizeResult;
  objective: Objective;
  plan: PlanInput;
  /** Current A-share (0–1) shown by the live results slider. */
  splitA?: number;
  /** Live split handler; when set, a draggable split slider is shown. */
  onSplitChange?: (splitA: number) => void;
}) {
  const rec = result.recommended;
  const aDays = rec.allocatedTotals.A;
  const bDays = rec.allocatedTotals.B;
  const pctA = Math.round((splitA ?? 0.5) * 100);

  const maxAlt = result.alternatives.find((a) => a.objective === "maxPayout");
  const diffVsMax = maxAlt ? rec.payout.total - maxAlt.payout.total : 0;

  return (
    <Card>
      <CardHeader>
        <CardTitle>Fördelning av dagarna</CardTitle>
        <CardDescription>{OBJECTIVE_DESCRIPTION[objective]}</CardDescription>
      </CardHeader>
      <CardContent className="space-y-4">
        {/* Live split slider — drag to explore the trade-off. */}
        {onSplitChange && splitA !== undefined && (
          <div className="space-y-2">
            <div className="flex items-center justify-between">
              <Label htmlFor="results-split">Justera fördelningen</Label>
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
            <div className="flex justify-between text-sm font-medium tabular-nums">
              <span>
                {parentName(plan, "A")} · {formatDays(aDays)} ({pctA}%)
              </span>
              <span>
                {parentName(plan, "B")} · {formatDays(bDays)} ({100 - pctA}%)
              </span>
            </div>
          </div>
        )}

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
            <div className="mt-1 text-xs">
              <span className="text-foreground font-semibold">
                −{formatSek(Math.abs(diffVsMax))}
              </span>{" "}
              <span className="text-muted-foreground">
                jämfört med maximal ersättning
              </span>
            </div>
          )}
          {diffVsMax === 0 && (
            <div className="mt-1 text-xs font-medium text-emerald-600 dark:text-emerald-400">
              Maximal ersättning
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
