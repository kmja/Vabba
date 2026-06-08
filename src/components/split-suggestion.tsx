import { Hourglass, Scale, SlidersHorizontal, TrendingUp } from "lucide-react";

import {
  Card,
  CardContent,
  CardDescription,
  CardHeader,
  CardTitle,
} from "@/components/ui/card";
import { Badge } from "@/components/ui/badge";
import { Separator } from "@/components/ui/separator";
import { cn } from "@/lib/utils";
import {
  OBJECTIVE_DESCRIPTION,
  OBJECTIVE_LABEL,
  OBJECTIVES,
  type Objective,
  type OptimizeResult,
  type ParentPayout,
} from "@/lib/optimizer";
import { TIER_LABEL, netAfterTax } from "@/lib/rules";
import type { ParentId, PlanInput } from "@/lib/calc";
import {
  approxLeaveMonths,
  approxLeaveWeeks,
  formatDays,
  formatNumber,
  formatPace,
  formatSek,
} from "@/lib/format";

const OBJECTIVE_ICON: Record<Objective, typeof TrendingUp> = {
  maxPayout: TrendingUp,
  equal: Scale,
  minMonthly: Hourglass,
  custom: SlidersHorizontal,
};

function parentName(plan: PlanInput, id: ParentId): string {
  return plan.parents[id].name?.trim() || `Vårdnadshavare ${id}`;
}

function ParentColumn({
  name,
  payout,
  total,
  daysPerWeek,
}: {
  name: string;
  payout: ParentPayout;
  total: number;
  daysPerWeek: number;
}) {
  return (
    <div className="flex-1 space-y-3 rounded-lg border p-4">
      <div className="flex items-center justify-between gap-2">
        <span className="font-medium">{name}</span>
        <Badge variant="secondary">
          {approxLeaveMonths(total, daysPerWeek)}
        </Badge>
      </div>
      <div>
        <div className="text-2xl font-semibold tabular-nums">
          {formatDays(total)}
        </div>
        <div className="text-muted-foreground text-sm">
          {formatNumber(payout.sjukpenningDays)}{" "}
          {TIER_LABEL.sjukpenning.toLowerCase()} ·{" "}
          {formatNumber(payout.lagstaDays)} {TIER_LABEL.lagsta.toLowerCase()}
        </div>
        {daysPerWeek !== 7 && total > 0 && (
          <div className="text-muted-foreground text-xs">
            ≈ {approxLeaveWeeks(total, daysPerWeek)} veckor vid{" "}
            {formatPace(daysPerWeek)} dagar/vecka
          </div>
        )}
      </div>
      <Separator />
      <div className="flex items-baseline justify-between">
        <span className="text-muted-foreground text-sm">
          Uppskattad ersättning
        </span>
        <span className="font-semibold tabular-nums">
          {formatSek(payout.amount)}
        </span>
      </div>
      <p className="text-muted-foreground text-xs">
        {formatSek(payout.dailyRate)}/dag på sjukpenningnivå
      </p>
    </div>
  );
}

export function SplitSuggestion({
  result,
  objective,
  onObjectiveChange,
  plan,
  paceA,
  paceB,
}: {
  result: OptimizeResult;
  objective: Objective;
  /** When omitted, the objective toggle is hidden (e.g. on the results page). */
  onObjectiveChange?: (o: Objective) => void;
  plan: PlanInput;
  paceA: number;
  paceB: number;
}) {
  const rec = result.recommended;
  const alt = result.alternatives[0];
  const diff = alt ? rec.payout.total - alt.payout.total : 0;

  return (
    <Card>
      <CardHeader>
        <CardTitle>Förslag på fördelning</CardTitle>
        <CardDescription>{OBJECTIVE_DESCRIPTION[objective]}</CardDescription>
      </CardHeader>
      <CardContent className="space-y-5">
        {/* Objective toggle (hidden on the results page) */}
        {onObjectiveChange && (
          <div
            role="tablist"
            aria-label="Mål för fördelningen"
            className="bg-muted inline-flex w-full rounded-lg p-1 sm:w-auto"
          >
            {OBJECTIVES.map((o) => {
              const Icon = OBJECTIVE_ICON[o];
              const active = o === objective;
              return (
                <button
                  key={o}
                  role="tab"
                  aria-selected={active}
                  onClick={() => onObjectiveChange?.(o)}
                  className={cn(
                    "inline-flex flex-1 items-center justify-center gap-1.5 rounded-md px-3 py-1.5 text-sm font-medium transition-colors sm:flex-none",
                    active
                      ? "bg-background text-foreground shadow-sm"
                      : "text-muted-foreground hover:text-foreground",
                  )}
                >
                  <Icon className="size-4" />
                  {OBJECTIVE_LABEL[o]}
                </button>
              );
            })}
          </div>
        )}

        {/* Total payout headline */}
        <div className="bg-secondary/40 rounded-lg border p-4 text-center">
          <div className="text-muted-foreground text-sm">
            Total uppskattad ersättning
          </div>
          <div className="text-3xl font-bold tracking-tight tabular-nums">
            {formatSek(rec.payout.total)}
          </div>
          <div className="text-muted-foreground text-xs">
            ≈ {formatSek(netAfterTax(rec.payout.total))} efter skatt
          </div>
          {alt && diff !== 0 && (
            <div className="text-muted-foreground mt-1 text-xs">
              {diff > 0
                ? `${formatSek(Math.abs(diff))} mer än "${OBJECTIVE_LABEL[alt.objective]}"`
                : `${formatSek(Math.abs(diff))} mindre än "${OBJECTIVE_LABEL[alt.objective]}"`}
            </div>
          )}
        </div>

        {/* Per-parent breakdown */}
        <div className="flex flex-col gap-3 sm:flex-row">
          <ParentColumn
            name={parentName(plan, "A")}
            payout={rec.payout.A}
            total={rec.allocatedTotals.A}
            daysPerWeek={paceA}
          />
          <ParentColumn
            name={parentName(plan, "B")}
            payout={rec.payout.B}
            total={rec.allocatedTotals.B}
            daysPerWeek={paceB}
          />
        </div>

        {rec.doubleDays > 0 && (
          <p className="text-foreground text-xs">
            Inkluderar {rec.doubleDays} dubbeldagar då ni är lediga samtidigt —
            det motsvarar {rec.doubleDays * 2} dagar ur den gemensamma potten.
          </p>
        )}
        <p className="text-muted-foreground text-xs">
          Förslaget fördelar alla återstående dagar — ni kan förstås ta ut färre.
          Ersättningen är en uppskattning före skatt. Eventuell föräldralön från
          arbetsgivaren ingår inte.
        </p>
      </CardContent>
    </Card>
  );
}
