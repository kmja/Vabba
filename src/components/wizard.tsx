"use client";

import {
  useRef,
  useState,
  type Dispatch,
  type ReactNode,
  type SetStateAction,
} from "react";
import { flushSync } from "react-dom";
import {
  IconAdjustments,
  IconArrowLeft,
  IconArrowRight,
  IconBabyCarriage,
  IconChevronDown,
  IconRefresh,
} from "@tabler/icons-react";

import { Card } from "@/components/ui/card";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Select } from "@/components/ui/select";
import { Separator } from "@/components/ui/separator";
import { NumberField } from "@/components/number-field";
import { IncomeField } from "@/components/income-field";
import { FkSourceHint } from "@/components/fk-source-hint";
import { CheckRow } from "@/components/check-row";
import { FlowQuestion } from "@/components/flow-question";
import { InlineCalendar } from "@/components/inline-calendar";
import { GoogleNameButton } from "@/components/google-name";
import {
  type ParentId,
  type ParentInput,
  type PlanInput,
  type TierCount,
} from "@/lib/calc";
import type { GoalMode } from "@/lib/goal-seek";
import { MONEY, isAboveSgiCap, sjukpenningnivaDailyAmount } from "@/lib/rules";
import { formatDate, formatSek } from "@/lib/format";
import {
  addMonths,
  addYears,
  isValidIsoDate,
  parseIsoDate,
  toIsoDate,
} from "@/lib/dates";
import type { ShareableState } from "@/lib/share";
import { cn } from "@/lib/utils";

const CHILD_NUMBERS = [
  { value: 1, label: "Första" },
  { value: 2, label: "Andra" },
  { value: 3, label: "Tredje" },
  { value: 4, label: "Fjärde+" },
];

const BIRTH_COUNTS = [
  { value: 1, label: "Ett barn" },
  { value: 2, label: "Tvillingar" },
  { value: 3, label: "Trillingar" },
  { value: 4, label: "Fyra barn" },
];

const GOAL_MODES: { value: GoalMode; label: string; desc: string }[] = [
  {
    value: "manual",
    label: "Justera själv",
    desc: "Full takt som utgångsläge — finjustera med reglagen på resultatsidan.",
  },
  {
    value: "untilDate",
    label: "Hemma till ett datum",
    desc: "Räkna baklänges från t.ex. förskolestarten — dagar som blir över sparas.",
  },
  {
    value: "budget",
    label: "Så länge budgeten tillåter",
    desc: "Längsta möjliga ledighet där hushållet ändå klarar sin månadsbudget.",
  },
];

/** The first of August after the child's 1st birthday — typical förskolestart. */
function forskolestart(birth: Date): Date {
  const oneYear = addYears(birth, 1);
  const aug = new Date(Date.UTC(oneYear.getUTCFullYear(), 7, 1));
  return aug.getTime() >= oneYear.getTime()
    ? aug
    : new Date(Date.UTC(oneYear.getUTCFullYear() + 1, 7, 1));
}

/** A row of baby-carriage icons — the pictogram for "n children". */
function BabyIcons({ count }: { count: number }) {
  return (
    <span className="text-primary flex items-center justify-center gap-0.5">
      {Array.from({ length: count }, (_, i) => (
        <IconBabyCarriage key={i} className="size-6" />
      ))}
    </span>
  );
}

/** A big, animated selection target used by the choice questions. */
function OptionCard({
  id,
  selected,
  onSelect,
  icon,
  label,
  desc,
}: {
  id: string;
  selected: boolean;
  onSelect: () => void;
  icon?: ReactNode;
  label: string;
  desc?: string;
}) {
  return (
    <button
      type="button"
      id={id}
      onClick={onSelect}
      aria-pressed={selected}
      className={cn(
        "flex min-h-14 w-full flex-col items-center justify-center gap-1.5 rounded-xl border p-3 text-center transition-[transform,border-color,background-color] duration-200 active:scale-95",
        selected
          ? "border-primary bg-secondary/50 shadow-sm"
          : "hover:bg-secondary/30",
      )}
    >
      {icon}
      <span className="text-base font-medium sm:text-sm">{label}</span>
      {desc && (
        <span className="text-muted-foreground text-xs leading-snug">
          {desc}
        </span>
      )}
    </button>
  );
}

