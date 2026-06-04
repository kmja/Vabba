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
import { RemainingTiers } from "@/components/remaining-tiers";
import { SplitSuggestion } from "@/components/split-suggestion";
import { Timeline } from "@/components/timeline";
import { WarningsList } from "@/components/warnings-list";
import {
  defaultParentInput,
  planDeadlines,
  planRemaining,
  type ParentId,
  type ParentInput,
  type PlanInput,
  type TierCount,
} from "@/lib/calc";
import { isPlannableBirthDate, optimize, type Objective } from "@/lib/optimizer";
import { sjukpenningnivaDailyAmount } from "@/lib/rules";
import { toIsoDate } from "@/lib/dates";
import { formatSek } from "@/lib/format";

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
  const [birthDate, setBirthDate] = useState("");
  const [childrenInBirth, setChildrenInBirth] = useState(1);
  const [parents, setParents] = useState<Record<ParentId, ParentInput>>({
    A: defaultParentInput(),
    B: defaultParentInput(),
  });
  const [objective, setObjective] = useState<Objective>("maxPayout");
  const [asOf, setAsOf] = useState<Date | null>(null);

  // Initialize "today" on the client only. Doing this on mount — rather than in
  // a lazy useState initializer — keeps the server-rendered HTML free of any
  // date, which avoids an SSR/timezone hydration mismatch. Runs exactly once.
  useEffect(() => {
    const now = new Date();
    /* eslint-disable react-hooks/set-state-in-effect -- one-time client-only init of "today"; intentional, see comment above */
    setAsOf(now);
    setBirthDate((b) => b || toIsoDate(now));
    /* eslint-enable react-hooks/set-state-in-effect */
  }, []);

  const plan: PlanInput = useMemo(
    () => ({ birthDate, childrenInBirth, parents }),
    [birthDate, childrenInBirth, parents],
  );

  const valid = isPlannableBirthDate(birthDate);
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
              Allt räknas ut lokalt i webbläsaren. Inget sparas eller skickas.
            </CardDescription>
          </CardHeader>
          <CardContent className="space-y-5">
            <div className="grid grid-cols-2 gap-3">
              <div className="space-y-1.5">
                <Label htmlFor="birth-date">Födelsedatum</Label>
                <Input
                  id="birth-date"
                  type="date"
                  value={birthDate}
                  onChange={(e) => setBirthDate(e.target.value)}
                />
              </div>
              <div className="space-y-1.5">
                <Label htmlFor="children">Antal barn</Label>
                <Select
                  id="children"
                  value={childrenInBirth}
                  onChange={(e) => setChildrenInBirth(Number(e.target.value))}
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
              value={parents.A}
              onChange={(next) => setParents((p) => ({ ...p, A: next }))}
            />

            <Separator />

            <ParentFieldset
              idPrefix="b"
              fallbackName="Förälder B"
              value={parents.B}
              onChange={(next) => setParents((p) => ({ ...p, B: next }))}
            />
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
