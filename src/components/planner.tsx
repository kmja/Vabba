"use client";

import { useEffect, useMemo, useState } from "react";

import { Card, CardContent } from "@/components/ui/card";
import { Wizard } from "@/components/wizard";
import { Results } from "@/components/results";
import type { MonthlyRow } from "@/components/monthly-estimate";
import type { LeaveProjection } from "@/components/timeline";
import {
  defaultPlanInput,
  emptyTierCount,
  planDeadlines,
  type PlanInput,
} from "@/lib/calc";
import { isPlannableBirthDate, optimize, optimizeSolo } from "@/lib/optimizer";
import { lagstanivaDailyAmount, MONEY } from "@/lib/rules";
import { computeVab } from "@/lib/vab";
import { addYears, differenceInDays } from "@/lib/dates";
import { approxMonthlyGross, paceForMonthlyTarget } from "@/lib/format";
import { buildLeaveIntervals, type LeaveBlock } from "@/lib/projection";
import { computeSupplement } from "@/lib/supplement";
import { computeBirthDays } from "@/lib/birth-days";
import { useLocalStorage } from "@/lib/use-local-storage";
import { decodeState, encodeState, type ShareableState } from "@/lib/share";

const DEFAULT_STATE: ShareableState = {
  plan: defaultPlanInput(""),
  objective: "maxHousehold",
  soloMode: false,
  hasUsedDays: false,
  detailedUsed: false,
  daysPerWeek: 7,
  doubleDays: 0,
  minMonthlyA: 20000,
  minMonthlyB: 20000,
  paceModeA: "full",
  paceModeB: "full",
  switchAt1A: false,
  switchAt1B: false,
  phase1A: 3,
  phase1B: 3,
  phase2A: 5,
  phase2B: 5,
  customSplitA: 0.5,
  includeLagsta: false,
  firstCaregiver: "A",
  supplementA: false,
  supplementB: false,
  supplementMonthsA: 6,
  supplementMonthsB: 6,
  supplementPctA: 90,
  supplementPctB: 90,
  birthDaysEnabled: false,
  birthDaysCaregiver: "B",
  birthDaysCount: 10,
  hasExtraDays: false,
  extraDaysA: 0,
  extraDaysB: 0,
  vabEnabled: false,
  vabChildren: 1,
  vabDaysUsedThisYear: 0,
  submitted: false,
};

