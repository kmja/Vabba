"use client";

import { useEffect, useMemo, useState, type ReactNode } from "react";
import { Baby, Check, RotateCcw, Share2, Users } from "lucide-react";

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
import { FkSourceHint } from "@/components/fk-source-hint";
import { RemainingTiers } from "@/components/remaining-tiers";
import { SplitSuggestion } from "@/components/split-suggestion";
import { SoloSummary } from "@/components/solo-summary";
import { Timeline } from "@/components/timeline";
import { WarningsList } from "@/components/warnings-list";
import {
  defaultPlanInput,
  emptyTierCount,
  planDeadlines,
  type ParentId,
  type ParentInput,
  type PlanInput,
  type TierCount,
} from "@/lib/calc";
import {
  isPlannableBirthDate,
  optimize,
  optimizeSolo,
  type Objective,
} from "@/lib/optimizer";
import { isAboveSgiCap, sjukpenningnivaDailyAmount } from "@/lib/rules";
import { formatSek } from "@/lib/format";
import { useLocalStorage } from "@/lib/use-local-storage";
import { decodeState, encodeState, type ShareableState } from "@/lib/share";

function CheckRow({
  id,
  checked,
  onChange,
  children,
}: {
  id: string;
  checked: boolean;
  onChange: (checked: boolean) => void;
  children: ReactNode;
}) {
  return (
    <label
      htmlFor={id}
      className="flex cursor-pointer items-center gap-2 text-sm font-medium select-none"
    >
      <input
        id={id}
        type="checkbox"
        checked={checked}
        onChange={(e) => onChange(e.target.checked)}
        className="accent-primary size-4"
      />
      {children}
    </label>
  );
}

function ParentFieldset({
  idPrefix,
  fallbackName,
  value,
  onChange,
}: {
  idPrefix: string;
  fallbackName: string;
  value: ParentInput;
  onChange: (next: ParentInput) => void;
}) {
  const income = value.grossMonthlyIncome;
  const rate = sjukpenningnivaDailyAmount(income);
  const hint =
    income > 0
      ? isAboveSgiCap(income)
        ? `Över taket – ${formatSek(rate)}/dag (högsta belopp)`
        : `Ger ca ${formatSek(rate)}/dag på sjukpenningnivå`
      : "Vet du bara nettolönen? Brutto ≈ netto × 1,5.";

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
      <NumberField
        id={`${idPrefix}-income`}
        label="Bruttolön per månad (kr)"
        value={income}
        step={1000}
        placeholder="0"
        onChange={(n) => onChange({ ...value, grossMonthlyIncome: n })}
        hint={hint}
      />
    </div>
  );
}

const DEFAULT_STATE: ShareableState = {
  plan: defaultPlanInput(""),
  objective: "maxPayout",
  soloMode: false,
  hasUsedDays: false,
  detailedUsed: false,
  daysPerWeek: 7,
};

export function Planner() {
  // Persisted on the device; the same shape is also what we share via URL.
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

  const { plan, objective, soloMode, hasUsedDays, detailedUsed } = form;
  const daysPerWeek = form.daysPerWeek ?? 7;

  const setPlan = (updater: (p: PlanInput) => PlanInput) =>
    setForm((f) => ({ ...f, plan: updater(f.plan) }));
  const setObjective = (next: Objective) =>
    setForm((f) => ({ ...f, objective: next }));
  const setParent = (id: ParentId, next: ParentInput) =>
    setPlan((p) => ({ ...p, parents: { ...p.parents, [id]: next } }));
  const setParentDays = (id: ParentId, daysUsed: TierCount) =>
    setParent(id, { ...plan.parents[id], daysUsed });

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
        ? optimize(effectivePlan, { objective, asOf })
        : null,
    [effectivePlan, valid, asOf, objective, soloMode],
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

  const share = async () => {
    const encoded = encodeState({
      plan,
      objective,
      soloMode,
      hasUsedDays,
      detailedUsed,
      daysPerWeek,
    });
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

  const visibleIds: ParentId[] = soloMode ? ["A"] : ["A", "B"];
  const soloName = plan.parents.A.name?.trim() || "Du";

  return (
    <div className="grid gap-6 lg:grid-cols-[360px_minmax(0,1fr)]">
      {/* Inputs */}
      <div className="lg:sticky lg:top-6 lg:self-start">
        <Card>
          <CardHeader>
            <CardTitle className="flex items-center gap-2">
              <Baby className="size-5" /> Er situation
            </CardTitle>
            <CardDescription>
              Allt räknas ut och sparas lokalt i din webbläsare — inget skickas.
            </CardDescription>
          </CardHeader>
          <CardContent className="space-y-5">
            <CheckRow
              id="solo-mode"
              checked={soloMode}
              onChange={(b) => setForm((f) => ({ ...f, soloMode: b }))}
            >
              Jag planerar själv (ensam vårdnad)
            </CheckRow>

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
                <Label htmlFor="children">Antal barn</Label>
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

            <Separator />

            <ParentFieldset
              idPrefix="a"
              fallbackName="Förälder A"
              value={plan.parents.A}
              onChange={(next) => setParent("A", next)}
            />

            {!soloMode && (
              <>
                <Separator />
                <ParentFieldset
                  idPrefix="b"
                  fallbackName="Förälder B"
                  value={plan.parents.B}
                  onChange={(next) => setParent("B", next)}
                />
              </>
            )}

            <Separator />

            {/* Leave pace — how long the days last in calendar time. */}
            <div className="space-y-1.5">
              <Label htmlFor="days-per-week">Uttag (dagar per vecka)</Label>
              <Select
                id="days-per-week"
                value={daysPerWeek}
                onChange={(e) =>
                  setForm((f) => ({
                    ...f,
                    daysPerWeek: Number(e.target.value),
                  }))
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
                Färre dagar per vecka räcker längre i kalendertid — du kan
                kombinera med jobb, helger och semester.
              </p>
            </div>

            <Separator />

            {/* Already-used days — hidden by default to keep the form light. */}
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
                      p.name?.trim() || (soloMode ? "dig" : `Förälder ${id}`);
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

            <div className="flex gap-2">
              <Button
                type="button"
                variant="outline"
                size="sm"
                className="flex-1"
                onClick={share}
              >
                {copied ? <Check /> : <Share2 />}
                {copied ? "Kopierad!" : "Dela plan"}
              </Button>
              <Button
                type="button"
                variant="ghost"
                size="sm"
                onClick={() => setForm(DEFAULT_STATE)}
              >
                <RotateCcw />
                Börja om
              </Button>
            </div>
          </CardContent>
        </Card>
      </div>

      {/* Results */}
      <div className="space-y-6">
        {valid && asOf && remaining && deadlines ? (
          <>
            <RemainingTiers remaining={remaining} />
            {soloMode && solo ? (
              <SoloSummary
                payout={solo.payout}
                total={solo.allocatedTotal}
                name={soloName}
                daysPerWeek={daysPerWeek}
              />
            ) : twoParent ? (
              <SplitSuggestion
                result={twoParent}
                objective={objective}
                onObjectiveChange={setObjective}
                plan={plan}
                daysPerWeek={daysPerWeek}
              />
            ) : null}
            <WarningsList warnings={warnings} />
            <Timeline deadlines={deadlines} asOf={asOf} />
          </>
        ) : (
          <Card>
            <CardContent className="text-muted-foreground flex min-h-40 flex-col items-center justify-center gap-2 py-12 text-center">
              <Users className="size-8 opacity-40" />
              <p>Fyll i barnets födelsedatum så visas en plan här.</p>
            </CardContent>
          </Card>
        )}
      </div>
    </div>
  );
}
