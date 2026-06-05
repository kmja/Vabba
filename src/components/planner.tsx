"use client";

import { useEffect, useMemo, useState } from "react";
import { Baby, Users } from "lucide-react";

import {
  Card,
  CardContent,
  CardDescription,
  CardHeader,
  CardTitle,
} from "@/components/ui/card";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Select } from "@/components/ui/select";
import { Separator } from "@/components/ui/separator";
import { NumberField } from "@/components/number-field";
import { FkSourceHint } from "@/components/fk-source-hint";
import { RemainingTiers } from "@/components/remaining-tiers";
import { SplitSuggestion } from "@/components/split-suggestion";
import { Timeline } from "@/components/timeline";
import { WarningsList } from "@/components/warnings-list";
import {
  defaultPlanInput,
  planDeadlines,
  planRemaining,
  type ParentInput,
  type PlanInput,
  type TierCount,
} from "@/lib/calc";
import { isPlannableBirthDate, optimize, type Objective } from "@/lib/optimizer";
import { sjukpenningnivaDailyAmount } from "@/lib/rules";
import { formatSek } from "@/lib/format";
import { useLocalStorage } from "@/lib/use-local-storage";

interface PlannerForm {
  plan: PlanInput;
  objective: Objective;
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
  const rate = sjukpenningnivaDailyAmount(value.grossMonthlyIncome);
  const setDays = (tier: keyof TierCount, n: number) =>
    onChange({ ...value, daysUsed: { ...value.daysUsed, [tier]: n } });

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
        value={value.grossMonthlyIncome}
        step={1000}
        placeholder="0"
        onChange={(n) => onChange({ ...value, grossMonthlyIncome: n })}
        hint={
          value.grossMonthlyIncome > 0
            ? `Ger ca ${formatSek(rate)}/dag på sjukpenningnivå`
            : undefined
        }
      />
      <div className="grid grid-cols-2 gap-3">
        <NumberField
          id={`${idPrefix}-used-sjuk`}
          label="Uttagna sjukpenningdagar"
          value={value.daysUsed.sjukpenning}
          placeholder="0"
          onChange={(n) => setDays("sjukpenning", n)}
        />
        <NumberField
          id={`${idPrefix}-used-lagsta`}
          label="Uttagna lägstanivådagar"
          value={value.daysUsed.lagsta}
          placeholder="0"
          onChange={(n) => setDays("lagsta", n)}
        />
      </div>
    </div>
  );
}

export function Planner() {
  // Form state is persisted on the device so it survives reloads.
  const [form, setForm] = useLocalStorage<PlannerForm>("foraldradagar.fp.v1", {
    plan: defaultPlanInput(""),
    objective: "maxPayout",
  });
  const [asOf, setAsOf] = useState<Date | null>(null);

  // "Today" is read on the client only, to avoid an SSR/timezone hydration
  // mismatch. Runs once on mount.
  useEffect(() => {
    // eslint-disable-next-line react-hooks/set-state-in-effect -- one-time client-only init of "today"
    setAsOf(new Date());
  }, []);

  const { plan, objective } = form;
  const setPlan = (updater: (p: PlanInput) => PlanInput) =>
    setForm((f) => ({ ...f, plan: updater(f.plan) }));
  const setObjective = (next: Objective) =>
    setForm((f) => ({ ...f, objective: next }));

  const valid = isPlannableBirthDate(plan.birthDate);
  const remaining = useMemo(
    () => (valid ? planRemaining(plan) : null),
    [plan, valid],
  );
  const deadlines = useMemo(
    () => (valid ? planDeadlines(plan) : null),
    [plan, valid],
  );
  const result = useMemo(
    () => (valid && asOf ? optimize(plan, { objective, asOf }) : null),
    [plan, valid, asOf, objective],
  );

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
              onChange={(next) =>
                setPlan((p) => ({ ...p, parents: { ...p.parents, A: next } }))
              }
            />

            <Separator />

            <ParentFieldset
              idPrefix="b"
              fallbackName="Förälder B"
              value={plan.parents.B}
              onChange={(next) =>
                setPlan((p) => ({ ...p, parents: { ...p.parents, B: next } }))
              }
            />

            <FkSourceHint what="Uttagna dagar" />
          </CardContent>
        </Card>
      </div>

      {/* Results */}
      <div className="space-y-6">
        {valid && remaining && result && deadlines && asOf ? (
          <>
            <RemainingTiers remaining={remaining} />
            <SplitSuggestion
              result={result}
              objective={objective}
              onObjectiveChange={setObjective}
              plan={plan}
            />
            <WarningsList warnings={result.recommended.warnings} />
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
