"use client";

import { useEffect, useMemo, useState } from "react";

import { Card, CardContent } from "@/components/ui/card";
import {
  DEFAULT_SAVE_DAYS,
  Wizard,
  type WizardIssue,
} from "@/components/wizard";
import { Results } from "@/components/results";
import type { MonthlyRow } from "@/components/monthly-estimate";
import type { LeaveProjection } from "@/components/timeline";
import {
  defaultPlanInput,
  emptyTierCount,
  planDeadlines,
  type PlanInput,
} from "@/lib/calc";
import {
  isPlannableBirthDate,
  optimize,
  optimizeSolo,
  type PlanWarning,
} from "@/lib/optimizer";
import { lagstanivaDailyAmount, MONEY } from "@/lib/rules";
import { computeVab } from "@/lib/vab";
import {
  addYears,
  differenceInDays,
  isValidIsoDate,
  parseIsoDate,
  toIsoDate,
} from "@/lib/dates";
import {
  approxMonthlyGross,
  formatDate,
  formatSek,
  paceForMonthlyTarget,
} from "@/lib/format";
import {
  solvePlan,
  type CaregiverPlanSpec,
  type GoalMode,
} from "@/lib/goal-seek";
import { computeSupplement } from "@/lib/supplement";
import { DEFAULT_MUNICIPAL_RATE } from "@/lib/tax";
import { birthDaysFor, computeBirthDays } from "@/lib/birth-days";
import { useLocalStorage } from "@/lib/use-local-storage";
import { decodeState, encodeState, type ShareableState } from "@/lib/share";
import {
  ACTIVE_SAVED_PLAN_KEY,
  SAVED_PLANS_KEY,
  newPlanId,
  planLabel,
  type SavedPlan,
} from "@/lib/saved-plans";
import { Landing } from "@/components/landing";

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
  worksPartTimeA: false,
  worksPartTimeB: false,
  childNumber: 1,
  goalModeA: "manual",
  goalModeB: "manual",
  goalDateA: "",
  goalDateB: "",
  goalBudgetA: 25000,
  goalBudgetB: 25000,
  saveDaysA: DEFAULT_SAVE_DAYS,
  saveDaysB: DEFAULT_SAVE_DAYS,
  customSplitA: 0.5,
  includeLagsta: false,
  firstCaregiver: "A",
  supplementA: true,
  supplementB: true,
  supplementMonthsA: 6,
  supplementMonthsB: 6,
  supplementPctA: 90,
  supplementPctB: 90,
  // Taking these is the norm, and they sit on top of the 480 — so they are
  // in the plan unless someone says otherwise. Who takes them and how many
  // are derived from the birth (see birthDays below), so no defaults here.
  birthDaysEnabled: true,
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
  // Which wizard step "Ändra" reopens — the results page sends each caregiver
  // back to their own.
  const [editStep, setEditStep] = useState(1);
  const [copied, setCopied] = useState(false);
  const [saved, setSaved] = useState(false);
  // The landing page is always the entry point; a shared link (#p=…) skips
  // straight past it below.
  const [view, setView] = useState<"landing" | "plan">("landing");
  const [savedPlans, setSavedPlans] = useLocalStorage<SavedPlan[]>(
    SAVED_PLANS_KEY,
    [],
  );
  // Which saved plan (if any) "Spara" updates in place, rather than adding a
  // duplicate. Cleared whenever the working plan stops being that saved plan.
  const [activeSavedPlanId, setActiveSavedPlanId] = useLocalStorage<
    string | null
  >(ACTIVE_SAVED_PLAN_KEY, null);

  // "Today" is read on the client only (avoids SSR/timezone hydration mismatch).
  useEffect(() => {
    // eslint-disable-next-line react-hooks/set-state-in-effect -- one-time client-only init of "today"
    setAsOf(new Date());
  }, []);

  // While the wizard is showing, phones get the app-shell layout: fixed
  // header/nav chrome and a single scrollable question area (see globals.css).
  // Landing and results are ordinary scrollable pages, so they opt out.
  const wizardVisible = view === "plan" && !(form.submitted ?? false);
  useEffect(() => {
    document.body.classList.toggle("app-shell", wizardVisible);
    return () => document.body.classList.remove("app-shell");
  }, [wizardVisible]);

  // A shared link (#p=…) takes precedence over stored state. Applied on mount.
  useEffect(() => {
    const hash = window.location.hash;
    if (!hash.startsWith("#p=")) return;
    const shared = decodeState(hash.slice(3));
    if (!shared) return;
    /* eslint-disable react-hooks/set-state-in-effect -- one-time sync from the URL on mount, mirroring the existing setForm(shared) above */
    setForm(shared);
    setView("plan");
    // A shared plan is its own thing until explicitly saved — it shouldn't
    // silently overwrite whatever saved plan the working slot last pointed at.
    setActiveSavedPlanId(null);
    /* eslint-enable react-hooks/set-state-in-effect */
    try {
      window.history.replaceState(null, "", window.location.pathname);
    } catch {
      // ignore (e.g. sandboxed history)
    }
  }, [setForm, setActiveSavedPlanId]);

  const { plan, objective, soloMode, hasUsedDays } = form;
  const daysPerWeek = form.daysPerWeek ?? 7;
  const doubleDays = form.doubleDays ?? 0;
  const minMonthlyA = form.minMonthlyA ?? form.minMonthly ?? 20000;
  const minMonthlyB = form.minMonthlyB ?? form.minMonthly ?? 20000;
  const customSplitA = form.customSplitA ?? 0.5;
  const includeLagsta = form.includeLagsta ?? false;
  const firstCaregiver = form.firstCaregiver ?? "A";
  // From the second child on, days can be carried over from previous children.
  // (Older links used a separate hasExtraDays checkbox — honour it too.)
  const childNumber =
    form.childNumber ?? ((form.hasExtraDays ?? false) ? 2 : 1);
  const extraA = childNumber >= 2 ? (form.extraDaysA ?? 0) : 0;
  const extraB = childNumber >= 2 ? (form.extraDaysB ?? 0) : 0;
  // Kommunalskatt drives every net figure on the results page and the budget
  // solver's floor, so it travels with the plan.
  const municipalRate =
    (form.municipalRatePct ?? DEFAULT_MUNICIPAL_RATE * 100) / 100;
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
  const oneYear = useMemo(
    () => (deadlines ? addYears(deadlines.birth, 1) : null),
    [deadlines],
  );
  // Which goals this floor belongs to. Change any of them and the old floor
  // is dropped rather than over-allocating against a target nobody set.
  const goalKey = [
    form.goalModeA,
    form.goalModeB,
    form.goalDateA,
    form.goalDateB,
    form.goalMonthsA,
    form.goalMonthsB,
    form.firstCaregiver,
    form.saveDaysA,
    form.saveDaysB,
    // The incomes decide the split the floor is measured against, so a floor
    // worked out before the second caregiver was asked must not survive them.
    plan.parents.A.grossMonthlyIncome,
    plan.parents.B.grossMonthlyIncome,
    plan.parents.A.incomeAboveCap,
    plan.parents.B.incomeAboveCap,
  ].join("|");

  // A caregiver who asked to be home for a set time needs the days for it.
  // The split heuristic doesn't know that, so it is told: solve, see who
  // falls short, raise their floor by the shortfall, solve again. Held in
  // state because the shortfall only becomes visible after a solve.
  const [dayFloor, setDayFloor] = useState<{
    /** The goals this floor was derived for; a stale one is ignored. */
    key: string;
    min: Partial<Record<"A" | "B", number>>;
    rounds: number;
  }>({ key: "", min: {}, rounds: 0 });
  const twoParent = useMemo(
    () =>
      valid && asOf && !soloMode
        ? optimize(effectivePlan, {
            objective,
            asOf,
            doubleDays,
            customSplitA,
            includeLagsta,
            minSjukpenning: dayFloor.key === goalKey ? dayFloor.min : {},
          })
        : null,
    [effectivePlan, valid, asOf, objective, soloMode, doubleDays, customSplitA, includeLagsta, dayFloor, goalKey],
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
  const baseWarnings: PlanWarning[] = soloMode
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
  // Whether each caregiver works the rest of the week during a slow leave.
  const worksPartTimeA = form.worksPartTimeA ?? false;
  const worksPartTimeB = form.worksPartTimeB ?? false;

  // Per-caregiver goal: manual paces, "hemma till ett datum", or a household
  // budget floor. Legacy links carried ONE global goal — migrate it: a global
  // date goal targeted the end of the whole leave (the last caregiver), a
  // budget goal applied to everyone.
  const lastId: "A" | "B" = soloMode || firstCaregiver === "B" ? "A" : "B";
  const migrated = (id: "A" | "B"): GoalMode => {
    const legacy = form.goalMode;
    if (legacy === "budget") return "budget";
    if (legacy === "untilDate" && id === lastId) return "untilDate";
    return "manual";
  };
  const goalModeA = form.goalModeA ?? migrated("A");
  const goalModeB = form.goalModeB ?? migrated("B");
  const goalDateStrA = form.goalDateA ?? form.goalDate ?? "";
  const goalDateStrB = form.goalDateB ?? form.goalDate ?? "";
  const goalBudgetA = form.goalBudgetA ?? form.goalBudget ?? 25000;
  const goalBudgetB = form.goalBudgetB ?? form.goalBudget ?? 25000;
  const saveDaysA = form.saveDaysA ?? DEFAULT_SAVE_DAYS;
  const saveDaysB = form.saveDaysB ?? DEFAULT_SAVE_DAYS;
  const goalTargetA = useMemo(
    () => (isValidIsoDate(goalDateStrA) ? parseIsoDate(goalDateStrA) : null),
    [goalDateStrA],
  );
  const goalTargetB = useMemo(
    () => (isValidIsoDate(goalDateStrB) ? parseIsoDate(goalDateStrB) : null),
    [goalDateStrB],
  );
  const periodStartStrA = form.periodStartA ?? "";
  const periodStartStrB = form.periodStartB ?? "";
  const periodStartA = useMemo(
    () => (isValidIsoDate(periodStartStrA) ? parseIsoDate(periodStartStrA) : null),
    [periodStartStrA],
  );
  const periodStartB = useMemo(
    () => (isValidIsoDate(periodStartStrB) ? parseIsoDate(periodStartStrB) : null),
    [periodStartStrB],
  );

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
  const partTimeA = {
    works: worksPartTimeA,
    onToggle: (works: boolean) => setForm((f) => ({ ...f, worksPartTimeA: works })),
  };
  const partTimeB = {
    works: worksPartTimeB,
    onToggle: (works: boolean) => setForm((f) => ({ ...f, worksPartTimeB: works })),
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

  // "10-dagar vid barns födelse" — tillfällig FP on top of the 480.
  // The days belong to the parent who did not give birth — in this app's
  // terms, whoever is NOT going on leave first.
  const birthDaysCaregiver: "A" | "B" = firstCaregiver === "A" ? "B" : "A";
  const birthDays = useMemo(() => {
    if (soloMode || !(form.birthDaysEnabled ?? true)) return null;
    const p = plan.parents[birthDaysCaregiver];
    return computeBirthDays({
      grossMonthlyIncome: p.grossMonthlyIncome,
      incomeAboveCap: p.incomeAboveCap,
      // Left unset, the whole entitlement is taken — which grows with the
      // number of children born.
      days: form.birthDaysCount ?? birthDaysFor(plan.childrenInBirth),
      childrenInBirth: plan.childrenInBirth,
    });
  }, [soloMode, form.birthDaysEnabled, form.birthDaysCount, birthDaysCaregiver, plan.parents, plan.childrenInBirth]);
  const birthDaysName =
    birthDaysCaregiver === "A" ? nameA : nameB;

  // Each caregiver's stretch, solved from their own goal (manual pace, a
  // target date, or a household budget floor), chained in leave order.
  const planSolve = useMemo(() => {
    if (!asOf || !deadlines || !remaining || remaining.remaining.total <= 0) {
      return null;
    }
    const start = deadlines.birth > asOf ? deadlines.birth : asOf;
    const lagstaRate = lagstanivaDailyAmount();
    const mk = (
      id: "A" | "B",
      name: string,
      alloc: { sjukpenning: number; lagsta: number },
      rate: number,
      extra: number,
    ): CaregiverPlanSpec => {
      const isA = id === "A";
      const mode = isA ? goalModeA : goalModeB;
      const sw = isA ? switchA : switchB;
      return {
        name,
        worksPartTime: isA ? worksPartTimeA : worksPartTimeB,
        salary: isA ? salaryA : salaryB,
        partnerSalary: isA ? householdBaseA : householdBaseB,
        incomeDays: alloc.sjukpenning + extra,
        incomeRate: rate,
        lagstaDays: alloc.lagsta,
        lagstaRate,
        mode,
        manualPace: isA ? paceA : paceB,
        switchPhases: sw
          ? {
              phase1: isA ? phase1A : phase1B,
              phase2: isA ? phase2A : phase2B,
            }
          : null,
        targetDate: mode === "untilDate" ? (isA ? goalTargetA : goalTargetB) : null,
        targetMonths:
          mode === "untilDate"
            ? (isA ? form.goalMonthsA : form.goalMonthsB) ?? null
            : null,
        budgetFloor: isA ? goalBudgetA : goalBudgetB,
        saveDays: isA ? saveDaysA : saveDaysB,
        startAt: isA ? periodStartA : periodStartB,
      };
    };

    let specs: CaregiverPlanSpec[];
    if (soloMode && solo) {
      specs = [
        mk(
          "A",
          soloName,
          {
            sjukpenning: solo.payout.sjukpenningDays,
            lagsta: solo.payout.lagstaDays,
          },
          rateA,
          extraA,
        ),
      ];
    } else if (twoParent) {
      const rec = twoParent.recommended;
      const order: ("A" | "B")[] =
        firstCaregiver === "B" ? ["B", "A"] : ["A", "B"];
      specs = order.map((id) =>
        mk(
          id,
          id === "A" ? nameA : nameB,
          rec.allocation[id],
          id === "A" ? rateA : rateB,
          id === "A" ? extraA : extraB,
        ),
      );
    } else {
      return null;
    }
    return solvePlan(deadlines.birth, start, specs, municipalRate);
  }, [asOf, deadlines, remaining, soloMode, solo, twoParent, soloName, nameA, nameB, rateA, rateB, extraA, extraB, firstCaregiver, goalModeA, goalModeB, goalTargetA, goalTargetB, goalBudgetA, goalBudgetB, saveDaysA, saveDaysB, periodStartA, periodStartB, paceA, paceB, switchA, switchB, phase1A, phase1B, phase2A, phase2B, worksPartTimeA, worksPartTimeB, salaryA, salaryB, householdBaseA, householdBaseB, municipalRate, form.goalMonthsA, form.goalMonthsB]);

  /**
   * The pace föräldralön is actually paid at: how much of the week this
   * caregiver draws leave for right now, at the start of their stretch.
   * `paceA`/`paceB` are the manual "Justera planen" lever — meaningless once
   * a goal (a date, a budget) is driving the pace instead, which is most of
   * the time. Reading it from the solve keeps the two honest: a caregiver
   * home 0,5 dagar/vecka gets a top-up scaled to 0,5 dagar/vecka, not one
   * sized for a full week they are not taking.
   */
  const solvedPaceA =
    planSolve?.perCaregiver.find((o) => o.name === nameA)?.paces.phase1 ??
    paceA;
  const solvedPaceB =
    planSolve?.perCaregiver.find((o) => o.name === nameB)?.paces.phase1 ??
    paceB;

  const supplementA = useMemo(
    () =>
      (form.supplementA ?? true)
        ? computeSupplement({
            grossMonthlySalary: plan.parents.A.grossMonthlyIncome,
            incomeAboveCap: aboveCapA,
            pct: form.supplementPctA ?? 90,
            months: form.supplementMonthsA ?? 6,
            fkDailyRate: rateA,
            pace: solvedPaceA,
          })
        : null,
    [form.supplementA, form.supplementPctA, form.supplementMonthsA, plan.parents.A.grossMonthlyIncome, aboveCapA, rateA, solvedPaceA],
  );
  const supplementB = useMemo(
    () =>
      !soloMode && (form.supplementB ?? true)
        ? computeSupplement({
            grossMonthlySalary: plan.parents.B.grossMonthlyIncome,
            incomeAboveCap: aboveCapB,
            pct: form.supplementPctB ?? 90,
            months: form.supplementMonthsB ?? 6,
            fkDailyRate: rateB,
            pace: solvedPaceB,
          })
        : null,
    [soloMode, form.supplementB, form.supplementPctB, form.supplementMonthsB, plan.parents.B.grossMonthlyIncome, aboveCapB, rateB, solvedPaceB],
  );

  // Employer top-up at full-time pace, so the levers can fold it into the
  // numbers. `.total` is the same regardless of which pace computed it (the
  // months are what's fixed), so this is stable however supplementA/B above
  // are derived.
  const bonusFullA = supplementA
    ? Math.round(supplementA.total / (form.supplementMonthsA ?? 6))
    : 0;
  const bonusFullB = supplementB
    ? Math.round(supplementB.total / (form.supplementMonthsB ?? 6))
    : 0;

  /**
   * Close the loop on the floor above: a stated goal that the allocation
   * cannot cover reports its shortfall, which becomes that caregiver's floor
   * for the next solve. The days come off whoever has an open-ended goal —
   * they simply end up home for less of the calendar.
   *
   * Bounded: the floor only ever rises, and four rounds is plenty to converge
   * (usually one). Past that the days genuinely are not there, and the wizard
   * says so rather than the plan silently drifting.
   */
  useEffect(() => {
    if (!planSolve || !twoParent) return;
    const current = dayFloor.key === goalKey ? dayFloor : { min: {}, rounds: 0 };
    if (current.rounds >= 4) return;
    const order: ("A" | "B")[] =
      firstCaregiver === "B" ? ["B", "A"] : ["A", "B"];
    const next: Partial<Record<"A" | "B", number>> = { ...current.min };
    let raised = false;
    planSolve.perCaregiver.forEach((o, i) => {
      const id = order[i];
      if (!id) return;
      const mode = id === "A" ? goalModeA : goalModeB;
      if (mode !== "untilDate" || o.targetMet || o.shortfallDays <= 0) return;
      const want =
        twoParent.recommended.allocation[id].sjukpenning +
        Math.ceil(o.shortfallDays);
      if ((next[id] ?? 0) < want) {
        next[id] = want;
        raised = true;
      }
    });
    if (!raised) return;
    // eslint-disable-next-line react-hooks/set-state-in-effect -- the shortfall only exists after a solve; this feeds it back and settles in a round or two
    setDayFloor({ key: goalKey, min: next, rounds: current.rounds + 1 });
  }, [
    planSolve,
    twoParent,
    dayFloor,
    goalKey,
    firstCaregiver,
    goalModeA,
    goalModeB,
  ]);

  const projection: LeaveProjection | null = useMemo(
    () =>
      planSolve && planSolve.intervals.length > 0
        ? { segments: planSolve.intervals }
        : null,
    [planSolve],
  );

  // Per-caregiver goal warnings: an unreachable target date, a budget floor
  // that can't be met, the SGI pace lift, and the 96-day cap on saved days.
  const goalWarnings: PlanWarning[] = useMemo(() => {
    if (!planSolve || !deadlines) return [];
    const out: PlanWarning[] = [];
    for (const o of planSolve.perCaregiver) {
      const isA = soloMode || o.name === nameA;
      const mode = isA ? goalModeA : goalModeB;
      const target = isA ? goalTargetA : goalTargetB;
      const floor = isA ? goalBudgetA : goalBudgetB;
      if (mode === "untilDate" && target && !o.targetMet) {
        out.push({
          level: "warning",
          code: "goalDateShort",
          message:
            o.shortfallDays > 0
              ? `${o.name}s dagar räcker inte till ${formatDate(target)} ens i lägsta takt — det fattas ungefär ${o.shortfallDays} dagar. Flytta datumet, ge ${o.name} fler dagar eller jobba deltid.`
              : `${formatDate(target)} inträffar innan ${o.name}s period börjar — flytta datumet eller ändra ordningen.`,
        });
      }
      if (mode === "budget" && !o.targetMet) {
        out.push({
          level: "warning",
          code: "goalBudgetShort",
          message: `När ${o.name} är hemma klarar hushållet inte golvet på ${formatSek(floor)}/mån efter skatt ens i full takt.`,
        });
      }
      // The SGI floor is not a problem with the plan — it is what happens to
      // almost everyone who is home past the first birthday. It belongs on
      // the period where it takes effect, not in a list of things gone wrong.
    }
    if (planSolve.savedTotal > 96) {
      out.push({
        level: "warning",
        code: "savedDaysCap",
        message: `Ni sparar ungefär ${Math.round(planSolve.savedTotal)} dagar till senare. Vid 4-årsdagen (${formatDate(deadlines.sjukpenningDeadline)}) får högst 96 dagar finnas kvar — planera in resten före dess, t.ex. till klämdagar och lov.`,
      });
    }
    return out;
  }, [planSolve, deadlines, soloMode, nameA, goalModeA, goalModeB, goalTargetA, goalTargetB, goalBudgetA, goalBudgetB]);

  const warnings = [...baseWarnings, ...goalWarnings];

  /** Caregivers whose pace the post-1-year SGI floor raised. */
  const sgiLiftedNames = useMemo(
    () =>
      new Set(
        (planSolve?.perCaregiver ?? [])
          .filter((o) => o.sgiLifted)
          .map((o) => o.name),
      ),
    [planSolve],
  );

  /**
   * When each caregiver's own stretch begins, from the live solve. The wizard
   * measures their date shortcuts from here, so the second caregiver's
   * choices start where the first one leaves off rather than at the birth.
   */
  const periodStarts: Partial<Record<"A" | "B", Date>> = useMemo(() => {
    if (!planSolve || !deadlines || !asOf) return {};
    const order: ("A" | "B")[] = soloMode
      ? ["A"]
      : firstCaregiver === "B"
        ? ["B", "A"]
        : ["A", "B"];
    const out: Partial<Record<"A" | "B", Date>> = {};
    let cursor = deadlines.birth > asOf ? deadlines.birth : asOf;
    planSolve.perCaregiver.forEach((o, i) => {
      const id = order[i];
      if (!id) return;
      // A caregiver with no days of their own still starts where the previous
      // one ended — that is where their shortcuts should be measured from.
      const from = o.startsAt ?? cursor;
      out[id] = from;
      cursor = o.endsAt ?? from;
    });
    return out;
  }, [planSolve, deadlines, asOf, soloMode, firstCaregiver]);

  /**
   * The same trouble, caught in the wizard instead: each goal that cannot be
   * met, pinned to the question that set it, with the nearest workable answer
   * as a one-tap fix. Solved live, so it appears the moment the choice is made.
   */
  const wizardIssues: WizardIssue[] = useMemo(() => {
    if (!planSolve || !deadlines) return [];
    const order: ("A" | "B")[] = soloMode
      ? ["A"]
      : firstCaregiver === "B"
        ? ["B", "A"]
        : ["A", "B"];
    const out: WizardIssue[] = [];

    planSolve.perCaregiver.forEach((o, i) => {
      const id = order[i];
      if (!id) return;
      const q = id.toLowerCase();
      const isA = id === "A";
      const mode = isA ? goalModeA : goalModeB;
      const target = isA ? goalTargetA : goalTargetB;
      const floor = isA ? goalBudgetA : goalBudgetB;

      if (mode === "untilDate" && target && !o.targetMet) {
        if (o.endsAt && o.shortfallDays > 0) {
          const reach = o.endsAt;
          out.push({
            questionId: `${q}-q-goaldetail`,
            message: `Dagarna räcker till ${formatDate(reach)} — det fattas ungefär ${o.shortfallDays} dagar till ${formatDate(target)}. Välj ett tidigare datum, eller låt ${o.name} ta fler dagar.`,
            fix: {
              label: `Flytta till ${formatDate(reach)}`,
              apply: () =>
                setForm((f) =>
                  isA
                    ? { ...f, goalDateA: toIsoDate(reach) }
                    : { ...f, goalDateB: toIsoDate(reach) },
                ),
            },
          });
        } else {
          out.push({
            questionId: `${q}-q-goaldetail`,
            message: `${formatDate(target)} har redan passerat när ${o.name}s period börjar — välj ett senare datum, eller låt ${o.name} börja först.`,
          });
        }
      }

      if (mode === "budget" && !o.targetMet && o.lowestHouseholdNet !== null) {
        // The solver already runs at the pace that pays most, so this is the
        // highest floor that can actually hold.
        const best = Math.floor(o.lowestHouseholdNet / 500) * 500;
        out.push({
          questionId: `${q}-q-goaldetail`,
          message: `Hushållet når som mest ${formatSek(o.lowestHouseholdNet)}/mån när ${o.name} är hemma — golvet på ${formatSek(floor)} går inte att hålla.`,
          fix:
            best > 0 && best < floor
              ? {
                  label: `Sänk golvet till ${formatSek(best)}`,
                  apply: () =>
                    setForm((f) =>
                      isA
                        ? { ...f, goalBudgetA: best }
                        : { ...f, goalBudgetB: best },
                    ),
                }
              : undefined,
        });
      }
    });

    // Days left over at the 4-year deadline — deliberate or cut by a date goal.
    const excess = Math.round(planSolve.savedTotal) - 96;
    if (excess > 0) {
      const id: "A" | "B" = saveDaysB > saveDaysA ? "B" : "A";
      const own = id === "A" ? saveDaysA : saveDaysB;
      const trimmable = own >= excess;
      out.push({
        questionId: `${id.toLowerCase()}-q-save`,
        message: `Planen lämnar ungefär ${Math.round(planSolve.savedTotal)} dagar oanvända. Vid 4-årsdagen (${formatDate(deadlines.sjukpenningDeadline)}) får högst 96 finnas kvar${trimmable ? "" : " — lägg ut fler dagar, t.ex. genom ett senare slutdatum"}.`,
        fix: trimmable
          ? {
              label: `Spara ${own - excess} dagar i stället`,
              apply: () =>
                setForm((f) =>
                  id === "A"
                    ? { ...f, saveDaysA: own - excess }
                    : { ...f, saveDaysB: own - excess },
                ),
            }
          : undefined,
      });
    }
    return out;
  }, [
    planSolve,
    deadlines,
    soloMode,
    firstCaregiver,
    goalModeA,
    goalModeB,
    goalTargetA,
    goalTargetB,
    goalBudgetA,
    goalBudgetB,
    saveDaysA,
    saveDaysB,
    setForm,
  ]);

  // One-line result of the solved plan, shown in the "Justera" section.
  const goalSummary = useMemo(() => {
    if (!planSolve || !planSolve.endsAt) return null;
    const bits = [`Ledig till ${formatDate(planSolve.endsAt)}`];
    if (planSolve.savedTotal >= 1) {
      bits.push(`${Math.round(planSolve.savedTotal)} dagar sparas till senare`);
    }
    if (planSolve.minHouseholdNet != null) {
      bits.push(
        `hushållet som lägst ≈ ${formatSek(planSolve.minHouseholdNet)}/mån efter skatt`,
      );
    }
    return bits.join(" · ");
  }, [planSolve]);

  const monthlyRows: MonthlyRow[] = useMemo(() => {
    if (!planSolve) return [];
    const outcomeFor = (name: string) =>
      planSolve.perCaregiver.find((o) => o.name === name);
    const labelFor = (id: "A" | "B") => {
      const mode = id === "A" ? goalModeA : goalModeB;
      const target = id === "A" ? goalTargetA : goalTargetB;
      if (mode === "untilDate" && target)
        return `Hemma till ${formatDate(target)}`;
      if (mode === "budget") return "Inom budget";
      return id === "A" ? goalA : goalB;
    };
    const rowFor = (
      id: "A" | "B",
      name: string,
      payout: { dailyRate: number; grundnivaDays: number },
      extra: number,
    ): MonthlyRow => {
      const o = outcomeFor(name);
      const isA = id === "A";
      const startPace = o?.paces.phase1 ?? 7;
      const crossesYear =
        oneYear != null &&
        o?.endsAt != null &&
        o.endsAt.getTime() > oneYear.getTime();
      const works = isA ? worksPartTimeA : worksPartTimeB;
      const salary = isA ? salaryA : salaryB;
      return {
        name,
        dailyRate: payout.dailyRate,
        grundnivaFirstDays: payout.grundnivaDays,
        days: Math.round(o?.usedDays ?? 0),
        daysPerWeek: startPace,
        leaveMonths:
          o?.startsAt && o.endsAt
            ? differenceInDays(o.startsAt, o.endsAt) / 30.4
            : undefined,
        secondPhase:
          o && crossesYear && Math.abs(o.paces.phase2 - o.paces.phase1) > 0.05
            ? {
                daysPerWeek: o.paces.phase2,
                monthly: approxMonthlyGross(payout.dailyRate, o.paces.phase2),
              }
            : undefined,
        extraDays: extra,
        goalLabel: labelFor(id),
        savedDays:
          o && o.savedDays >= 1 ? Math.round(o.savedDays) : undefined,
        aboveCap: isA ? aboveCapA : aboveCapB,
        supplement: (isA ? supplementA : supplementB) ?? undefined,
        householdBase: isA ? householdBaseA : householdBaseB,
        partnerWorking: soloMode ? undefined : isA ? nameB : nameA,
        partTimeSalary: works
          ? Math.round(
              (salary * (7 - Math.max(0, Math.min(7, startPace)))) / 7,
            )
          : 0,
      };
    };

    if (soloMode && solo) {
      return [rowFor("A", soloName, solo.payout, extraA)];
    }
    if (twoParent) {
      const rec = twoParent.recommended;
      return [
        rowFor("A", nameA, rec.payout.A, extraA),
        rowFor("B", nameB, rec.payout.B, extraB),
      ];
    }
    return [];
  }, [planSolve, oneYear, soloMode, solo, twoParent, soloName, nameA, nameB, extraA, extraB, goalA, goalB, goalModeA, goalModeB, goalTargetA, goalTargetB, aboveCapA, aboveCapB, supplementA, supplementB, householdBaseA, householdBaseB, salaryA, salaryB, worksPartTimeA, worksPartTimeB]);

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

  // Short per-caregiver goal descriptions for the Justera section (null when
  // the caregiver is on manual paces and the sliders apply).
  // A length goal describes itself as a length; the date it lands on comes
  // from the solve and is shown on the period block.
  const goalText = (id: "A" | "B"): string | null => {
    const mode = id === "A" ? goalModeA : goalModeB;
    const target = id === "A" ? goalTargetA : goalTargetB;
    const months = (id === "A" ? form.goalMonthsA : form.goalMonthsB) ?? 0;
    const floor = id === "A" ? goalBudgetA : goalBudgetB;
    if (mode === "untilDate" && months > 0) {
      return months === 12 ? "Hemma i 1 år" : `Hemma i ${months} månader`;
    }
    if (mode === "untilDate" && target) return `Hemma till ${formatDate(target)}`;
    if (mode === "budget") return `Inom budget (minst ${formatSek(floor)}/mån)`;
    return null;
  };
  const goalTextA = goalText("A");
  const goalTextB = goalText("B");

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

  // Any real answer means there's something worth offering to resume — the
  // birth date is the first thing step 1 asks for.
  const hasProgress = plan.birthDate !== "";
  const progressLabel = planLabel(form);

  const resetPlan = () => {
    setForm(DEFAULT_STATE);
    setActiveSavedPlanId(null);
  };

  const startNewPlan = () => {
    resetPlan();
    setEditStep(1);
    setView("plan");
  };

  const openSavedPlan = (id: string) => {
    const found = savedPlans.find((p) => p.id === id);
    if (!found) return;
    setForm(found.state);
    setActiveSavedPlanId(found.id);
    setEditStep(1);
    setView("plan");
  };

  const deleteSavedPlan = (id: string) => {
    setSavedPlans((list) => list.filter((p) => p.id !== id));
    if (activeSavedPlanId === id) setActiveSavedPlanId(null);
  };

  const savePlan = () => {
    const id = activeSavedPlanId ?? newPlanId();
    const entry: SavedPlan = {
      id,
      name: planLabel(form),
      savedAt: new Date().toISOString(),
      state: form,
    };
    setSavedPlans((list) => {
      const idx = list.findIndex((p) => p.id === id);
      if (idx === -1) return [entry, ...list];
      const updated = [...list];
      updated[idx] = entry;
      return updated;
    });
    setActiveSavedPlanId(id);
    setSaved(true);
    window.setTimeout(() => setSaved(false), 2000);
  };

  if (view === "landing") {
    return (
      <Landing
        savedPlans={savedPlans}
        hasProgress={hasProgress}
        progressLabel={progressLabel}
        progressDone={submitted}
        onCreate={startNewPlan}
        onContinue={() => setView("plan")}
        onOpen={openSavedPlan}
        onDelete={deleteSavedPlan}
      />
    );
  }

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
        deadlines={deadlines}
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
        salaryA={salaryA}
        salaryB={salaryB}
        partTimeA={partTimeA}
        partTimeB={partTimeB}
        goalSummary={
          goalTextA != null ||
          goalTextB != null ||
          (planSolve?.savedTotal ?? 0) >= 1
            ? goalSummary
            : null
        }
        goalTextA={goalTextA}
        goalTextB={goalTextB}
        periodEdit={{
          idByName: soloMode
            ? { [soloName]: "A" as const }
            : { [nameA]: "A" as const, [nameB]: "B" as const },
          modeById: { A: goalModeA, B: goalModeB },
          hasStartOverride: {
            A: periodStartA != null,
            B: periodStartB != null,
          },
          onEndDate: (id, iso) =>
            setForm((f) =>
              id === "A"
                ? { ...f, goalModeA: "untilDate", goalDateA: iso }
                : { ...f, goalModeB: "untilDate", goalDateB: iso },
            ),
          onClearEnd: (id) =>
            setForm((f) =>
              id === "A"
                ? { ...f, goalModeA: "manual" }
                : { ...f, goalModeB: "manual" },
            ),
          onStartDate: (id, iso) =>
            setForm((f) =>
              id === "A"
                ? { ...f, periodStartA: iso ?? undefined }
                : { ...f, periodStartB: iso ?? undefined },
            ),
        }}
        monthlyRows={monthlyRows}
        projection={projection ?? undefined}
        vabResult={vabResult}
        birthDays={birthDays ?? undefined}
        birthDaysName={birthDaysName}
        firstCaregiver={firstCaregiver}
        municipalRate={municipalRate}
        oneYear={oneYear ?? undefined}
        sgiLiftedNames={sgiLiftedNames}
        warnings={warnings}
        onEdit={(step = 1) => {
          window.scrollTo(0, 0);
          setEditStep(step);
          setForm((f) => ({ ...f, submitted: false }));
        }}
        onReset={resetPlan}
        onShare={share}
        copied={copied}
        onSave={savePlan}
        saved={saved}
        onHome={() => setView("landing")}
      />
    );
  }

  return (
    <Wizard
      form={form}
      setForm={setForm}
      valid={valid}
      issues={wizardIssues}
      periodStarts={periodStarts}
      initialStep={editStep}
      onSubmit={() => {
        window.scrollTo(0, 0);
        setForm((f) => ({ ...f, submitted: true }));
      }}
      onReset={resetPlan}
    />
  );
}
