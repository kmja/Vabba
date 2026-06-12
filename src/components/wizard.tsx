"use client";

import { useState, type Dispatch, type SetStateAction } from "react";
import { ArrowLeft, ArrowRight, RotateCcw } from "lucide-react";

import {
  Card,
  CardContent,
  CardDescription,
  CardHeader,
  CardTitle,
} from "@/components/ui/card";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Select } from "@/components/ui/select";
import { Separator } from "@/components/ui/separator";
import { NumberField } from "@/components/number-field";
import { IncomeField } from "@/components/income-field";
import { FkSourceHint } from "@/components/fk-source-hint";
import { CheckRow } from "@/components/check-row";
import {
  type ParentId,
  type ParentInput,
  type PlanInput,
  type TierCount,
} from "@/lib/calc";
import {
  OBJECTIVE_DESCRIPTION,
  OBJECTIVE_LABEL,
  type Objective,
} from "@/lib/optimizer";
import { MONEY, isAboveSgiCap, sjukpenningnivaDailyAmount } from "@/lib/rules";
import { formatSek } from "@/lib/format";
import type { ShareableState } from "@/lib/share";

const STEP_TITLES = [
  "Barnet",
  "Vårdnadshavare & mål",
  "Schema",
  "Vab & 10-dagar",
] as const;
const STEP_COUNT = STEP_TITLES.length;

/** How to split the shared pool of days — a single household decision. */
const SPLIT_OBJECTIVES: Objective[] = ["maxPayout", "equal", "custom"];

type PaceMode = "full" | "prolong";

/** Per-caregiver pace goal: take days at full schedule, or stretch them out. */
function PaceGoalControl({
  idPrefix,
  name,
  mode,
  target,
  onModeChange,
  onTargetChange,
}: {
  idPrefix: string;
  name: string;
  mode: PaceMode;
  target: number;
  onModeChange: (m: PaceMode) => void;
  onTargetChange: (n: number) => void;
}) {
  const options: { value: PaceMode; label: string; desc: string }[] = [
    {
      value: "full",
      label: "Full takt",
      desc: "Mest pengar per månad, kortast tid.",
    },
    {
      value: "prolong",
      label: "Förläng ledigheten",
      desc: "Långsammare takt, längre ledighet.",
    },
  ];
  return (
    <div className="space-y-2">
      <Label>{name}</Label>
      <div className="grid grid-cols-2 gap-2">
        {options.map((o) => (
          <label
            key={o.value}
            className={`flex cursor-pointer flex-col gap-1 rounded-lg border p-3 ${
              mode === o.value ? "border-primary bg-secondary/40" : ""
            }`}
          >
            <span className="flex items-center gap-2 text-sm font-medium">
              <input
                type="radio"
                id={`${idPrefix}-pace-${o.value}`}
                name={`${idPrefix}-pace`}
                checked={mode === o.value}
                onChange={() => onModeChange(o.value)}
                className="accent-primary size-4 shrink-0"
              />
              {o.label}
            </span>
            <span className="text-muted-foreground text-xs">{o.desc}</span>
          </label>
        ))}
      </div>
      {mode === "prolong" && (
        <NumberField
          id={`min-monthly-${idPrefix}`}
          label="Minsta månadsbelopp (kr, brutto)"
          value={target}
          step={1000}
          onChange={onTargetChange}
          hint="Takten räknas ut så att beloppet hålls och ledigheten räcker så länge som möjligt."
        />
      )}
    </div>
  );
}

