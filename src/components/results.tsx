"use client";

import {
  IconCheck,
  IconDeviceFloppy,
  IconPencil,
  IconRefresh,
  IconShare2,
} from "@tabler/icons-react";

import { Button } from "@/components/ui/button";
import { FamilySummary } from "@/components/family-summary";
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
import type { PlanSolve } from "@/lib/goal-seek";
import type { PlanDeadlines, PlanInput } from "@/lib/calc";
import type { PlanWarning } from "@/lib/optimizer";
import type { VabResult } from "@/lib/vab";
import type { BirthDaysResult } from "@/lib/birth-days";

export function Results({
  soloMode,
  plan,
  soloName,
  deadlines,
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
  goalTextA,
  goalTextB,
  periodEdit,
  monthlyRows,
  projection,
  vabResult,
  birthDays,
  birthDaysName,
  doubleDaysWindow,
  firstCaregiver,
  municipalRate,
  oneYear,
  sgiLiftedNames,
  warnings,
  onEdit,
  onQuickEdit,
  onReset,
  onShare,
  copied,
  onSave,
  saved,
}: {
  soloMode: boolean;
  plan: PlanInput;
  soloName: string;
  deadlines: PlanDeadlines;
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
  /** Per-caregiver goal description; null = manual (the sliders apply). */
  goalTextA: string | null;
  goalTextB: string | null;
  periodEdit: PeriodEditing;
  monthlyRows: MonthlyRow[];
  projection?: LeaveProjection;
  vabResult: VabResult | null;
  birthDays?: BirthDaysResult;
  birthDaysName: string;
  /** Dubbeldagar: the second caregiver's overlap with the first, if any. */
  doubleDaysWindow?: PlanSolve["doubleDaysWindow"];
  /** Which caregiver is home first — decides the order of the sections. */
  firstCaregiver: "A" | "B";
  /** The household's kommunalskatt, as a fraction — every net uses it. */
  municipalRate: number;
  /** The child's first birthday — where the SGI pace floor starts to bite. */
  oneYear?: Date;
  /** Caregivers whose pace that floor raised. */
  sgiLiftedNames: Set<string>;
  warnings: PlanWarning[];
  /** Back to the wizard, optionally straight to a caregiver's own step. */
  onEdit: (step?: number) => void;
  /** Opens that caregiver's quick-edit dialog. */
  onQuickEdit: (id: "A" | "B") => void;
  onReset: () => void;
  onShare: () => void;
  copied: boolean;
  /** Save (or update) this plan in the saved-plans list. */
  onSave: () => void;
  saved: boolean;
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
        <div className="flex flex-wrap gap-2">
          <Button type="button" size="sm" onClick={() => onEdit(1)}>
            <IconPencil /> Ändra uppgifter
          </Button>
          <Button type="button" variant="outline" size="sm" onClick={onSave}>
            {saved ? <IconCheck /> : <IconDeviceFloppy />}
            {saved ? "Sparad!" : "Spara"}
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

      {/* Who is in this plan: both portraits grouped together as the family,
          each caregiver's own summary and edit button flanking them. */}
      {(() => {
        const order = soloMode
          ? (["A"] as const)
          : firstCaregiver === "B"
            ? (["B", "A"] as const)
            : (["A", "B"] as const);
        const infoFor = (id: "A" | "B") => {
          const name =
            plan.parents[id].name?.trim() ||
            (soloMode ? soloName : `Vårdnadshavare ${id}`);
          return {
            name,
            salary: id === "A" ? salaryA : salaryB,
            row: monthlyRows.find((r) => r.name === name),
            goalText: id === "A" ? goalTextA : goalTextB,
            onEdit: () => onQuickEdit(id),
          };
        };
        const second: "A" | "B" | undefined = order[1];
        return (
          <FamilySummary
            first={infoFor(order[0])}
            second={second ? infoFor(second) : null}
          />
        );
      })()}

      {/* The centrepiece: each stretch of leave as a block to flip through,
          with directly editable dates. */}
      <PeriodPager
        projection={projection ?? undefined}
        rows={monthlyRows}
        deadlines={deadlines}
        editing={periodEdit}
        levers={levers}
        municipalRate={municipalRate}
        oneYear={oneYear}
        sgiLiftedNames={sgiLiftedNames}
        birthDays={
          birthDays && birthDays.days > 0
            ? {
                result: birthDays,
                name: birthDaysName,
                // The days go to whoever is not home first, and are taxed
                // at the margin of the salary they sit on top of.
                salary: firstCaregiver === "A" ? salaryB : salaryA,
                municipalRate,
              }
            : undefined
        }
        doubleDaysWindow={doubleDaysWindow ?? undefined}
      />

      {vabResult && (
        <VabResultCard
          result={vabResult}
          salary={firstCaregiver === "A" ? salaryA : salaryB}
          municipalRate={municipalRate}
        />
      )}

      {/* The context that isn't a problem with the plan — how leave rights
          work, the deadlines for actually claiming it, the SGI rule. Kept
          at the foot of the page so it doesn't push the plan itself down,
          but present: a plan filed too late is worth nothing. */}
      <WarningsList warnings={warnings.filter((w) => w.level === "info")} />
    </div>
  );
}
