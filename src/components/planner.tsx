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
  minMonthly: 20000,
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
  const minMonthly = form.minMonthly ?? 20000;
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
        ? optimize(effectivePlan, { objective, asOf, doubleDays })
        : null,
    [effectivePlan, valid, asOf, objective, soloMode, doubleDays],
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

  // A representative income-based rate for the "förläng ledigheten" goal: the
  // family's blended kr/day across the income-based days they're allocated.
  const representativeRate = useMemo(() => {
    if (soloMode) return solo?.payout.dailyRate ?? 0;
    const rec = twoParent?.recommended;
    if (!rec) return 0;
    const sjuk = rec.payout.A.sjukpenningDays + rec.payout.B.sjukpenningDays;
    if (sjuk <= 0) return Math.max(rec.payout.A.dailyRate, rec.payout.B.dailyRate);
    return (
      (rec.payout.A.sjukpenningDays * rec.payout.A.dailyRate +
        rec.payout.B.sjukpenningDays * rec.payout.B.dailyRate) /
      sjuk
    );
  }, [soloMode, solo, twoParent]);

  // For the pace, use the *lowest* income-based rate so the monthly floor holds
  // for whichever caregiver is home (the average would leave the lower earner
  // short).
  const paceRate = useMemo(() => {
    if (soloMode) return solo?.payout.dailyRate ?? 0;
    const rec = twoParent?.recommended;
    if (!rec) return 0;
    return Math.min(rec.payout.A.dailyRate, rec.payout.B.dailyRate);
  }, [soloMode, solo, twoParent]);

  const effectivePace =
    objective === "minMonthly" && paceRate > 0
      ? paceForMonthlyTarget(paceRate, minMonthly)
      : daysPerWeek;

  const monthlyRows: MonthlyRow[] = useMemo(() => {
    if (soloMode && solo) {
      return [
        {
          name: soloName,
          dailyRate: solo.payout.dailyRate,
          days: solo.allocatedTotal,
        },
      ];
    }
    if (twoParent) {
      const rec = twoParent.recommended;
      return [
        { name: nameA, dailyRate: rec.payout.A.dailyRate, days: rec.allocatedTotals.A },
        { name: nameB, dailyRate: rec.payout.B.dailyRate, days: rec.allocatedTotals.B },
      ];
    }
    return [];
  }, [soloMode, solo, twoParent, soloName, nameA, nameB]);

  // How the leave plays out in calendar time at the effective pace.
  const projection: LeaveProjection | null = useMemo(() => {
    if (!asOf || !deadlines || !remaining || remaining.remaining.total <= 0) {
      return null;
    }
    const start = deadlines.birth > asOf ? deadlines.birth : asOf;
    const p = effectivePace > 0 ? effectivePace : 7;
    const incomeBasedEnds = addDays(
      start,
      Math.round((remaining.remaining.sjukpenning / p) * 7),
    );
    const leaveEnds = addDays(
      incomeBasedEnds,
      Math.round((remaining.remaining.lagsta / p) * 7),
    );
    return {
      incomeBasedEnds,
      leaveEnds,
      incomeBasedMonthly: approxMonthlyGross(representativeRate, p),
      lagstaMonthly: approxMonthlyGross(lagstanivaDailyAmount(), p),
    };
  }, [asOf, deadlines, remaining, effectivePace, representativeRate]);

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
        effectivePace={effectivePace}
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
