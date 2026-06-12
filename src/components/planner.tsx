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
import { lagstanivaDailyAmount } from "@/lib/rules";
import { computeVab } from "@/lib/vab";
import { addDays } from "@/lib/dates";
import { approxMonthlyGross, paceForMonthlyTarget } from "@/lib/format";
import { computeSupplement } from "@/lib/supplement";
import { useLocalStorage } from "@/lib/use-local-storage";
import { decodeState, encodeState, type ShareableState } from "@/lib/share";

const DEFAULT_STATE: ShareableState = {
  plan: defaultPlanInput(""),
  objective: "maxPayout",
  soloMode: false,
  hasUsedDays: false,
  detailedUsed: false,
  daysPerWeek: 7,
  doubleDays: 0,
  minMonthlyA: 20000,
  minMonthlyB: 20000,
  paceModeA: "full",
  paceModeB: "full",
  customSplitA: 0.5,
  firstCaregiver: "A",
  supplementA: false,
  supplementB: false,
  supplementMonthsA: 6,
  supplementMonthsB: 6,
  supplementPctA: 90,
  supplementPctB: 90,
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
        ? optimize(effectivePlan, { objective, asOf, doubleDays, customSplitA })
        : null,
    [effectivePlan, valid, asOf, objective, soloMode, doubleDays, customSplitA],
  );
  const solo = useMemo(
    () =>
      valid && asOf && soloMode ? optimizeSolo(effectivePlan, { asOf }) : null,
    [effectivePlan, valid, asOf, soloMode],
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

  // The split the results slider shows: the chosen custom share, or the share
  // the current objective happens to produce (so dragging continues naturally).
  const displaySplitA = useMemo(() => {
    if (objective === "custom") return customSplitA;
    const rec = twoParent?.recommended;
    if (!rec) return 0.5;
    const total = rec.allocatedTotals.A + rec.allocatedTotals.B;
    return total > 0 ? rec.allocatedTotals.A / total : 0.5;
  }, [objective, customSplitA, twoParent]);

  const goalA = paceModeA === "prolong" ? "Förläng ledigheten" : "Full takt";
  const goalB = paceModeB === "prolong" ? "Förläng ledigheten" : "Full takt";

  // Employer top-up ("föräldralön" from a kollektivavtal), per caregiver.
  const aboveCapA = plan.parents.A.incomeAboveCap ?? false;
  const aboveCapB = plan.parents.B.incomeAboveCap ?? false;
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

  const monthlyRows: MonthlyRow[] = useMemo(() => {
    if (soloMode && solo) {
      return [
        {
          name: soloName,
          dailyRate: solo.payout.dailyRate,
          days: solo.allocatedTotal + extraA,
          daysPerWeek: paceA,
          extraDays: extraA,
          goalLabel: goalA,
          aboveCap: aboveCapA,
          supplement: supplementA ?? undefined,
        },
      ];
    }
    if (twoParent) {
      const rec = twoParent.recommended;
      return [
        {
          name: nameA,
          dailyRate: rec.payout.A.dailyRate,
          days: rec.allocatedTotals.A + extraA,
          daysPerWeek: paceA,
          extraDays: extraA,
          goalLabel: goalA,
          aboveCap: aboveCapA,
          supplement: supplementA ?? undefined,
        },
        {
          name: nameB,
          dailyRate: rec.payout.B.dailyRate,
          days: rec.allocatedTotals.B + extraB,
          daysPerWeek: paceB,
          extraDays: extraB,
          goalLabel: goalB,
          aboveCap: aboveCapB,
          supplement: supplementB ?? undefined,
        },
      ];
    }
    return [];
  }, [soloMode, solo, twoParent, soloName, nameA, nameB, extraA, extraB, paceA, paceB, goalA, goalB, aboveCapA, aboveCapB, supplementA, supplementB]);

  // How the leave plays out in calendar time. Each caregiver is home in turn
  // (A then B), at their own pace, taking income-based days before lägstanivå —
  // so the timeline shows when each one's pay steps down and when they hand over.
  const projection: LeaveProjection | null = useMemo(() => {
    if (!asOf || !deadlines || !remaining || remaining.remaining.total <= 0) {
      return null;
    }
    const start = deadlines.birth > asOf ? deadlines.birth : asOf;
    const lagstaRate = lagstanivaDailyAmount();

    type Phase = {
      caregiver?: string;
      days: number;
      pace: number;
      rate: number;
      tier: "income" | "lagsta";
    };
    const phases: Phase[] = [];

    if (soloMode && solo) {
      const p = paceA > 0 ? paceA : 7;
      phases.push({
        days: solo.remaining.remaining.sjukpenning + extraA,
        pace: p,
        rate: rateA,
        tier: "income",
      });
      phases.push({
        days: solo.remaining.remaining.lagsta,
        pace: p,
        rate: lagstaRate,
        tier: "lagsta",
      });
    } else if (twoParent) {
      const rec = twoParent.recommended;
      const phasesFor = (id: "A" | "B"): Phase[] => {
        const alloc = rec.allocation[id];
        const extra = id === "A" ? extraA : extraB;
        const rawPace = id === "A" ? paceA : paceB;
        const pace = rawPace > 0 ? rawPace : 7;
        const rate = id === "A" ? rateA : rateB;
        const name = id === "A" ? nameA : nameB;
        return [
          { caregiver: name, days: alloc.sjukpenning + extra, pace, rate, tier: "income" },
          { caregiver: name, days: alloc.lagsta, pace, rate: lagstaRate, tier: "lagsta" },
        ];
      };
      const order: ("A" | "B")[] =
        firstCaregiver === "B" ? ["B", "A"] : ["A", "B"];
      phases.push(...phasesFor(order[0]), ...phasesFor(order[1]));
    } else {
      return null;
    }

    let cursor = start;
    const segments: LeaveProjection["segments"] = [];
    for (const ph of phases) {
      if (ph.days <= 0) continue;
      cursor = addDays(cursor, Math.round((ph.days / ph.pace) * 7));
      segments.push({
        endsAt: cursor,
        monthly: approxMonthlyGross(ph.rate, ph.pace),
        tier: ph.tier,
        caregiver: ph.caregiver,
      });
    }
    return segments.length > 0 ? { segments } : null;
  }, [
    asOf,
    deadlines,
    remaining,
    soloMode,
    solo,
    twoParent,
    paceA,
    paceB,
    rateA,
    rateB,
    extraA,
    extraB,
    nameA,
    nameB,
    firstCaregiver,
  ]);

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
        monthlyRows={monthlyRows}
        projection={projection ?? undefined}
        vabResult={vabResult}
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
