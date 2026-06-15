"use client";

import { IconCheck, IconPencil, IconRefresh, IconShare2 } from "@tabler/icons-react";

import { Button } from "@/components/ui/button";
import { RemainingTiers } from "@/components/remaining-tiers";
import { SplitSuggestion } from "@/components/split-suggestion";
import { SoloSummary } from "@/components/solo-summary";
import type { PhaseControls, PartTime } from "@/components/leave-levers";
import type { MonthlyRow } from "@/components/monthly-estimate";
import { VabResultCard } from "@/components/vab-result-card";
import { BirthDaysCard } from "@/components/birth-days-card";
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
import type { BirthDaysResult } from "@/lib/birth-days";

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
  splitA,
  onSplitChange,
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
  monthlyRows,
  projection,
  vabResult,
  birthDays,
  birthDaysName,
  savedLagstaDays,
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
  splitA: number;
  onSplitChange: (splitA: number) => void;
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
  monthlyRows: MonthlyRow[];
  projection?: LeaveProjection;
  vabResult: VabResult | null;
  birthDays?: BirthDaysResult;
  birthDaysName: string;
  savedLagstaDays: number;
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
            <IconPencil /> Ändra uppgifter
          </Button>
          <Button type="button" variant="outline" size="sm" onClick={onShare}>
            {copied ? <IconCheck /> : <IconShare2 />}
            {copied ? "Kopierad!" : "Dela"}
          </Button>
          <Button type="button" variant="ghost" size="sm" onClick={onReset}>
            <IconRefresh /> Börja om
          </Button>
        </div>
      </div>

      <WarningsList warnings={warnings.filter((w) => w.level !== "info")} />

      {/* The adjust controls stay pinned above the timeline (and release once
          the timeline scrolls past), so you can drag and watch it shift. */}
      <div>
        {soloMode && solo ? (
          <SoloSummary
            payout={solo.payout}
            total={solo.allocatedTotal}
            name={soloName}
            daysPerWeek={paceA}
            onSetTarget={onSetTargetA}
            phase={phaseA}
            bonusFullMonthly={bonusFullA}
            salary={salaryA}
            partTime={partTimeA}
          />
        ) : twoParent ? (
          <SplitSuggestion
            result={twoParent}
            objective={objective}
            plan={plan}
            splitA={splitA}
            onSplitChange={onSplitChange}
            paceA={paceA}
            paceB={paceB}
            onSetTargetA={onSetTargetA}
            onSetTargetB={onSetTargetB}
            phaseA={phaseA}
            phaseB={phaseB}
            bonusFullA={bonusFullA}
            bonusFullB={bonusFullB}
            householdBaseA={householdBaseA}
            householdBaseB={householdBaseB}
            salaryA={salaryA}
            salaryB={salaryB}
            partTimeA={partTimeA}
            partTimeB={partTimeB}
          />
        ) : null}

        {/* The timeline is the centrepiece: who's home when, what the household
            lives on each period, and the legal age gates. */}
        <Timeline
          deadlines={deadlines}
          asOf={asOf}
          projection={projection ?? undefined}
          rows={monthlyRows}
        />
      </div>

      <RemainingTiers remaining={remaining} savedLagstaDays={savedLagstaDays} />

      {vabResult && <VabResultCard result={vabResult} />}

      {birthDays && birthDays.days > 0 && (
        <BirthDaysCard result={birthDays} caregiverName={birthDaysName} />
      )}
    </div>
  );
}
