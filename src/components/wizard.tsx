"use client";

import {
  useRef,
  useState,
  type Dispatch,
  type SetStateAction,
} from "react";
import { flushSync } from "react-dom";
import {
  IconAdjustments,
  IconArrowLeft,
  IconArrowRight,
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
import { CaregiverGoalControl } from "@/components/goal-picker";
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
import { isValidIsoDate, parseIsoDate } from "@/lib/dates";
import type { ShareableState } from "@/lib/share";
import { cn } from "@/lib/utils";

const CHILD_NUMBERS = [
  { value: 1, label: "Första" },
  { value: 2, label: "Andra" },
  { value: 3, label: "Tredje" },
  { value: 4, label: "Fjärde eller senare" },
];

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
  // Which accordion section is open within a caregiver step (checkout-style).
  const [section, setSection] = useState(0);

  const formRef = useRef<HTMLFormElement>(null);

  const FIELD_SELECTOR =
    'input:not([type="checkbox"]):not([type="radio"]):not([type="range"]):not([disabled]), select';

  /** Focus the first field in `root` — the keyboard follows the flow. */
  const focusFieldIn = (root: ParentNode | null) => {
    root?.querySelector<HTMLElement>(FIELD_SELECTOR)?.focus();
  };

  const SECTION_KEYS = ["name", "economy", "goals"] as const;

  /**
   * Open an accordion section AND focus its first field in the same user
   * gesture (flushSync) — required for the mobile keyboard to stay open.
   */
  const openSectionAndFocus = (prefix: string, index: number) => {
    flushSync(() => setSection(index));
    focusFieldIn(
      document.getElementById(`${prefix}-section-${SECTION_KEYS[index]}-panel`),
    );
  };

  const goTo = (s: number, focus = false) => {
    flushSync(() => {
      setStep(s);
      setAdvancedOpen(false);
      setSection(0);
    });
    if (focus) focusFieldIn(formRef.current);
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
  const twins = plan.childrenInBirth >= 2;
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

  // The step's implicit next action (for the mobile keyboard's Enter):
  // advance the open accordion section, then the step, then show the plan.
  const primaryAction = () => {
    const inAccordion =
      current >= 2 && !(current === 3 && soloMode) && section < 2;
    if (inAccordion) {
      const prefix = (current === 2 ? firstId : secondId).toLowerCase();
      openSectionAndFocus(prefix, section + 1);
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
    const fields = Array.from(
      formRef.current?.querySelectorAll<HTMLElement>(FIELD_SELECTOR) ?? [],
    );
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

  /** Collapsed "Avancerade inställningar" section at the bottom of a step. */
  const advanced = (children: React.ReactNode) => (
    <div className="space-y-4">
      <button
        type="button"
        id="advanced-options"
        onClick={() => setAdvancedOpen((o) => !o)}
        aria-expanded={advancedOpen}
        className="text-muted-foreground hover:text-foreground flex min-h-11 items-center gap-1.5 text-sm font-medium sm:min-h-0"
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

  /** One checkout-style accordion section: number, title, summary, content. */
  const sectionShell = (opts: {
    prefix: string;
    sectionKey: string;
    index: number;
    title: string;
    summary: string;
    last?: boolean;
    children: React.ReactNode;
  }) => {
    const open = section === opts.index;
    return (
      <div
        key={opts.sectionKey}
        className={cn("rounded-lg border", open && "border-primary/50")}
      >
        <button
          type="button"
          id={`${opts.prefix}-section-${opts.sectionKey}`}
          onClick={() => openSectionAndFocus(opts.prefix, opts.index)}
          aria-expanded={open}
          className="flex min-h-12 w-full items-center gap-2.5 p-3 text-left sm:min-h-0"
        >
          <span
            className={cn(
              "flex size-6 shrink-0 items-center justify-center rounded-full text-xs font-semibold sm:size-5 sm:text-[11px]",
              open
                ? "bg-primary text-primary-foreground"
                : "bg-muted text-muted-foreground",
            )}
          >
            {opts.index + 1}
          </span>
          <span className="shrink-0 text-base font-medium sm:text-sm">{opts.title}</span>
          {!open && (
            <span className="text-muted-foreground ml-auto min-w-0 truncate text-xs">
              {opts.summary}
            </span>
          )}
        </button>
        {open && (
          <div
            id={`${opts.prefix}-section-${opts.sectionKey}-panel`}
            className="space-y-3 border-t p-3"
          >
            {opts.children}
            {!opts.last && (
              <div className="flex justify-end">
                <Button
                  type="button"
                  size="sm"
                  variant="outline"
                  onClick={() =>
                    openSectionAndFocus(opts.prefix, opts.index + 1)
                  }
                >
                  Fortsätt <IconArrowRight />
                </Button>
              </div>
            )}
          </div>
        )}
      </div>
    );
  };

  /**
   * A caregiver's questions as accordion sections (like an ecommerce
   * checkout): name → salary & benefits → goals & saved days.
   */
  const caregiverAccordion = (id: ParentId) => {
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

    const economySummary = [
      aboveCap
        ? "Över taket"
        : income > 0
          ? `${formatSek(income)}/mån`
          : "Ange lön",
      supplement.enabled
        ? `föräldralön ${supplement.pct} % i ${supplement.months} mån`
        : "ingen föräldralön",
    ].join(" · ");
    const goalSummary = [
      mode === "untilDate"
        ? dateStr && isValidIsoDate(dateStr)
          ? `Hemma till ${formatDate(parseIsoDate(dateStr))}`
          : "Hemma till ett datum"
        : mode === "budget"
          ? "Inom budget"
          : "Justera själv",
      ...(saveDays > 0 ? [`sparar ${saveDays} dagar`] : []),
    ].join(" · ");

    return (
      <div className="space-y-2">
        {sectionShell({
          prefix,
          sectionKey: "name",
          index: 0,
          title: "Namn",
          summary: displayName,
          children: (
            <>
              <div className="space-y-1.5">
                <Label htmlFor={`${prefix}-name`}>Namn (valfritt)</Label>
                <Input
                  id={`${prefix}-name`}
                  value={value.name ?? ""}
                  placeholder={soloMode ? "Ditt namn" : `Vårdnadshavare ${id}`}
                  onChange={(e) =>
                    setParent(id, { ...value, name: e.target.value })
                  }
                />
              </div>
              {/* The person filling this in is usually the first caregiver —
                  offer their Google name as the default (prefills only when
                  the field is empty). */}
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
            </>
          ),
        })}

        {sectionShell({
          prefix,
          sectionKey: "economy",
          index: 1,
          title: "Lön & förmåner",
          summary: economySummary,
          children: (
            <>
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
              {/* Employer top-up: most collective agreements have one, so it's
                  on by default — details (percent, months) under Avancerat. */}
              <CheckRow
                id={`${prefix}-no-supplement`}
                checked={!supplement.enabled}
                onChange={(b) =>
                  setSupplement(id, { ...supplement, enabled: !b })
                }
              >
                <span className="font-normal">
                  Ingen föräldralön från arbetsgivaren (inget kollektivavtal)
                </span>
              </CheckRow>
              {supplement.enabled && (
                <p className="text-muted-foreground -mt-1 text-xs">
                  Räknar med föräldralön som fyller upp till {supplement.pct} %
                  av lönen i {supplement.months} månader — justera under
                  Avancerade inställningar.
                </p>
              )}
            </>
          ),
        })}

        {sectionShell({
          prefix,
          sectionKey: "goals",
          index: 2,
          title: "Mål & sparade dagar",
          summary: goalSummary,
          last: true,
          children: (
            <>
              <CaregiverGoalControl
                idPrefix={prefix}
                name={goalName}
                mode={mode}
                dateStr={dateStr}
                budget={budget}
                birth={birth}
                onMode={(m: GoalMode) =>
                  setForm((f) =>
                    id === "A"
                      ? { ...f, goalModeA: m }
                      : { ...f, goalModeB: m },
                  )
                }
                onDate={(iso) =>
                  setForm((f) =>
                    id === "A"
                      ? { ...f, goalDateA: iso }
                      : { ...f, goalDateB: iso },
                  )
                }
                onBudget={(kr) =>
                  setForm((f) =>
                    id === "A"
                      ? { ...f, goalBudgetA: Math.max(0, Math.round(kr)) }
                      : { ...f, goalBudgetB: Math.max(0, Math.round(kr)) },
                  )
                }
              />

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
                    id === "A"
                      ? { ...f, saveDaysA: n }
                      : { ...f, saveDaysB: n },
                  )
                }
                hint="Till klämdagar, lov och inskolning. Högst 96 dagar totalt får finnas kvar efter 4-årsdagen."
              />

              {childNumber >= 2 && (
                <NumberField
                  id={`${prefix}-extra`}
                  label="Sparade dagar kvar från tidigare barn"
                  value={extraDays}
                  stepper
                  slider
                  sliderMax={200}
                  onChange={(n) =>
                    setForm((f) =>
                      id === "A"
                        ? { ...f, extraDaysA: n }
                        : { ...f, extraDaysB: n },
                    )
                  }
                  hint="De följer det äldre barnets tidsgränser — inkomstbaserade tas ut innan det barnet fyller 4 år."
                />
              )}
            </>
          ),
        })}
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
                className={`h-1.5 flex-1 rounded-full ${
                  i < current ? "bg-primary" : "bg-muted"
                }`}
              />
            ))}
          </div>
        </div>

        <div className="space-y-5 px-4 py-5 sm:px-6">
        {current === 1 && (
          <>
            <p className="text-muted-foreground text-xs">
              Allt räknas ut och sparas lokalt i din webbläsare — inget
              skickas.
            </p>
            <div className="space-y-1.5">
              <Label htmlFor="birth-date">Födelsedatum (eller beräknat)</Label>
              <Input
                id="birth-date"
                type="date"
                value={plan.birthDate}
                onChange={(e) =>
                  setPlan((p) => ({ ...p, birthDate: e.target.value }))
                }
                className="max-w-48"
              />
            </div>
            {!valid && (
              <p className="text-destructive text-xs">
                Ange ett giltigt födelse- eller beräknat datum.
              </p>
            )}

            <div className="space-y-2">
              <Label>Vilket barn i ordningen?</Label>
              <div className="grid grid-cols-2 gap-2 sm:grid-cols-4">
                {CHILD_NUMBERS.map((c) => (
                  <label
                    key={c.value}
                    className={`flex min-h-12 cursor-pointer items-center gap-2.5 rounded-lg border p-3 text-base sm:min-h-0 sm:gap-2 sm:p-2.5 sm:text-sm ${
                      childNumber === c.value
                        ? "border-primary bg-secondary/40"
                        : ""
                    }`}
                  >
                    <input
                      type="radio"
                      id={`child-number-${c.value}`}
                      name="child-number"
                      checked={childNumber === c.value}
                      onChange={() =>
                        setForm((f) => ({
                          ...f,
                          childNumber: c.value,
                          hasExtraDays: c.value >= 2,
                        }))
                      }
                      className="accent-primary size-5 shrink-0 sm:size-4"
                    />
                    {c.label}
                  </label>
                ))}
              </div>
              {childNumber >= 2 && (
                <p className="text-muted-foreground text-xs">
                  Varje barn har sin egen pott på 480 dagar. Dagar som finns
                  kvar från tidigare barn anger du hos respektive
                  vårdnadshavare i nästa steg.
                </p>
              )}
            </div>

            <div className="space-y-2">
              <CheckRow
                id="twins"
                checked={twins}
                onChange={(b) =>
                  setPlan((p) => ({ ...p, childrenInBirth: b ? 2 : 1 }))
                }
              >
                Flerbarnsfödsel (tvillingar eller fler)
              </CheckRow>
              {twins && (
                <div className="space-y-1.5">
                  <Select
                    id="children"
                    value={plan.childrenInBirth}
                    onChange={(e) =>
                      setPlan((p) => ({
                        ...p,
                        childrenInBirth: Number(e.target.value),
                      }))
                    }
                  >
                    <option value={2}>2 (tvillingar)</option>
                    <option value={3}>3 (trillingar)</option>
                    <option value={4}>4 barn</option>
                  </Select>
                  <p className="text-muted-foreground text-xs">
                    Flerbarnsfödsel ger extra dagar utöver de 480.
                  </p>
                </div>
              )}
            </div>

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

            {caregiverAccordion(firstId)}

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

                {caregiverAccordion(secondId)}
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
