"use client";

import { Check, Pencil, RotateCcw, Share2 } from "lucide-react";

import { Button } from "@/components/ui/button";
import { RemainingTiers } from "@/components/remaining-tiers";
import { SplitSuggestion } from "@/components/split-suggestion";
import { SoloSummary } from "@/components/solo-summary";
import { MonthlyEstimate, type MonthlyRow } from "@/components/monthly-estimate";
import { VabResultCard } from "@/components/vab-result-card";
import { WarningsList } from "@/components/warnings-list";
import { Timeline, type LeaveProjection } from "@/components/timeline";
import type { PlanDeadlines, PlanInput, RemainingSummary } from "@/lib/calc";
import type {
  Objective,
  OptimizeResult,
  PlanWarning,
  SoloResult,
} from "@/lib/optimizer";
import type { VabResult } from "@/lib/vab";

export function Results({
  soloMode,
  objective,
  plan,
  soloName,
  twoParent,
  solo,
  remaining,
  deadlines,
  asOf,
  paceA,
  paceB,
  monthlyRows,
  projection,
  vabResult,
  warnings,
  onEdit,
  onReset,
  onShare,
  copied,
}: {
  soloMode: boolean;
  objective: Objective;
  plan: PlanInput;
  soloName: string;
  twoParent: OptimizeResult | null;
  solo: SoloResult | null;
  remaining: RemainingSummary;
  deadlines: PlanDeadlines;
  asOf: Date;
  paceA: number;
  paceB: number;
  monthlyRows: MonthlyRow[];
  projection?: LeaveProjection;
  vabResult: VabResult | null;
  warnings: PlanWarning[];
  onEdit: () => void;
  onReset: () => void;
  onShare: () => void;
  copied: boolean;
}) {
  return (
    <div className="space-y-6">
      <div className="flex flex-wrap items-center justify-between gap-2">
        <h2 className="text-lg font-semibold">Er plan</h2>
        <div className="flex gap-2">
          <Button type="button" size="sm" onClick={onEdit}>
            <Pencil /> Ändra uppgifter
          </Button>
          <Button type="button" variant="outline" size="sm" onClick={onShare}>
            {copied ? <Check /> : <Share2 />}
            {copied ? "Kopierad!" : "Dela"}
          </Button>
          <Button type="button" variant="ghost" size="sm" onClick={onReset}>
            <RotateCcw /> Börja om
          </Button>
        </div>
      </div>

      <MonthlyEstimate rows={monthlyRows} />

      {soloMode && solo ? (
        <SoloSummary
          payout={solo.payout}
          total={solo.allocatedTotal}
          name={soloName}
          daysPerWeek={paceA}
        />
      ) : twoParent ? (
        <SplitSuggestion
          result={twoParent}
          objective={objective}
          plan={plan}
          paceA={paceA}
          paceB={paceB}
        />
      ) : null}

      <RemainingTiers remaining={remaining} />

      {vabResult && <VabResultCard result={vabResult} />}

      <WarningsList warnings={warnings} />

      <Timeline
        deadlines={deadlines}
        asOf={asOf}
        projection={projection ?? undefined}
      />
    </div>
  );
}
