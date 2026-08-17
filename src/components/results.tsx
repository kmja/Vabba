"use client";

import { IconCheck, IconPencil, IconRefresh, IconShare2 } from "@tabler/icons-react";

import { Button } from "@/components/ui/button";
import { SplitSuggestion } from "@/components/split-suggestion";
import { SoloSummary } from "@/components/solo-summary";
import type { PhaseControls, PartTime } from "@/components/leave-levers";
import { PeriodPager, type PeriodEditing } from "@/components/period-pager";
import type { MonthlyRow } from "@/components/monthly-estimate";
import { VabResultCard } from "@/components/vab-result-card";
import { BirthDaysCard } from "@/components/birth-days-card";
import { WarningsList } from "@/components/warnings-list";
import type { LeaveProjection } from "@/components/timeline";
import type { PlanDeadlines, PlanInput } from "@/lib/calc";
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
  deadlines,
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
  goalSummary,
  goalTextA,
  goalTextB,
  periodEdit,
  monthlyRows,
  projection,
  vabResult,
  birthDays,
  birthDaysName,
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
  deadlines: PlanDeadlines;
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
  /** One-line result of the solved plan (end date, saved days, lowest net). */
  goalSummary: string | null;
  /** Per-caregiver goal description; null = manual (the sliders apply). */
  goalTextA: string | null;
  goalTextB: string | null;
  periodEdit: PeriodEditing;
  monthlyRows: MonthlyRow[];
  projection?: LeaveProjection;
  vabResult: VabResult | null;
  birthDays?: BirthDaysResult;
  birthDaysName: string;
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
            goalSummary={goalSummary}
            goalText={goalTextA}
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
            goalSummary={goalSummary}
            goalTextA={goalTextA}
            goalTextB={goalTextB}
          />
        ) : null}

        {/* The centrepiece: each stretch of leave as a block to flip through,
            with directly editable dates. */}
        <PeriodPager
          projection={projection ?? undefined}
          rows={monthlyRows}
          deadlines={deadlines}
          editing={periodEdit}
        />
      </div>

      {vabResult && <VabResultCard result={vabResult} />}

      {birthDays && birthDays.days > 0 && (
        <BirthDaysCard result={birthDays} caregiverName={birthDaysName} />
      )}
    </div>
  );
}