export function Planner() {
  const [form, setForm] = useLocalStorage<ShareableState>(
    "foraldradagar.fp.v2",
    DEFAULT_STATE,
  );
  const [asOf, setAsOf] = useState<Date | null>(null);
  const [copied, setCopied] = useState(false);

  // "Today" is read on the client only (avoids SSR/timezone hydration mismatch).
  useEffect(() => {
    // eslint-disable-next-line react-hooks/set-state-in-effect -- one-time client-only init of "today"
    setAsOf(new Date());
  }, []);

  // A shared link (#p=…) takes precedence over stored state. Applied on mount.
  useEffect(() => {
    const hash = window.location.hash;
    if (!hash.startsWith("#p=")) return;
    const shared = decodeState(hash.slice(3));
    if (!shared) return;
    setForm(shared);
    try {
      window.history.replaceState(null, "", window.location.pathname);
    } catch {
      // ignore (e.g. sandboxed history)
    }
  }, [setForm]);

  const { plan, objective, soloMode, hasUsedDays } = form;
  const daysPerWeek = form.daysPerWeek ?? 7;
  const doubleDays = form.doubleDays ?? 0;
  const minMonthlyA = form.minMonthlyA ?? form.minMonthly ?? 20000;
  const minMonthlyB = form.minMonthlyB ?? form.minMonthly ?? 20000;
  const customSplitA = form.customSplitA ?? 0.5;
  const includeLagsta = form.includeLagsta ?? false;
  const firstCaregiver = form.firstCaregiver ?? "A";
  const extraA = (form.hasExtraDays ?? false) ? (form.extraDaysA ?? 0) : 0;
  const extraB = (form.hasExtraDays ?? false) ? (form.extraDaysB ?? 0) : 0;
  const vabEnabled = form.vabEnabled ?? false;
  const vabChildren = form.vabChildren ?? 1;
  const vabDaysUsedThisYear = form.vabDaysUsedThisYear ?? 0;
  const submitted = form.submitted ?? false;

  // When "already used days" is off, ignore any stored counts in the maths
  // (but keep them so toggling back on restores what was typed).
  const effectivePlan: PlanInput = useMemo(() => {
    if (hasUsedDays) return plan;
    return {
      ...plan,
      parents: {
        A: { ...plan.parents.A, daysUsed: emptyTierCount() },
        B: { ...plan.parents.B, daysUsed: emptyTierCount() },
      },
    };
  }, [plan, hasUsedDays]);

  const valid = isPlannableBirthDate(plan.birthDate);
  const deadlines = useMemo(
    () => (valid ? planDeadlines(effectivePlan) : null),
    [effectivePlan, valid],
  );
  const twoParent = useMemo(
    () =>
      valid && asOf && !soloMode
        ? optimize(effectivePlan, {
            objective,
            asOf,
            doubleDays,
            customSplitA,
            includeLagsta,
          })
        : null,
    [effectivePlan, valid, asOf, objective, soloMode, doubleDays, customSplitA, includeLagsta],
  );
  const solo = useMemo(
    () =>
      valid && asOf && soloMode
        ? optimizeSolo(effectivePlan, { asOf, includeLagsta })
        : null,
    [effectivePlan, valid, asOf, soloMode, includeLagsta],
  );
  const remaining = soloMode
    ? (solo?.remaining ?? null)
    : (twoParent?.remaining ?? null);
  const warnings = soloMode
    ? (solo?.warnings ?? [])
    : (twoParent?.recommended.warnings ?? []);

  const nameA = plan.parents.A.name?.trim() || "Vårdnadshavare A";
  const nameB = plan.parents.B.name?.trim() || "Vårdnadshavare B";
  const soloName = plan.parents.A.name?.trim() || "Du";

  // Income-based rate per caregiver (the payout already floors at grundnivå).
  const rateA = soloMode
    ? (solo?.payout.dailyRate ?? 0)
    : (twoParent?.recommended.payout.A.dailyRate ?? 0);
  const rateB = twoParent?.recommended.payout.B.dailyRate ?? 0;

  // Each caregiver sets their own pace goal: take days at the full step-3
  // schedule, or stretch them to their own monthly floor ("förläng").
  // (Older shared links used a single "minMonthly" objective for both.)
  const paceModeA = form.paceModeA ?? (objective === "minMonthly" ? "prolong" : "full");
  const paceModeB = form.paceModeB ?? (objective === "minMonthly" ? "prolong" : "full");
  const paceA =
    paceModeA === "prolong" && rateA > 0
      ? paceForMonthlyTarget(rateA, minMonthlyA)
      : daysPerWeek;
  const paceB =
    paceModeB === "prolong" && rateB > 0
      ? paceForMonthlyTarget(rateB, minMonthlyB)
      : daysPerWeek;

  // Optional second leave period: switch pace at the child's 1st birthday.
  const switchA = form.switchAt1A ?? false;
  const switchB = form.switchAt1B ?? false;
  const phase1A = form.phase1A ?? 3;
  const phase1B = form.phase1B ?? 3;
  const phase2A = form.phase2A ?? 5;
  const phase2B = form.phase2B ?? 5;

  // The split the results slider shows: the chosen custom share, or the share
  // the current objective happens to produce (so dragging continues naturally).
  const displaySplitA = useMemo(() => {
    if (objective === "custom") return customSplitA;
    const rec = twoParent?.recommended;
    if (!rec) return 0.5;
    const total = rec.allocatedTotals.A + rec.allocatedTotals.B;
    return total > 0 ? rec.allocatedTotals.A / total : 0.5;
  }, [objective, customSplitA, twoParent]);

  // Label by the actual pace, not the stored mode (the results levers may set a
  // prolong target that still works out to ~full speed, or vice versa).
  const goalA = switchA
    ? "Byter takt vid 1 år"
    : paceA >= 6.5
      ? "Full takt"
      : "Förläng ledigheten";
  const goalB = switchB
    ? "Byter takt vid 1 år"
    : paceB >= 6.5
      ? "Full takt"
      : "Förläng ledigheten";

  // The results-page levers set a caregiver's target monthly pay, which drives
  // their pace (months ↔ kr/månad are two views of the same dial).
  const setTargetA = (minMonthly: number) =>
    setForm((f) => ({
      ...f,
      minMonthlyA: Math.max(1, Math.round(minMonthly)),
      paceModeA: "prolong",
    }));
  const setTargetB = (minMonthly: number) =>
    setForm((f) => ({
      ...f,
      minMonthlyB: Math.max(1, Math.round(minMonthly)),
      paceModeB: "prolong",
    }));

  // The per-person "byt takt vid 1 år" controls (results page).
  const phaseA = {
    on: switchA,
    phase1: phase1A,
    phase2: phase2A,
    onToggle: (on: boolean) => setForm((f) => ({ ...f, switchAt1A: on })),
    onSetPhase1: (n: number) => setForm((f) => ({ ...f, phase1A: n })),
    onSetPhase2: (n: number) => setForm((f) => ({ ...f, phase2A: n })),
  };
  const phaseB = {
    on: switchB,
    phase1: phase1B,
    phase2: phase2B,
    onToggle: (on: boolean) => setForm((f) => ({ ...f, switchAt1B: on })),
    onSetPhase1: (n: number) => setForm((f) => ({ ...f, phase1B: n })),
    onSetPhase2: (n: number) => setForm((f) => ({ ...f, phase2B: n })),
  };

  // Employer top-up ("föräldralön" from a kollektivavtal), per caregiver.
  const aboveCapA = plan.parents.A.incomeAboveCap ?? false;
  const aboveCapB = plan.parents.B.incomeAboveCap ?? false;

  // Household income: while one caregiver is on leave the other is working, so
  // their salary adds to the household total. (Above the cap with no figure
  // entered, fall back to the cap as a floor.)
  const CAP_MONTHLY = Math.round(MONEY.sgiAnnualCap / 12);
  const salaryA =
    plan.parents.A.grossMonthlyIncome > 0
      ? plan.parents.A.grossMonthlyIncome
      : aboveCapA
        ? CAP_MONTHLY
        : 0;
  const salaryB =
    plan.parents.B.grossMonthlyIncome > 0
      ? plan.parents.B.grossMonthlyIncome
      : aboveCapB
        ? CAP_MONTHLY
        : 0;
  const householdBaseA = soloMode ? 0 : salaryB; // B works while A is on leave
  const householdBaseB = soloMode ? 0 : salaryA;
  const supplementA = useMemo(
    () =>
      (form.supplementA ?? false)
        ? computeSupplement({
            grossMonthlySalary: plan.parents.A.grossMonthlyIncome,
            incomeAboveCap: aboveCapA,
            pct: form.supplementPctA ?? 90,
            months: form.supplementMonthsA ?? 6,
            fkDailyRate: rateA,
            pace: paceA,
          })
        : null,
    [form.supplementA, form.supplementPctA, form.supplementMonthsA, plan.parents.A.grossMonthlyIncome, aboveCapA, rateA, paceA],
  );
  const supplementB = useMemo(
    () =>
      !soloMode && (form.supplementB ?? false)
        ? computeSupplement({
            grossMonthlySalary: plan.parents.B.grossMonthlyIncome,
            incomeAboveCap: aboveCapB,
            pct: form.supplementPctB ?? 90,
            months: form.supplementMonthsB ?? 6,
            fkDailyRate: rateB,
            pace: paceB,
          })
        : null,
    [soloMode, form.supplementB, form.supplementPctB, form.supplementMonthsB, plan.parents.B.grossMonthlyIncome, aboveCapB, rateB, paceB],
  );

  // "10 dagar vid barns födelse" — tillfällig FP for the chosen caregiver.
  const birthDaysCaregiver = form.birthDaysCaregiver ?? "B";
  const birthDays = useMemo(() => {
    if (soloMode || !(form.birthDaysEnabled ?? false)) return null;
    const p = plan.parents[birthDaysCaregiver];
    return computeBirthDays({
      grossMonthlyIncome: p.grossMonthlyIncome,
      incomeAboveCap: p.incomeAboveCap,
      days: form.birthDaysCount ?? 10,
    });
  }, [soloMode, form.birthDaysEnabled, form.birthDaysCount, birthDaysCaregiver, plan.parents]);
  const birthDaysName =
    birthDaysCaregiver === "A" ? nameA : nameB;

  // Employer top-up at full-time pace, so the levers can fold it into the numbers.
  const bonusFullA = supplementA
    ? Math.round(supplementA.total / (form.supplementMonthsA ?? 6))
    : 0;
  const bonusFullB = supplementB
    ? Math.round(supplementB.total / (form.supplementMonthsB ?? 6))
    : 0;

  // How the leave plays out in calendar time. Caregivers are home in turn
  // (first → second), each drawing income-based days before lägstanivå, at a
  // pace that may switch at the 1-year mark.
  const projection: LeaveProjection | null = useMemo(() => {
    if (!asOf || !deadlines || !remaining || remaining.remaining.total <= 0) {
      return null;
    }
    const start = deadlines.birth > asOf ? deadlines.birth : asOf;
    const oneYear = addYears(deadlines.birth, 1);
    const lagstaRate = lagstanivaDailyAmount();

    const scheduleFor = (id: "A" | "B") => {
      if (id === "A" ? switchA : switchB) {
        const p1 = id === "A" ? phase1A : phase1B;
        const p2 = id === "A" ? phase2A : phase2B;
        return [
          { until: oneYear, pace: p1 > 0 ? p1 : 1 },
          { until: null, pace: p2 > 0 ? p2 : 1 },
        ];
      }
      const p = id === "A" ? paceA : paceB;
      return [{ until: null, pace: p > 0 ? p : 7 }];
    };

    const blocks: LeaveBlock[] = [];
    if (soloMode && solo) {
      const schedule = scheduleFor("A");
      blocks.push(
        { caregiver: soloName, tier: "income", days: solo.payout.sjukpenningDays + extraA, rate: rateA, schedule },
        { caregiver: soloName, tier: "lagsta", days: solo.payout.lagstaDays, rate: lagstaRate, schedule },
      );
    } else if (twoParent) {
      const rec = twoParent.recommended;
      const blocksFor = (id: "A" | "B"): LeaveBlock[] => {
        const alloc = rec.allocation[id];
        const extra = id === "A" ? extraA : extraB;
        const rate = id === "A" ? rateA : rateB;
        const name = id === "A" ? nameA : nameB;
        const schedule = scheduleFor(id);
        return [
          { caregiver: name, tier: "income", days: alloc.sjukpenning + extra, rate, schedule },
          { caregiver: name, tier: "lagsta", days: alloc.lagsta, rate: lagstaRate, schedule },
        ];
      };
      const order: ("A" | "B")[] =
        firstCaregiver === "B" ? ["B", "A"] : ["A", "B"];
      blocks.push(...blocksFor(order[0]), ...blocksFor(order[1]));
    } else {
      return null;
    }

    const segments = buildLeaveIntervals(start, blocks);
    return segments.length > 0 ? { segments } : null;
  }, [
    asOf,
    deadlines,
    remaining,
    soloMode,
    solo,
    twoParent,
    soloName,
    nameA,
    nameB,
    paceA,
    paceB,
    rateA,
    rateB,
    extraA,
    extraB,
    firstCaregiver,
    switchA,
    switchB,
    phase1A,
    phase1B,
    phase2A,
    phase2B,
  ]);

  const monthlyRows: MonthlyRow[] = useMemo(() => {
    const segs = projection?.segments ?? [];
    const monthsFor = (name: string): number | undefined => {
      const mine = segs.filter((s) => s.caregiver === name);
      if (mine.length === 0) return undefined;
      return (
        differenceInDays(mine[0].startsAt, mine[mine.length - 1].endsAt) / 30.4
      );
    };
    const phaseInfo = (id: "A" | "B", rate: number) => {
      if (id === "A" ? switchA : switchB) {
        const p1 = id === "A" ? phase1A : phase1B;
        const p2 = id === "A" ? phase2A : phase2B;
        return {
          startPace: p1,
          secondPhase: { daysPerWeek: p2, monthly: approxMonthlyGross(rate, p2) },
        };
      }
      return {
        startPace: id === "A" ? paceA : paceB,
        secondPhase: undefined,
      };
    };

    if (soloMode && solo) {
      const ph = phaseInfo("A", solo.payout.dailyRate);
      return [
        {
          name: soloName,
          dailyRate: solo.payout.dailyRate,
          grundnivaFirstDays: solo.payout.grundnivaDays,
          days: solo.allocatedTotal + extraA,
          daysPerWeek: ph.startPace,
          leaveMonths: monthsFor(soloName),
          secondPhase: ph.secondPhase,
          extraDays: extraA,
          goalLabel: goalA,
          aboveCap: aboveCapA,
          supplement: supplementA ?? undefined,
          householdBase: householdBaseA,
        },
      ];
    }
    if (twoParent) {
      const rec = twoParent.recommended;
      const phA = phaseInfo("A", rec.payout.A.dailyRate);
      const phB = phaseInfo("B", rec.payout.B.dailyRate);
      return [
        {
          name: nameA,
          dailyRate: rec.payout.A.dailyRate,
          grundnivaFirstDays: rec.payout.A.grundnivaDays,
          days: rec.allocatedTotals.A + extraA,
          daysPerWeek: phA.startPace,
          leaveMonths: monthsFor(nameA),
          secondPhase: phA.secondPhase,
          extraDays: extraA,
          goalLabel: goalA,
          aboveCap: aboveCapA,
          supplement: supplementA ?? undefined,
          householdBase: householdBaseA,
          partnerWorking: nameB,
        },
        {
          name: nameB,
          dailyRate: rec.payout.B.dailyRate,
          grundnivaFirstDays: rec.payout.B.grundnivaDays,
          days: rec.allocatedTotals.B + extraB,
          daysPerWeek: phB.startPace,
          leaveMonths: monthsFor(nameB),
          secondPhase: phB.secondPhase,
          extraDays: extraB,
          goalLabel: goalB,
          aboveCap: aboveCapB,
          supplement: supplementB ?? undefined,
          householdBase: householdBaseB,
          partnerWorking: nameA,
        },
      ];
    }
    return [];
  }, [projection, soloMode, solo, twoParent, soloName, nameA, nameB, extraA, extraB, paceA, paceB, goalA, goalB, aboveCapA, aboveCapB, supplementA, supplementB, switchA, switchB, phase1A, phase1B, phase2A, phase2B, householdBaseA, householdBaseB]);

  const vabResult = useMemo(
    () =>
      vabEnabled
        ? computeVab({
            grossMonthlyIncome: plan.parents.A.grossMonthlyIncome,
            incomeAboveCap: plan.parents.A.incomeAboveCap,
            numberOfChildren: vabChildren,
            singleParent: soloMode,
            daysUsedThisYear: vabDaysUsedThisYear,
          })
        : null,
    [vabEnabled, plan.parents.A, vabChildren, soloMode, vabDaysUsedThisYear],
  );

  const share = async () => {
    const encoded = encodeState(form);
    const url = `${window.location.origin}${window.location.pathname}#p=${encoded}`;
    try {
      await navigator.clipboard.writeText(url);
    } catch {
      // clipboard may be unavailable; the address bar still updates below
    }
    try {
      window.history.replaceState(null, "", `#p=${encoded}`);
    } catch {
      // ignore
    }
    setCopied(true);
    window.setTimeout(() => setCopied(false), 2000);
  };

  if (submitted && valid) {
    if (!asOf || !remaining || !deadlines) {
      return (
        <Card>
          <CardContent className="text-muted-foreground flex min-h-40 items-center justify-center py-12">
            Laddar…
          </CardContent>
        </Card>
      );
    }
    return (
      <Results
        soloMode={soloMode}
        objective={objective}
        plan={plan}
        soloName={soloName}
        twoParent={twoParent}
        solo={solo}
        remaining={remaining}
        deadlines={deadlines}
        asOf={asOf}
        paceA={paceA}
        paceB={paceB}
        splitA={displaySplitA}
        onSplitChange={(v) =>
          setForm((f) => ({ ...f, objective: "custom", customSplitA: v }))
        }
        onSetTargetA={setTargetA}
        onSetTargetB={setTargetB}
        phaseA={phaseA}
        phaseB={phaseB}
        bonusFullA={bonusFullA}
        bonusFullB={bonusFullB}
        householdBaseA={householdBaseA}
        householdBaseB={householdBaseB}
        monthlyRows={monthlyRows}
        projection={projection ?? undefined}
        vabResult={vabResult}
        birthDays={birthDays ?? undefined}
        birthDaysName={birthDaysName}
        savedLagstaDays={includeLagsta ? 0 : (remaining?.remaining.lagsta ?? 0)}
        warnings={warnings}
        onEdit={() => setForm((f) => ({ ...f, submitted: false }))}
        onReset={() => setForm(DEFAULT_STATE)}
        onShare={share}
        copied={copied}
      />
    );
  }

  return (
    <Wizard
      form={form}
      setForm={setForm}
      valid={valid}
      onSubmit={() => setForm((f) => ({ ...f, submitted: true }))}
      onReset={() => setForm(DEFAULT_STATE)}
    />
  );
}