function CaregiverFields({
  idPrefix,
  fallbackName,
  value,
  onChange,
  supplement,
  onSupplementChange,
}: {
  idPrefix: string;
  fallbackName: string;
  value: ParentInput;
  onChange: (next: ParentInput) => void;
  supplement: { enabled: boolean; months: number; pct: number };
  onSupplementChange: (next: {
    enabled: boolean;
    months: number;
    pct: number;
  }) => void;
}) {
  const income = value.grossMonthlyIncome;
  const aboveCap = value.incomeAboveCap ?? false;
  const rate = sjukpenningnivaDailyAmount(income);
  const amountHint =
    income > 0
      ? isAboveSgiCap(income)
        ? `Över taket – ${formatSek(rate)}/dag (högsta belopp)`
        : `Ger ca ${formatSek(rate)}/dag på sjukpenningnivå`
      : "Vet du bara nettolönen? Brutto ≈ netto × 1,5.";
  const capHint = `Räknar med högsta beloppet, ${formatSek(
    MONEY.maxSjukpenningPerDay,
  )}/dag (inkomst över ${formatSek(MONEY.sgiAnnualCap)}/år).`;

  return (
    <div className="space-y-3">
      <div className="space-y-1.5">
        <Label htmlFor={`${idPrefix}-name`}>Namn (valfritt)</Label>
        <Input
          id={`${idPrefix}-name`}
          value={value.name ?? ""}
          placeholder={fallbackName}
          onChange={(e) => onChange({ ...value, name: e.target.value })}
        />
      </div>
      <IncomeField
        id={`${idPrefix}-income`}
        label="Bruttolön per månad (kr)"
        value={income}
        aboveCap={aboveCap}
        onValueChange={(n) => onChange({ ...value, grossMonthlyIncome: n })}
        onAboveCapChange={(b) => onChange({ ...value, incomeAboveCap: b })}
        amountHint={amountHint}
        capHint={capHint}
      />

      <CheckRow
        id={`${idPrefix}-240`}
        checked={value.meets240DayRule !== false}
        onChange={(b) => onChange({ ...value, meets240DayRule: b })}
      >
        <span className="font-normal">
          Har haft inkomst (SGI) i minst 240 dagar före födseln
        </span>
      </CheckRow>
      {value.meets240DayRule === false && (
        <p className="text-muted-foreground -mt-1 text-xs">
          De första 180 dagarna betalas då på grundnivå (250 kr/dag) i stället
          för på sjukpenningnivå.
        </p>
      )}

      <div className="space-y-2">
        <CheckRow
          id={`${idPrefix}-supplement`}
          checked={supplement.enabled}
          onChange={(b) => onSupplementChange({ ...supplement, enabled: b })}
        >
          Föräldralön från arbetsgivaren (kollektivavtal)
        </CheckRow>
        {supplement.enabled && (
          <div className="space-y-3">
            {aboveCap && (
              <NumberField
                id={`${idPrefix}-supp-salary`}
                label="Faktisk månadslön (brutto)"
                value={income}
                step={1000}
                onChange={(n) =>
                  onChange({ ...value, grossMonthlyIncome: n })
                }
                hint="Behövs för att räkna föräldralön på lönedelar över taket."
              />
            )}
            <div className="grid grid-cols-2 gap-3">
              <NumberField
                id={`${idPrefix}-supp-months`}
                label="Antal månader"
                value={supplement.months}
                min={0}
                max={24}
                stepper
                onChange={(n) =>
                  onSupplementChange({ ...supplement, months: n })
                }
              />
              <NumberField
                id={`${idPrefix}-supp-pct`}
                label="Fyller upp till (% av lön)"
                value={supplement.pct}
                min={0}
                max={100}
                step={5}
                stepper
                onChange={(n) => onSupplementChange({ ...supplement, pct: n })}
              />
            </div>
            <p className="text-muted-foreground text-xs">
              Många kollektivavtal fyller upp till ca 90 % av lönen i ungefär 6
              månader — och kompenserar då även lönedelar över taket. Kolla ditt
              avtal för exakta villkor.
            </p>
          </div>
        )}
      </div>
    </div>
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

  const { plan, objective, soloMode, hasUsedDays, detailedUsed } = form;
  const daysPerWeek = form.daysPerWeek ?? 7;
  const doubleDays = form.doubleDays ?? 0;
  const minMonthlyA = form.minMonthlyA ?? form.minMonthly ?? 20000;
  const minMonthlyB = form.minMonthlyB ?? form.minMonthly ?? 20000;
  const paceModeA: PaceMode =
    form.paceModeA ?? (objective === "minMonthly" ? "prolong" : "full");
  const paceModeB: PaceMode =
    form.paceModeB ?? (objective === "minMonthly" ? "prolong" : "full");
  // Old links used a single "minMonthly" objective; show it as an even split.
  const splitObjective: Objective =
    objective === "minMonthly" ? "equal" : objective;
  const anyFullPace = soloMode
    ? paceModeA === "full"
    : paceModeA === "full" || paceModeB === "full";
  const customSplitA = form.customSplitA ?? 0.5;
  const includeLagsta = form.includeLagsta ?? false;
  const firstCaregiver = form.firstCaregiver ?? "A";
  const supplementA = {
    enabled: form.supplementA ?? false,
    months: form.supplementMonthsA ?? 6,
    pct: form.supplementPctA ?? 90,
  };
  const supplementB = {
    enabled: form.supplementB ?? false,
    months: form.supplementMonthsB ?? 6,
    pct: form.supplementPctB ?? 90,
  };
  const hasExtraDays = form.hasExtraDays ?? false;
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

  const setPlan = (updater: (p: PlanInput) => PlanInput) =>
    setForm((f) => ({ ...f, plan: updater(f.plan) }));
  const setParent = (id: ParentId, next: ParentInput) =>
    setPlan((p) => ({ ...p, parents: { ...p.parents, [id]: next } }));
  const setParentDays = (id: ParentId, daysUsed: TierCount) =>
    setParent(id, { ...plan.parents[id], daysUsed });

  const visibleIds: ParentId[] = soloMode ? ["A"] : ["A", "B"];
  const canAdvance = step !== 1 || valid;

  return (
    <Card className="mx-auto max-w-2xl">
      <CardHeader>
        <div className="text-muted-foreground flex items-center justify-between text-xs font-medium">
          <span>
            Steg {step} av {STEP_COUNT}
          </span>
          <span>{STEP_TITLES[step - 1]}</span>
        </div>
        <div className="flex gap-1.5">
          {STEP_TITLES.map((t, i) => (
            <div
              key={t}
              className={`h-1.5 flex-1 rounded-full ${
                i < step ? "bg-primary" : "bg-muted"
              }`}
            />
          ))}
        </div>
        <CardTitle className="pt-2">{STEP_TITLES[step - 1]}</CardTitle>
        <CardDescription>
          Allt räknas ut och sparas lokalt i din webbläsare — inget skickas.
        </CardDescription>
      </CardHeader>

      <CardContent className="space-y-5">
        {step === 1 && (
          <>
            <div className="grid grid-cols-2 gap-3">
              <div className="space-y-1.5">
                <Label htmlFor="birth-date">Födelsedatum</Label>
                <Input
                  id="birth-date"
                  type="date"
                  value={plan.birthDate}
                  onChange={(e) =>
                    setPlan((p) => ({ ...p, birthDate: e.target.value }))
                  }
                />
              </div>
              <div className="space-y-1.5">
                <Label htmlFor="children">Antal barn i födseln</Label>
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
                  <option value={1}>1 barn</option>
                  <option value={2}>2 (tvillingar)</option>
                  <option value={3}>3 barn</option>
                  <option value={4}>4 barn</option>
                </Select>
              </div>
            </div>
            {!valid && (
              <p className="text-destructive text-xs">
                Ange ett giltigt födelse- eller beräknat datum.
              </p>
            )}
            <p className="text-muted-foreground text-xs">
              Flerbarnsfödsel (tvillingar m.m.) ger fler dagar. Beräknat datum
              fungerar bra om barnet inte är fött än. Varje barn har sin egen
              pott — dagar för tidigare barn räknas inte in här.
            </p>
          </>
        )}

        {step === 2 && (
          <>
            <div className="space-y-1.5">
              <Label htmlFor="caregivers">Antal vårdnadshavare</Label>
              <Select
                id="caregivers"
                value={soloMode ? 1 : 2}
                onChange={(e) =>
                  setForm((f) => ({ ...f, soloMode: Number(e.target.value) === 1 }))
                }
              >
                <option value={2}>Två vårdnadshavare</option>
                <option value={1}>En (jag planerar själv)</option>
              </Select>
            </div>

            <Separator />
            <CaregiverFields
              idPrefix="a"
              fallbackName="Vårdnadshavare A"
              value={plan.parents.A}
              onChange={(next) => setParent("A", next)}
              supplement={supplementA}
              onSupplementChange={(s) =>
                setForm((f) => ({
                  ...f,
                  supplementA: s.enabled,
                  supplementMonthsA: s.months,
                  supplementPctA: s.pct,
                }))
              }
            />
            {!soloMode && (
              <>
                <Separator />
                <CaregiverFields
                  idPrefix="b"
                  fallbackName="Vårdnadshavare B"
                  value={plan.parents.B}
                  onChange={(next) => setParent("B", next)}
                  supplement={supplementB}
                  onSupplementChange={(s) =>
                    setForm((f) => ({
                      ...f,
                      supplementB: s.enabled,
                      supplementMonthsB: s.months,
                      supplementPctB: s.pct,
                    }))
                  }
                />
              </>
            )}

            {!soloMode && (
              <>
                <Separator />
                <div className="space-y-2">
                  <Label>Fördelning av dagar</Label>
                  {SPLIT_OBJECTIVES.map((o) => (
                    <label
                      key={o}
                      className={`flex cursor-pointer gap-2.5 rounded-lg border p-3 ${
                        splitObjective === o ? "border-primary bg-secondary/40" : ""
                      }`}
                    >
                      <input
                        type="radio"
                        name="objective"
                        checked={splitObjective === o}
                        onChange={() => setForm((f) => ({ ...f, objective: o }))}
                        className="accent-primary mt-0.5 size-4 shrink-0"
                      />
                      <span>
                        <span className="block text-sm font-medium">
                          {OBJECTIVE_LABEL[o]}
                        </span>
                        <span className="text-muted-foreground block text-xs">
                          {OBJECTIVE_DESCRIPTION[o]}
                        </span>
                      </span>
                    </label>
                  ))}

                  {objective === "custom" && (
                    <div className="space-y-2 pt-1">
                      <input
                        id="custom-split"
                        type="range"
                        min={0}
                        max={100}
                        step={5}
                        value={Math.round(customSplitA * 100)}
                        onChange={(e) =>
                          setForm((f) => ({
                            ...f,
                            customSplitA: Number(e.target.value) / 100,
                          }))
                        }
                        className="accent-primary w-full"
                      />
                      <div className="flex justify-between text-xs font-medium">
                        <span>
                          {nameA}: {Math.round(customSplitA * 100)}%
                        </span>
                        <span>
                          {nameB}: {100 - Math.round(customSplitA * 100)}%
                        </span>
                      </div>
                      <p className="text-muted-foreground text-xs">
                        Reserverade dagar (90 per vårdnadshavare) behålls alltid.
                      </p>
                    </div>
                  )}
                </div>
              </>
            )}

            <Separator />
            <div className="space-y-3">
              <div className="space-y-1">
                <Label>Mål per vårdnadshavare</Label>
                <p className="text-muted-foreground text-xs">
                  Var och en väljer sin egen takt — ta ut snabbt för mest pengar i
                  handen, eller förläng ledigheten så länge som möjligt.
                </p>
              </div>
              <PaceGoalControl
                idPrefix="a"
                name={soloMode ? "Din takt" : nameA}
                mode={paceModeA}
                target={minMonthlyA}
                onModeChange={(m) => setForm((f) => ({ ...f, paceModeA: m }))}
                onTargetChange={(n) => setForm((f) => ({ ...f, minMonthlyA: n }))}
              />
              {!soloMode && (
                <PaceGoalControl
                  idPrefix="b"
                  name={nameB}
                  mode={paceModeB}
                  target={minMonthlyB}
                  onModeChange={(m) => setForm((f) => ({ ...f, paceModeB: m }))}
                  onTargetChange={(n) => setForm((f) => ({ ...f, minMonthlyB: n }))}
                />
              )}
            </div>
          </>
        )}

        {step === 3 && (
          <>
            {!soloMode && (
              <>
                <div className="space-y-1.5">
                  <Label htmlFor="first-caregiver">Vem är ledig först?</Label>
                  <Select
                    id="first-caregiver"
                    value={firstCaregiver}
                    onChange={(e) =>
                      setForm((f) => ({
                        ...f,
                        firstCaregiver: e.target.value as "A" | "B",
                      }))
                    }
                  >
                    <option value="A">{nameA}</option>
                    <option value="B">{nameB}</option>
                  </Select>
                  <p className="text-muted-foreground text-xs">
                    Styr ordningen på tidslinjen — vem som tar ut sina dagar
                    först och när ni byter. Ofta börjar den som fött barnet.
                  </p>
                </div>
                <Separator />
              </>
            )}

            {anyFullPace ? (
              <div className="space-y-1.5">
                <Label htmlFor="days-per-week">
                  Uttag i full takt (dagar per vecka)
                </Label>
                <Select
                  id="days-per-week"
                  value={daysPerWeek}
                  onChange={(e) =>
                    setForm((f) => ({ ...f, daysPerWeek: Number(e.target.value) }))
                  }
                >
                  <option value={7}>7 – heltid</option>
                  <option value={6}>6 dagar/vecka</option>
                  <option value={5}>5 dagar/vecka</option>
                  <option value={4}>4 dagar/vecka</option>
                  <option value={3}>3 dagar/vecka</option>
                  <option value={2}>2 dagar/vecka</option>
                  <option value={1}>1 dag/vecka</option>
                </Select>
                <p className="text-muted-foreground text-xs">
                  Gäller den som tar ut i full takt. Färre dagar per vecka räcker
                  längre i kalendertid — kombinera med jobb, helger och semester.
                  Takten för den som förlänger räknas ut automatiskt.
                </p>
              </div>
            ) : (
              <p className="text-muted-foreground text-sm">
                Takten räknas ut automatiskt per vårdnadshavare för att hålla
                önskat månadsbelopp och förlänga ledigheten så mycket som
                möjligt. Du ser de uträknade takterna på nästa sida.
              </p>
            )}

            {!soloMode && (
              <NumberField
                id="double-days"
                label="Dubbeldagar (båda hemma samtidigt)"
                value={doubleDays}
                min={0}
                max={60}
                stepper
                onChange={(n) => setForm((f) => ({ ...f, doubleDays: n }))}
                hint="Varje dubbeldag kostar 2 dagar ur potten (max 60, före 15 mån)."
              />
            )}

            <Separator />
            <div className="space-y-2">
              <CheckRow
                id="include-lagsta"
                checked={includeLagsta}
                onChange={(b) => setForm((f) => ({ ...f, includeLagsta: b }))}
              >
                Ta ut lägstanivådagarna (90 dagar à 180 kr)
              </CheckRow>
              <p className="text-muted-foreground text-xs">
                {includeLagsta
                  ? "Lägstanivådagarna läggs till sist och förlänger ledigheten, men ger bara 180 kr/dag."
                  : "Ledigheten slutar när de inkomstbaserade dagarna tar slut. De 90 lägstanivådagarna sparas — de kan tas ut senare (180 kr/dag) eller sparas tills barnet fyller 12."}
              </p>
            </div>

            <Separator />
            <div className="space-y-3">
              <CheckRow
                id="has-used"
                checked={hasUsedDays}
                onChange={(b) => setForm((f) => ({ ...f, hasUsedDays: b }))}
              >
                {soloMode
                  ? "Jag har redan tagit ut dagar"
                  : "Vi har redan tagit ut dagar"}
              </CheckRow>

              {hasUsedDays && (
                <div className="space-y-3">
                  <CheckRow
                    id="detailed-used"
                    checked={detailedUsed}
                    onChange={(b) => setForm((f) => ({ ...f, detailedUsed: b }))}
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
                    const suffix = visibleIds.length > 1 ? ` – ${who}` : "";
                    return detailedUsed ? (
                      <div key={id} className="grid grid-cols-2 gap-3">
                        <NumberField
                          id={`${id.toLowerCase()}-used-sjuk`}
                          label={`Sjukpenningdagar${suffix}`}
                          value={p.daysUsed.sjukpenning}
                          stepper
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
                        value={p.daysUsed.sjukpenning + p.daysUsed.lagsta}
                        stepper
                        onChange={(n) =>
                          setParentDays(id, { sjukpenning: n, lagsta: 0 })
                        }
                      />
                    );
                  })}
                  <FkSourceHint what="Uttagna dagar" />
                </div>
              )}
            </div>

            <Separator />
            <div className="space-y-3">
              <CheckRow
                id="has-extra"
                checked={hasExtraDays}
                onChange={(b) => setForm((f) => ({ ...f, hasExtraDays: b }))}
              >
                {soloMode
                  ? "Jag har sparade dagar kvar från tidigare barn"
                  : "Vi har sparade dagar kvar från tidigare barn"}
              </CheckRow>
              {hasExtraDays && (
                <div className="space-y-3">
                  {visibleIds.map((id) => {
                    const p = plan.parents[id];
                    const who =
                      p.name?.trim() ||
                      (soloMode ? "dig" : `Vårdnadshavare ${id}`);
                    const suffix = visibleIds.length > 1 ? ` – ${who}` : "";
                    return (
                      <NumberField
                        key={id}
                        id={`${id.toLowerCase()}-extra`}
                        label={`Sparade dagar${suffix}`}
                        value={id === "A" ? extraDaysA : extraDaysB}
                        stepper
                        onChange={(n) =>
                          setForm((f) =>
                            id === "A"
                              ? { ...f, extraDaysA: n }
                              : { ...f, extraDaysB: n },
                          )
                        }
                      />
                    );
                  })}
                  <p className="text-muted-foreground text-xs">
                    Inkomstbaserade dagar som finns kvar från tidigare barn. De
                    följer det äldre barnets tidsgränser — ta ut innan det barnet
                    fyller 4 år (inkomstbaserade) respektive 12 år.
                  </p>
                </div>
              )}
            </div>
          </>
        )}

        {step === 4 && (
          <>
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
                    onChange={(n) =>
                      setForm((f) => ({ ...f, vabDaysUsedThisYear: n }))
                    }
                  />
                </div>
                <FkSourceHint what="Uttagna vab-dagar" />
                <p className="text-muted-foreground text-xs">
                  Vab räknas per barn och kalenderår. Här används den första
                  vårdnadshavarens inkomst för uppskattningen.
                </p>
              </>
            )}

            {!soloMode && (
              <>
                <Separator />
                <CheckRow
                  id="birth-days-enabled"
                  checked={birthDaysEnabled}
                  onChange={(b) =>
                    setForm((f) => ({ ...f, birthDaysEnabled: b }))
                  }
                >
                  10 dagar vid barns födelse (tillfällig föräldrapenning)
                </CheckRow>
                {birthDaysEnabled && (
                  <div className="grid grid-cols-2 gap-3">
                    <div className="space-y-1.5">
                      <Label htmlFor="birth-days-who">
                        Vem tar ut dagarna?
                      </Label>
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
                      onChange={(n) =>
                        setForm((f) => ({ ...f, birthDaysCount: n }))
                      }
                    />
                  </div>
                )}
                {birthDaysEnabled && (
                  <p className="text-muted-foreground text-xs">
                    Den andra vårdnadshavarens dagar i samband med födseln —
                    utöver de 480. Tas ut inom 60 dagar efter hemkomsten.
                  </p>
                )}
              </>
            )}

            <p className="text-muted-foreground text-xs">
              Allt här är valfritt — hoppa över om det inte är aktuellt.
            </p>
          </>
        )}

        <Separator />

        <div className="flex items-center justify-between gap-2">
          <Button
            type="button"
            variant="ghost"
            size="sm"
            onClick={step === 1 ? onReset : () => setStep((s) => s - 1)}
          >
            {step === 1 ? (
              <>
                <RotateCcw /> Börja om
              </>
            ) : (
              <>
                <ArrowLeft /> Bakåt
              </>
            )}
          </Button>

          {step < STEP_COUNT ? (
            <Button
              type="button"
              size="sm"
              disabled={!canAdvance}
              onClick={() => setStep((s) => s + 1)}
            >
              Nästa <ArrowRight />
            </Button>
          ) : (
            <Button
              type="button"
              size="sm"
              disabled={!valid}
              onClick={onSubmit}
            >
              Visa plan <ArrowRight />
            </Button>
          )}
        </div>
      </CardContent>
    </Card>
  );
}