export function Wizard({
  form,
  setForm,
  valid,
  onSubmit,
  onReset,
}: {
  form: ShareableState;
  setForm: Dispatch<SetStateAction<ShareableState>>;
  valid: boolean;
  onSubmit: () => void;
  onReset: () => void;
}) {
  const [step, setStep] = useState(1);
  const [advancedOpen, setAdvancedOpen] = useState(false);
  // The question currently in focus (its FlowQuestion id); "" = none.
  const [activeQ, setActiveQ] = useState("q-date");

  const formRef = useRef<HTMLFormElement>(null);

  const FIELD_SELECTOR =
    'input:not([type="checkbox"]):not([type="radio"]):not([type="range"]):not([disabled]), select';

  /** Focusable fields, excluding those inside collapsed (inert) panels. */
  const visibleFields = (root: ParentNode | null): HTMLElement[] =>
    Array.from(root?.querySelectorAll<HTMLElement>(FIELD_SELECTOR) ?? []).filter(
      (el) => !el.closest("[inert]"),
    );

  /** Focus the first visible field in `root` — the keyboard follows along. */
  const focusFieldIn = (root: ParentNode | null) => {
    visibleFields(root)[0]?.focus();
  };

  /**
   * Open a question AND focus its first field in the same user gesture
   * (flushSync) — required for the mobile keyboard to stay open.
   */
  const openQ = (qid: string) => {
    flushSync(() => setActiveQ(qid));
    const panel = document.getElementById(`${qid}-panel`);
    focusFieldIn(panel);
    panel?.scrollIntoView?.({ block: "nearest", behavior: "smooth" });
  };

  const goTo = (s: number, focus = false) => {
    flushSync(() => {
      setStep(s);
      setAdvancedOpen(false);
      setActiveQ(firstQuestionOf(s));
    });
    // Forward nav auto-scrolls via the focused field; on back, start the
    // step from the top instead of inheriting the old scroll depth.
    if (focus) focusFieldIn(formRef.current);
    else window.scrollTo(0, 0);
  };

  const { plan, soloMode, hasUsedDays, detailedUsed } = form;
  const childNumber =
    form.childNumber ?? ((form.hasExtraDays ?? false) ? 2 : 1);
  const doubleDays = form.doubleDays ?? 0;
  const includeLagsta = form.includeLagsta ?? false;
  const firstCaregiver = form.firstCaregiver ?? "A";
  const supplementA = {
    enabled: form.supplementA ?? true,
    months: form.supplementMonthsA ?? 6,
    pct: form.supplementPctA ?? 90,
  };
  const supplementB = {
    enabled: form.supplementB ?? true,
    months: form.supplementMonthsB ?? 6,
    pct: form.supplementPctB ?? 90,
  };
  const extraDaysA = form.extraDaysA ?? 0;
  const extraDaysB = form.extraDaysB ?? 0;
  const nameA = plan.parents.A.name?.trim() || "Vårdnadshavare A";
  const nameB = plan.parents.B.name?.trim() || "Vårdnadshavare B";
  const vabEnabled = form.vabEnabled ?? false;
  const vabChildren = form.vabChildren ?? 1;
  const vabDaysUsedThisYear = form.vabDaysUsedThisYear ?? 0;
  const birthDaysEnabled = form.birthDaysEnabled ?? false;
  const birthDaysCaregiver = form.birthDaysCaregiver ?? "B";
  const birthDaysCount = form.birthDaysCount ?? 10;
  const birth =
    valid && isValidIsoDate(plan.birthDate)
      ? parseIsoDate(plan.birthDate)
      : null;

  const setPlan = (updater: (p: PlanInput) => PlanInput) =>
    setForm((f) => ({ ...f, plan: updater(f.plan) }));
  const setParent = (id: ParentId, next: ParentInput) =>
    setPlan((p) => ({ ...p, parents: { ...p.parents, [id]: next } }));
  const setParentDays = (id: ParentId, daysUsed: TierCount) =>
    setParent(id, { ...plan.parents[id], daysUsed });

  // Always three steps — the number of caregivers is never asked. Step 2 is
  // whoever goes on leave first; step 3 is the other caregiver, with an
  // "I'm alone" opt-out.
  const stepTitles = [
    "Barnet",
    soloMode ? "Du som är hemma" : "Hemma först",
    "Den andra vårdnadshavaren",
  ];
  const stepCount = stepTitles.length;
  const current = Math.min(step, stepCount);
  const visibleIds: ParentId[] = soloMode ? ["A"] : ["A", "B"];
  const canAdvance = current !== 1 || valid;

  // Which caregiver each step edits: step 2 = the one home first.
  const firstId: ParentId = soloMode ? "A" : firstCaregiver;
  const secondId: ParentId = firstId === "A" ? "B" : "A";

  /** The ordered question ids of a caregiver's flow. */
  const cgFlow = (id: ParentId): string[] => {
    const p = id.toLowerCase();
    return [
      `${p}-q-name`,
      `${p}-q-income`,
      `${p}-q-supplement`,
      `${p}-q-goal`,
      `${p}-q-save`,
      ...(childNumber >= 2 ? [`${p}-q-extra`] : []),
    ];
  };

  const flowOf = (s: number): string[] => {
    if (s === 1) return ["q-date", "q-order", "q-count"];
    if (s === 2) return cgFlow(firstId);
    return soloMode ? [] : cgFlow(secondId);
  };

  const firstQuestionOf = (s: number): string => flowOf(s)[0] ?? "";

  /** Collapse the answered question and bring the next one into focus. */
  const advanceQ = (qid: string) => {
    const flow = flowOf(current);
    const next = flow[flow.indexOf(qid) + 1];
    if (next) {
      openQ(next);
    } else {
      flushSync(() => setActiveQ(""));
    }
  };

  // The step's implicit next action (for the mobile keyboard's Enter):
  // advance the open question, then the step, then show the plan.
  const primaryAction = () => {
    const flow = flowOf(current);
    if (activeQ && flow.includes(activeQ)) {
      advanceQ(activeQ);
      return;
    }
    if (current < stepCount) {
      if (canAdvance) goTo(current + 1, true);
      return;
    }
    if (valid) onSubmit();
  };

  // Enter walks through the fields like a checkout: focus the next visible
  // field first; when there is none, run the primary action.
  const onFormKeyDown = (e: React.KeyboardEvent<HTMLFormElement>) => {
    if (e.key !== "Enter") return;
    const el = e.target as HTMLElement;
    if (
      el instanceof HTMLButtonElement ||
      el instanceof HTMLSelectElement ||
      (el instanceof HTMLInputElement &&
        ["checkbox", "radio", "range"].includes(el.type))
    ) {
      return;
    }
    e.preventDefault();
    const fields = visibleFields(formRef.current);
    const next = fields[fields.indexOf(el) + 1];
    if (next) next.focus();
    else primaryAction();
  };

  const setSupplement = (
    id: ParentId,
    s: { enabled: boolean; months: number; pct: number },
  ) =>
    setForm((f) =>
      id === "A"
        ? {
            ...f,
            supplementA: s.enabled,
            supplementMonthsA: s.months,
            supplementPctA: s.pct,
          }
        : {
            ...f,
            supplementB: s.enabled,
            supplementMonthsB: s.months,
            supplementPctB: s.pct,
          },
    );

  /** A "Fortsätt" row inside input questions (choices advance on their own). */
  const continueRow = (qid: string) => (
    <div className="flex justify-end">
      <Button type="button" size="sm" onClick={() => advanceQ(qid)}>
        Fortsätt <IconArrowRight />
      </Button>
    </div>
  );

  /** Collapsed "Avancerade inställningar" section at the bottom of a step. */
  const advanced = (children: ReactNode) => (
    <div className="space-y-4">
      <button
        type="button"
        id="advanced-options"
        onClick={() => setAdvancedOpen((o) => !o)}
        aria-expanded={advancedOpen}
        className="text-muted-foreground hover:text-foreground active:text-foreground flex min-h-11 items-center gap-1.5 text-sm font-medium sm:min-h-0"
      >
        <IconAdjustments className="size-4" />
        Avancerade inställningar
        <IconChevronDown
          className={cn(
            "size-4 transition-transform",
            advancedOpen && "rotate-180",
          )}
        />
      </button>
      {advancedOpen && <div className="space-y-4">{children}</div>}
    </div>
  );

  // ---------------------------------------------------------------------------
  // Step 1: the baby, one question at a time
  // ---------------------------------------------------------------------------

  const babyFlow = (
    <div className="space-y-2">
      <FlowQuestion
        id="q-date"
        label="Födelsedatum (eller beräknat)"
        value={birth ? formatDate(birth) : null}
        open={activeQ === "q-date"}
        answered={birth != null}
        onOpen={() => openQ("q-date")}
      >
        <InlineCalendar
          value={plan.birthDate}
          inputId="birth-date"
          onPick={(iso) => {
            setPlan((p) => ({ ...p, birthDate: iso }));
            advanceQ("q-date");
          }}
        />
      </FlowQuestion>

      <FlowQuestion
        id="q-order"
        label="Vilket barn i ordningen?"
        value={
          CHILD_NUMBERS.find((c) => c.value === childNumber)?.label ?? "Första"
        }
        open={activeQ === "q-order"}
        answered
        onOpen={() => openQ("q-order")}
      >
        <div className="grid grid-cols-2 gap-2 sm:grid-cols-4">
          {CHILD_NUMBERS.map((c) => (
            <OptionCard
              key={c.value}
              id={`child-number-${c.value}`}
              selected={childNumber === c.value}
              icon={<BabyIcons count={c.value} />}
              label={c.label}
              onSelect={() => {
                setForm((f) => ({
                  ...f,
                  childNumber: c.value,
                  hasExtraDays: c.value >= 2,
                }));
                advanceQ("q-order");
              }}
            />
          ))}
        </div>
        {childNumber >= 2 && (
          <p className="text-muted-foreground text-xs">
            Varje barn har sin egen pott på 480 dagar. Dagar som finns kvar från
            tidigare barn anger du hos respektive vårdnadshavare.
          </p>
        )}
      </FlowQuestion>

      <FlowQuestion
        id="q-count"
        label="Hur många barn i födseln?"
        value={
          BIRTH_COUNTS.find((c) => c.value === plan.childrenInBirth)?.label ??
          "Ett barn"
        }
        open={activeQ === "q-count"}
        answered
        onOpen={() => openQ("q-count")}
      >
        <div className="grid grid-cols-2 gap-2 sm:grid-cols-4">
          {BIRTH_COUNTS.map((c) => (
            <OptionCard
              key={c.value}
              id={`birth-count-${c.value}`}
              selected={plan.childrenInBirth === c.value}
              icon={<BabyIcons count={c.value} />}
              label={c.label}
              onSelect={() => {
                setPlan((p) => ({ ...p, childrenInBirth: c.value }));
                advanceQ("q-count");
              }}
            />
          ))}
        </div>
        {plan.childrenInBirth >= 2 && (
          <p className="text-muted-foreground text-xs">
            Flerbarnsfödsel ger extra dagar utöver de 480.
          </p>
        )}
      </FlowQuestion>
    </div>
  );

  // ---------------------------------------------------------------------------
  // Steps 2 & 3: one caregiver, one question at a time
  // ---------------------------------------------------------------------------

  const caregiverFlow = (id: ParentId) => {
    const prefix = id.toLowerCase();
    const value = plan.parents[id];
    const income = value.grossMonthlyIncome;
    const aboveCap = value.incomeAboveCap ?? false;
    const rate = sjukpenningnivaDailyAmount(income);
    const supplement = id === "A" ? supplementA : supplementB;
    const mode = (id === "A" ? form.goalModeA : form.goalModeB) ?? "manual";
    const dateStr = (id === "A" ? form.goalDateA : form.goalDateB) ?? "";
    const budget = (id === "A" ? form.goalBudgetA : form.goalBudgetB) ?? 25000;
    const saveDays = (id === "A" ? form.saveDaysA : form.saveDaysB) ?? 0;
    const extraDays = id === "A" ? extraDaysA : extraDaysB;
    const displayName =
      value.name?.trim() || (soloMode ? "Du" : `Vårdnadshavare ${id}`);
    const goalName =
      value.name?.trim() || (soloMode ? "du" : `Vårdnadshavare ${id}`);
    const amountHint =
      income > 0
        ? isAboveSgiCap(income)
          ? `Över taket – ${formatSek(rate)}/dag (högsta belopp)`
          : `Ger ca ${formatSek(rate)}/dag på sjukpenningnivå`
        : "Vet du bara nettolönen? Brutto ≈ netto × 1,5.";
    const capHint = `Räknar med högsta beloppet, ${formatSek(
      MONEY.maxSjukpenningPerDay,
    )}/dag (inkomst över ${formatSek(MONEY.sgiAnnualCap)}/år).`;
    const setGoal = (patch: {
      mode?: GoalMode;
      dateStr?: string;
      budget?: number;
    }) =>
      setForm((f) =>
        id === "A"
          ? {
              ...f,
              ...(patch.mode !== undefined ? { goalModeA: patch.mode } : {}),
              ...(patch.dateStr !== undefined
                ? { goalDateA: patch.dateStr }
                : {}),
              ...(patch.budget !== undefined
                ? { goalBudgetA: patch.budget }
                : {}),
            }
          : {
              ...f,
              ...(patch.mode !== undefined ? { goalModeB: patch.mode } : {}),
              ...(patch.dateStr !== undefined
                ? { goalDateB: patch.dateStr }
                : {}),
              ...(patch.budget !== undefined
                ? { goalBudgetB: patch.budget }
                : {}),
            },
      );

    const presets = birth
      ? [
          { label: "Förskolestart", date: forskolestart(birth) },
          { label: "1,5 år", date: addMonths(birth, 18) },
          { label: "2 år", date: addYears(birth, 2) },
        ]
      : [];

    const goalValue =
      mode === "untilDate"
        ? dateStr && isValidIsoDate(dateStr)
          ? `Hemma till ${formatDate(parseIsoDate(dateStr))}`
          : "Hemma till ett datum"
        : mode === "budget"
          ? `Budget ≥ ${formatSek(budget)}/mån`
          : "Justera själv";

    return (
      <div className="space-y-2">
        <FlowQuestion
          id={`${prefix}-q-name`}
          label="Namn"
          value={displayName}
          open={activeQ === `${prefix}-q-name`}
          answered
          onOpen={() => openQ(`${prefix}-q-name`)}
        >
          <div className="space-y-1.5">
            <Label htmlFor={`${prefix}-name`}>Namn (valfritt)</Label>
            <Input
              id={`${prefix}-name`}
              autoComplete="given-name"
              autoCapitalize="words"
              value={value.name ?? ""}
              placeholder={soloMode ? "Ditt namn" : `Vårdnadshavare ${id}`}
              onChange={(e) => setParent(id, { ...value, name: e.target.value })}
            />
          </div>
          {/* The person filling this in is usually the first caregiver —
              offer their Google name as the default (prefills only when the
              field is empty). */}
          {id === firstId && (
            <GoogleNameButton
              onName={(n) =>
                setParent(id, {
                  ...value,
                  name: value.name?.trim() ? value.name : n,
                })
              }
            />
          )}
          {continueRow(`${prefix}-q-name`)}
        </FlowQuestion>

        <FlowQuestion
          id={`${prefix}-q-income`}
          label="Månadslön"
          value={
            aboveCap
              ? "Över taket"
              : income > 0
                ? `${formatSek(income)}/mån`
                : null
          }
          open={activeQ === `${prefix}-q-income`}
          answered={aboveCap || income > 0}
          onOpen={() => openQ(`${prefix}-q-income`)}
        >
          <IncomeField
            id={`${prefix}-income`}
            label="Bruttolön per månad (kr)"
            value={income}
            aboveCap={aboveCap}
            onValueChange={(n) =>
              setParent(id, { ...value, grossMonthlyIncome: n })
            }
            onAboveCapChange={(b) =>
              setParent(id, { ...value, incomeAboveCap: b })
            }
            amountHint={amountHint}
            capHint={capHint}
          />
          {continueRow(`${prefix}-q-income`)}
        </FlowQuestion>

        <FlowQuestion
          id={`${prefix}-q-supplement`}
          label="Föräldralön"
          value={
            supplement.enabled
              ? `Ja · ${supplement.pct} % i ${supplement.months} mån`
              : "Ingen"
          }
          open={activeQ === `${prefix}-q-supplement`}
          answered
          onOpen={() => openQ(`${prefix}-q-supplement`)}
        >
          <div className="grid grid-cols-2 gap-2">
            <OptionCard
              id={`${prefix}-supplement-yes`}
              selected={supplement.enabled}
              label="Ja, via kollektivavtal"
              desc={`Vanligast — fyller upp till ca ${supplement.pct} % i ${supplement.months} mån. Justera under Avancerat.`}
              onSelect={() => {
                setSupplement(id, { ...supplement, enabled: true });
                advanceQ(`${prefix}-q-supplement`);
              }}
            />
            <OptionCard
              id={`${prefix}-supplement-no`}
              selected={!supplement.enabled}
              label="Nej, ingen föräldralön"
              desc="Inget kollektivavtal eller ingen förmån hos arbetsgivaren."
              onSelect={() => {
                setSupplement(id, { ...supplement, enabled: false });
                advanceQ(`${prefix}-q-supplement`);
              }}
            />
          </div>
        </FlowQuestion>

        <FlowQuestion
          id={`${prefix}-q-goal`}
          label={`Vad vill ${goalName} uppnå?`}
          value={goalValue}
          open={activeQ === `${prefix}-q-goal`}
          answered
          onOpen={() => openQ(`${prefix}-q-goal`)}
        >
          <div className="grid gap-2">
            {GOAL_MODES.map((m) => (
              <OptionCard
                key={m.value}
                id={`${prefix}-goal-${m.value}`}
                selected={mode === m.value}
                label={m.label}
                desc={m.desc}
                onSelect={() => {
                  setGoal({ mode: m.value });
                  // Manual needs nothing more; the other two open their input.
                  if (m.value === "manual") advanceQ(`${prefix}-q-goal`);
                }}
              />
            ))}
          </div>

          {mode === "untilDate" && (
            <div className="space-y-2 pt-1">
              {presets.length > 0 && (
                <div className="flex flex-wrap gap-2">
                  {presets.map((p) => (
                    <button
                      key={p.label}
                      type="button"
                      onClick={() => {
                        setGoal({ dateStr: toIsoDate(p.date) });
                        advanceQ(`${prefix}-q-goal`);
                      }}
                      className="text-muted-foreground hover:text-foreground active:bg-secondary/60 min-h-10 rounded-full border px-3.5 py-1 text-sm sm:min-h-0 sm:px-3 sm:text-xs"
                    >
                      {p.label} · {formatDate(p.date)}
                    </button>
                  ))}
                </div>
              )}
              <InlineCalendar
                value={dateStr}
                inputId={`${prefix}-goal-date`}
                yearsBack={0}
                yearsForward={3}
                onPick={(iso) => {
                  setGoal({ dateStr: iso });
                  advanceQ(`${prefix}-q-goal`);
                }}
              />
            </div>
          )}

          {mode === "budget" && (
            <div className="space-y-3 pt-1">
              <NumberField
                id={`${prefix}-goal-budget-floor`}
                label="Hushållets lägsta inkomst efter skatt (kr/mån)"
                value={budget}
                step={1000}
                slider
                sliderMax={60000}
                onChange={(kr) =>
                  setGoal({ budget: Math.max(0, Math.round(kr)) })
                }
                hint="Perioden tas i den långsammaste takt som ändå klarar golvet — så räcker ledigheten så länge som möjligt."
              />
              {continueRow(`${prefix}-q-goal`)}
            </div>
          )}
        </FlowQuestion>

        <FlowQuestion
          id={`${prefix}-q-save`}
          label="Spara dagar?"
          value={saveDays > 0 ? `${saveDays} dagar` : "Inga"}
          open={activeQ === `${prefix}-q-save`}
          answered
          onOpen={() => openQ(`${prefix}-q-save`)}
        >
          <NumberField
            id={`${prefix}-save-days`}
            label="Dagar att spara till senare"
            value={saveDays}
            min={0}
            stepper
            slider
            sliderMax={200}
            onChange={(n) =>
              setForm((f) =>
                id === "A" ? { ...f, saveDaysA: n } : { ...f, saveDaysB: n },
              )
            }
            hint="Till klämdagar, lov och inskolning. Högst 96 dagar totalt får finnas kvar efter 4-årsdagen."
          />
          {continueRow(`${prefix}-q-save`)}
        </FlowQuestion>

        {childNumber >= 2 && (
          <FlowQuestion
            id={`${prefix}-q-extra`}
            label="Dagar från tidigare barn"
            value={extraDays > 0 ? `${extraDays} dagar` : "Inga"}
            open={activeQ === `${prefix}-q-extra`}
            answered
            onOpen={() => openQ(`${prefix}-q-extra`)}
          >
            <NumberField
              id={`${prefix}-extra`}
              label="Sparade dagar kvar från tidigare barn"
              value={extraDays}
              stepper
              slider
              sliderMax={200}
              onChange={(n) =>
                setForm((f) =>
                  id === "A" ? { ...f, extraDaysA: n } : { ...f, extraDaysB: n },
                )
              }
              hint="De följer det äldre barnets tidsgränser — inkomstbaserade tas ut innan det barnet fyller 4 år."
            />
            {continueRow(`${prefix}-q-extra`)}
          </FlowQuestion>
        )}
      </div>
    );
  };

  /** Advanced per-caregiver details: the 240-day rule + föräldralön terms. */
  const caregiverAdvanced = (id: ParentId) => {
    const prefix = id.toLowerCase();
    const value = plan.parents[id];
    const supplement = id === "A" ? supplementA : supplementB;
    const aboveCap = value.incomeAboveCap ?? false;
    return (
      <div className="space-y-3">
        <CheckRow
          id={`${prefix}-240`}
          checked={value.meets240DayRule !== false}
          onChange={(b) => setParent(id, { ...value, meets240DayRule: b })}
        >
          <span className="font-normal">
            Har haft inkomst (SGI) i minst 240 dagar före födseln
          </span>
        </CheckRow>
        {value.meets240DayRule === false && (
          <p className="text-muted-foreground -mt-1 text-xs">
            De första 180 dagarna betalas då på grundnivå (250 kr/dag) i
            stället för på sjukpenningnivå.
          </p>
        )}

        {supplement.enabled && (
          <div className="space-y-3">
            {aboveCap && (
              <NumberField
                id={`${prefix}-supp-salary`}
                label="Faktisk månadslön (brutto)"
                value={value.grossMonthlyIncome}
                step={1000}
                slider
                sliderMax={100000}
                onChange={(n) =>
                  setParent(id, { ...value, grossMonthlyIncome: n })
                }
                hint="Behövs för att räkna föräldralön på lönedelar över taket."
              />
            )}
            <div className="grid grid-cols-2 gap-3">
              <NumberField
                id={`${prefix}-supp-months`}
                label="Föräldralön: månader"
                value={supplement.months}
                min={0}
                max={24}
                stepper
                slider
                onChange={(n) =>
                  setSupplement(id, { ...supplement, months: n })
                }
              />
              <NumberField
                id={`${prefix}-supp-pct`}
                label="Fyller upp till (% av lön)"
                value={supplement.pct}
                min={0}
                max={100}
                step={5}
                stepper
                slider
                onChange={(n) => setSupplement(id, { ...supplement, pct: n })}
              />
            </div>
            <p className="text-muted-foreground text-xs">
              Många kollektivavtal fyller upp till ca 90 % av lönen i ungefär 6
              månader — och kompenserar då även lönedelar över taket.
            </p>
          </div>
        )}
      </div>
    );
  };

  /** Optional extras (vab, 10-dagar, dubbeldagar) on the last step. */
  const extrasAdvanced = (
    <div className="space-y-4">
      {!soloMode && (
        <NumberField
          id="double-days"
          label="Dubbeldagar (båda hemma samtidigt)"
          value={doubleDays}
          min={0}
          max={60}
          stepper
          slider
          onChange={(n) => setForm((f) => ({ ...f, doubleDays: n }))}
          hint="Varje dubbeldag kostar 2 dagar ur potten (max 60, före 15 mån)."
        />
      )}

      <CheckRow
        id="vab-enabled"
        checked={vabEnabled}
        onChange={(b) => setForm((f) => ({ ...f, vabEnabled: b }))}
      >
        Planera även vab (vård av sjukt barn)
      </CheckRow>
      {vabEnabled && (
        <>
          <div className="grid grid-cols-2 gap-3">
            <div className="space-y-1.5">
              <Label htmlFor="vab-children">Antal barn (för vab)</Label>
              <Select
                id="vab-children"
                value={vabChildren}
                onChange={(e) =>
                  setForm((f) => ({
                    ...f,
                    vabChildren: Number(e.target.value),
                  }))
                }
              >
                {[1, 2, 3, 4, 5, 6].map((n) => (
                  <option key={n} value={n}>
                    {n} barn
                  </option>
                ))}
              </Select>
            </div>
            <NumberField
              id="vab-used"
              label="Vab-dagar uttagna i år"
              value={vabDaysUsedThisYear}
              stepper
              slider
              sliderMax={240}
              onChange={(n) =>
                setForm((f) => ({ ...f, vabDaysUsedThisYear: n }))
              }
            />
          </div>
          <FkSourceHint what="Uttagna vab-dagar" />
        </>
      )}

      {!soloMode && (
        <>
          <CheckRow
            id="birth-days-enabled"
            checked={birthDaysEnabled}
            onChange={(b) => setForm((f) => ({ ...f, birthDaysEnabled: b }))}
          >
            10 dagar vid barns födelse (tillfällig föräldrapenning)
          </CheckRow>
          {birthDaysEnabled && (
            <>
              <div className="grid grid-cols-2 gap-3">
                <div className="space-y-1.5">
                  <Label htmlFor="birth-days-who">Vem tar ut dagarna?</Label>
                  <Select
                    id="birth-days-who"
                    value={birthDaysCaregiver}
                    onChange={(e) =>
                      setForm((f) => ({
                        ...f,
                        birthDaysCaregiver: e.target.value as "A" | "B",
                      }))
                    }
                  >
                    <option value="A">{nameA}</option>
                    <option value="B">{nameB}</option>
                  </Select>
                </div>
                <NumberField
                  id="birth-days-count"
                  label="Antal dagar (max 10)"
                  value={birthDaysCount}
                  min={0}
                  max={10}
                  stepper
                  slider
                  onChange={(n) =>
                    setForm((f) => ({ ...f, birthDaysCount: n }))
                  }
                />
              </div>
              <p className="text-muted-foreground text-xs">
                Den andra vårdnadshavarens dagar i samband med födseln — utöver
                de 480. Tas ut inom 60 dagar efter hemkomsten.
              </p>
            </>
          )}
        </>
      )}
    </div>
  );

  return (
    <Card className="mx-auto max-w-2xl gap-0 py-0 max-sm:-mx-4 max-sm:rounded-none max-sm:border-x-0">
      <form
        ref={formRef}
        onSubmit={(e) => e.preventDefault()}
        onKeyDown={onFormKeyDown}
      >
        {/* Compact progress header — stays pinned while the step scrolls. */}
        <div className="bg-card/95 sticky top-0 z-30 space-y-2 border-b px-4 py-3 backdrop-blur sm:rounded-t-xl sm:px-6">
          <div className="flex items-center justify-between text-xs font-medium">
            <span className="text-muted-foreground">
              Steg {current} av {stepCount}
            </span>
            <span>{stepTitles[current - 1]}</span>
          </div>
          <div className="flex gap-1.5">
            {stepTitles.map((t, i) => (
              <div
                key={t}
                className={cn(
                  "h-1.5 flex-1 rounded-full transition-colors duration-300",
                  i < current ? "bg-primary" : "bg-muted",
                )}
              />
            ))}
          </div>
        </div>

        <div key={current} className="animate-flow-in space-y-5 px-4 py-5 sm:px-6">
          {current === 1 && (
            <>
              <p className="text-muted-foreground text-xs">
                Allt räknas ut och sparas lokalt i din webbläsare — inget
                skickas.
              </p>
              {babyFlow}
              {!valid && (
                <p className="text-destructive text-xs">
                  Ange ett giltigt födelse- eller beräknat datum.
                </p>
              )}

              <Separator />
              {advanced(
                <>
                  <div className="space-y-3">
                    <CheckRow
                      id="has-used"
                      checked={hasUsedDays}
                      onChange={(b) =>
                        setForm((f) => ({ ...f, hasUsedDays: b }))
                      }
                    >
                      {soloMode
                        ? "Jag har redan tagit ut dagar för det här barnet"
                        : "Vi har redan tagit ut dagar för det här barnet"}
                    </CheckRow>

                    {hasUsedDays && (
                      <div className="space-y-3">
                        <CheckRow
                          id="detailed-used"
                          checked={detailedUsed}
                          onChange={(b) =>
                            setForm((f) => ({ ...f, detailedUsed: b }))
                          }
                        >
                          <span className="text-muted-foreground font-normal">
                            Ange nivåer separat (sjukpenning/lägsta)
                          </span>
                        </CheckRow>

                        {visibleIds.map((id) => {
                          const p = plan.parents[id];
                          const who =
                            p.name?.trim() ||
                            (soloMode ? "dig" : `Vårdnadshavare ${id}`);
                          const suffix =
                            visibleIds.length > 1 ? ` – ${who}` : "";
                          return detailedUsed ? (
                            <div key={id} className="grid grid-cols-2 gap-3">
                              <NumberField
                                id={`${id.toLowerCase()}-used-sjuk`}
                                label={`Sjukpenningdagar${suffix}`}
                                value={p.daysUsed.sjukpenning}
                                stepper
                                slider
                                sliderMax={390}
                                onChange={(n) =>
                                  setParentDays(id, {
                                    sjukpenning: n,
                                    lagsta: p.daysUsed.lagsta,
                                  })
                                }
                              />
                              <NumberField
                                id={`${id.toLowerCase()}-used-lagsta`}
                                label={`Lägstanivådagar${suffix}`}
                                value={p.daysUsed.lagsta}
                                stepper
                                slider
                                sliderMax={90}
                                onChange={(n) =>
                                  setParentDays(id, {
                                    sjukpenning: p.daysUsed.sjukpenning,
                                    lagsta: n,
                                  })
                                }
                              />
                            </div>
                          ) : (
                            <NumberField
                              key={id}
                              id={`${id.toLowerCase()}-used`}
                              label={`Uttagna dagar${suffix}`}
                              value={
                                p.daysUsed.sjukpenning + p.daysUsed.lagsta
                              }
                              stepper
                              slider
                              sliderMax={480}
                              onChange={(n) =>
                                setParentDays(id, {
                                  sjukpenning: n,
                                  lagsta: 0,
                                })
                              }
                            />
                          );
                        })}
                        <FkSourceHint what="Uttagna dagar" />
                      </div>
                    )}
                  </div>

                  <div className="space-y-2">
                    <CheckRow
                      id="include-lagsta"
                      checked={includeLagsta}
                      onChange={(b) =>
                        setForm((f) => ({ ...f, includeLagsta: b }))
                      }
                    >
                      Ta ut lägstanivådagarna (90 dagar à 180 kr)
                    </CheckRow>
                    <p className="text-muted-foreground text-xs">
                      {includeLagsta
                        ? "Lägstanivådagarna läggs till sist och förlänger ledigheten, men ger bara 180 kr/dag."
                        : "Ledigheten slutar när de inkomstbaserade dagarna tar slut. De 90 lägstanivådagarna sparas — de kan tas ut senare (180 kr/dag) eller sparas tills barnet fyller 12."}
                    </p>
                  </div>
                </>,
              )}
            </>
          )}

          {current === 2 && (
            <>
              <p className="text-muted-foreground text-sm">
                {soloMode
                  ? "Dina uppgifter — du har alla dagarna."
                  : "Vem går på ledighet först? Ofta den som fött barnet. Fyll i den personens uppgifter här."}
              </p>

              {caregiverFlow(firstId)}

              <Separator />
              {advanced(caregiverAdvanced(firstId))}
            </>
          )}

          {current === 3 && (
            <>
              <CheckRow
                id="solo-mode"
                checked={soloMode}
                onChange={(b) =>
                  setForm((f) => ({
                    ...f,
                    soloMode: b,
                    ...(b ? { firstCaregiver: "A" as const } : {}),
                  }))
                }
              >
                Jag planerar ensam — det finns ingen andra vårdnadshavare
              </CheckRow>

              {soloMode ? (
                <p className="text-muted-foreground text-sm">
                  Alla dagar tillhör dig. Planen räknas för en vårdnadshavare.
                </p>
              ) : (
                <>
                  <p className="text-muted-foreground text-sm">
                    {plan.parents[secondId].name?.trim() ||
                      `Vårdnadshavare ${secondId}`}{" "}
                    tar över när{" "}
                    {plan.parents[firstId].name?.trim() ||
                      `Vårdnadshavare ${firstId}`}{" "}
                    är klar.
                  </p>

                  {caregiverFlow(secondId)}
                </>
              )}

              <Separator />
              {advanced(
                <>
                  {!soloMode && caregiverAdvanced(secondId)}
                  {extrasAdvanced}
                </>,
              )}
            </>
          )}
        </div>

        {/* Nav — pinned to the bottom of the screen, above the keyboard. */}
        <div className="bg-card/95 sticky bottom-0 z-30 flex items-center justify-between gap-2 border-t px-4 pt-3 pb-[calc(0.75rem+env(safe-area-inset-bottom))] backdrop-blur sm:rounded-b-xl sm:px-6">
          <Button
            type="button"
            variant="ghost"
            onClick={current === 1 ? onReset : () => goTo(current - 1)}
          >
            {current === 1 ? (
              <>
                <IconRefresh /> Börja om
              </>
            ) : (
              <>
                <IconArrowLeft /> Bakåt
              </>
            )}
          </Button>

          {current < stepCount ? (
            <Button
              type="button"
              disabled={!canAdvance}
              onClick={() => goTo(current + 1, true)}
            >
              Nästa <IconArrowRight />
            </Button>
          ) : (
            <Button type="button" disabled={!valid} onClick={onSubmit}>
              Visa plan <IconArrowRight />
            </Button>
          )}
        </div>
      </form>
    </Card>
  );
}
