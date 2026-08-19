"use client";

import { IconCheck, IconPencil, IconRefresh, IconShare2 } from "@tabler/icons-react";

import { Button } from "@/components/ui/button";
import { CaregiverSummary } from "@/components/caregiver-summary";
import { SplitSuggestion } from "@/components/split-suggestion";
import { SoloSummary } from "@/components/solo-summary";
import type {
  PeriodControls,
  PhaseControls,
  PartTime,
} from "@/components/leave-levers";
import { PeriodPager, type PeriodEditing } from "@/components/period-pager";
import type { MonthlyRow } from "@/components/monthly-estimate";
import { VabResultCard } from "@/components/vab-result-card";
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
  firstCaregiver,
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
  /** Which caregiver is home first — decides the order of the sections. */
  firstCaregiver: "A" | "B";
  warnings: PlanWarning[];
  /** Back to the wizard, optionally straight to a caregiver's own step. */
  onEdit: (step?: number) => void;
  onReset: () => void;
  onShare: () => void;
  copied: boolean;
}) {
  // The dials each period block drives, keyed by caregiver.
  const rowFor = (id: "A" | "B") => {
    const name =
      plan.parents[id].name?.trim() ||
      (soloMode ? soloName : `Vårdnadshavare ${id}`);
    return { name, row: monthlyRows.find((r) => r.name === name) };
  };
  const levers: Partial<Record<"A" | "B", PeriodControls>> = {};
  for (const id of soloMode ? (["A"] as const) : (["A", "B"] as const)) {
    const { name, row } = rowFor(id);
    if (!row) continue;
    const isA = id === "A";
    levers[id] = {
      name,
      days: row.days,
      dailyRate: row.dailyRate,
      pace: isA ? paceA : paceB,
      bonusFullMonthly: isA ? bonusFullA : bonusFullB,
      salary: isA ? salaryA : salaryB,
      partnerSalary: isA ? householdBaseA : householdBaseB,
      partTime: isA ? partTimeA : partTimeB,
      phase: isA ? phaseA : phaseB,
      onSetTarget: isA ? onSetTargetA : onSetTargetB,
    };
  }

  return (
    <div className="space-y-6">
      <div className="flex flex-wrap items-center justify-between gap-2">
        <h2 className="text-lg font-semibold">Er plan</h2>
        <div className="flex gap-2">
          <Button type="button" size="sm" onClick={() => onEdit(1)}>
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

      {/* Who is in this plan: a portrait, what they bring and what they are
          aiming for, with a way straight back to their own step. */}
      <div className="space-y-2">
        {(soloMode
          ? (["A"] as const)
          : firstCaregiver === "B"
            ? (["B", "A"] as const)
            : (["A", "B"] as const)
        ).map((id, i) => {
          const name =
            plan.parents[id].name?.trim() ||
            (soloMode ? soloName : `Vårdnadshavare ${id}`);
          return (
            <CaregiverSummary
              key={id}
              name={name}
              salary={id === "A" ? salaryA : salaryB}
              row={monthlyRows.find((r) => r.name === name)}
              goalText={id === "A" ? goalTextA : goalTextB}
              second={id !== "A"}
              holding={i === 0}
              babyCount={plan.childrenInBirth}
              // Step 2 is whoever is home first, step 3 the other one.
              onEdit={() => onEdit(i === 0 ? 2 : 3)}
            />
          );
        })}
      </div>

      {/* The adjust controls stay pinned above the timeline (and release once
          the timeline scrolls past), so you can drag and watch it shift. */}
      <div>
        {soloMode && solo ? (
          <SoloSummary
            payout={solo.payout}
            total={solo.allocatedTotal}
            name={soloName}
            daysPerWeek={paceA}
            goalSummary={goalSummary}
          />
        ) : twoParent ? (
          <SplitSuggestion
            result={twoParent}
            objective={objective}
            plan={plan}
            splitA={splitA}
            onSplitChange={onSplitChange}
            goalSummary={goalSummary}
          />
        ) : null}

        {/* The centrepiece: each stretch of leave as a block to flip through,
            with directly editable dates. */}
        <PeriodPager
          projection={projection ?? undefined}
          rows={monthlyRows}
          deadlines={deadlines}
          editing={periodEdit}
          levers={levers}
          birthDays={
            birthDays && birthDays.days > 0
              ? { result: birthDays, name: birthDaysName }
              : undefined
          }
        />
      </div>

      {vabResult && <VabResultCard result={vabResult} />}
    </div>
  );
}
