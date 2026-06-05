"use client";

import { useMemo } from "react";
import {
  Baby,
  CalendarDays,
  CircleAlert,
  Clock,
  Info,
  RotateCcw,
  Users,
  Wallet,
} from "lucide-react";

import {
  Card,
  CardContent,
  CardDescription,
  CardHeader,
  CardTitle,
} from "@/components/ui/card";
import { Label } from "@/components/ui/label";
import { Select } from "@/components/ui/select";
import { Progress } from "@/components/ui/progress";
import { Alert, AlertDescription, AlertTitle } from "@/components/ui/alert";
import { Button } from "@/components/ui/button";
import { NumberField } from "@/components/number-field";
import { FkSourceHint } from "@/components/fk-source-hint";
import { computeVab, VAB_AGE, VAB_MONEY, VAB_RULES } from "@/lib/vab";
import { netAfterTax } from "@/lib/rules";
import { formatDays, formatNumber, formatSek } from "@/lib/format";
import { useLocalStorage } from "@/lib/use-local-storage";

const VAB_DEFAULT = {
  grossMonthlyIncome: 0,
  numberOfChildren: 1,
  singleParent: false,
  daysUsedThisYear: 0,
};

export function VabCalculator() {
  // Inputs are persisted on the device so they survive reloads.
  const [vab, setVab] = useLocalStorage("foraldradagar.vab.v1", VAB_DEFAULT);
  const { grossMonthlyIncome, numberOfChildren, singleParent, daysUsedThisYear } =
    vab;
  const setIncome = (n: number) =>
    setVab((v) => ({ ...v, grossMonthlyIncome: n }));
  const setChildren = (n: number) =>
    setVab((v) => ({ ...v, numberOfChildren: n }));
  const setSingleParent = (b: boolean) =>
    setVab((v) => ({ ...v, singleParent: b }));
  const setUsed = (n: number) => setVab((v) => ({ ...v, daysUsedThisYear: n }));

  const result = useMemo(
    () =>
      computeVab({
        grossMonthlyIncome,
        numberOfChildren,
        singleParent,
        daysUsedThisYear,
      }),
    [grossMonthlyIncome, numberOfChildren, singleParent, daysUsedThisYear],
  );

  const usedPct =
    result.annualCapacity > 0 ? (result.used / result.annualCapacity) * 100 : 0;

  const rules = [
    {
      icon: Baby,
      text: `Vab gäller i regel från ${VAB_AGE.minMonths} månader till och med året innan barnet fyller ${VAB_AGE.standardUntilAge}. För yngre barn används vanlig föräldrapenning.`,
    },
    {
      icon: CircleAlert,
      text: `För barn mellan ${VAB_AGE.standardUntilAge} och ${VAB_AGE.certificateUntilAge} år krävs särskilt intyg för att få ersättning.`,
    },
    {
      icon: Clock,
      text: `Från den ${VAB_RULES.certificateFromDay}:e dagen i en vårdperiod behövs ett intyg från vården.`,
    },
    {
      icon: CalendarDays,
      text: `Från 1 april 2026: ansök inom ${VAB_RULES.applicationDeadlineDays} dagar, annars betalas ingen ersättning.`,
    },
    {
      icon: Users,
      text: "Vab-dagar kan överlåtas till någon annan som avstår arbete för att vårda barnet, till exempel en mor- eller farförälder.",
    },
    {
      icon: Wallet,
      text: `Taket för vab är lägre än för föräldrapenning: 7,5 prisbasbelopp (${formatNumber(
        VAB_MONEY.sgiAnnualCap,
      )} kr/år), vilket ger som mest ca ${formatNumber(VAB_MONEY.maxPerDay)} kr/dag.`,
    },
  ];

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
            <NumberField
              id="vab-income"
              label="Bruttolön per månad (kr)"
              value={grossMonthlyIncome}
              step={1000}
              placeholder="0"
              onChange={setIncome}
              hint={
                grossMonthlyIncome > 0
                  ? result.sgiCapped
                    ? `Över taket – ${formatSek(result.dailyAmount)}/dag (max)`
                    : `Ger ca ${formatSek(result.dailyAmount)}/dag`
                  : "Vet du bara nettolönen? Brutto ≈ netto × 1,5."
              }
            />
            <div className="grid grid-cols-2 gap-3">
              <div className="space-y-1.5">
                <Label htmlFor="vab-children">Antal barn</Label>
                <Select
                  id="vab-children"
                  value={numberOfChildren}
                  onChange={(e) => setChildren(Number(e.target.value))}
                >
                  {[1, 2, 3, 4, 5, 6].map((n) => (
                    <option key={n} value={n}>
                      {n} barn
                    </option>
                  ))}
                </Select>
              </div>
              <div className="space-y-1.5">
                <Label htmlFor="vab-custody">Vårdnad</Label>
                <Select
                  id="vab-custody"
                  value={singleParent ? "single" : "joint"}
                  onChange={(e) => setSingleParent(e.target.value === "single")}
                >
                  <option value="joint">Gemensam</option>
                  <option value="single">Ensam</option>
                </Select>
              </div>
            </div>
            <NumberField
              id="vab-used"
              label="Vab-dagar uttagna i år"
              value={daysUsedThisYear}
              placeholder="0"
              stepper
              onChange={setUsed}
            />
            <FkSourceHint what="Uttagna vab-dagar" />
            <Button
              type="button"
              variant="ghost"
              size="sm"
              className="w-full"
              onClick={() => setVab(VAB_DEFAULT)}
            >
              <RotateCcw />
              Börja om
            </Button>
          </CardContent>
        </Card>
      </div>

      {/* Results */}
      <div className="space-y-6">
        <Card>
          <CardHeader>
            <CardTitle>Vab-dagar kvar i år</CardTitle>
            <CardDescription>
              {formatNumber(result.daysPerChild)} dagar per barn och år
              {singleParent ? " (ensam vårdnad)" : ""}.
            </CardDescription>
          </CardHeader>
          <CardContent className="space-y-3">
            <div className="text-3xl font-bold tabular-nums">
              {formatNumber(result.remaining)}{" "}
              <span className="text-muted-foreground text-base font-normal">
                av {formatNumber(result.annualCapacity)} kvar
              </span>
            </div>
            <Progress value={usedPct} indicatorClassName="bg-chart-2" />
            <p className="text-muted-foreground text-xs tabular-nums">
              {formatDays(result.used)} använda
              {result.overUsed ? " — fler än årets tak" : ""}
            </p>
          </CardContent>
        </Card>

        <Card>
          <CardHeader>
            <CardTitle>Uppskattad ersättning</CardTitle>
          </CardHeader>
          <CardContent className="space-y-2">
            <div className="flex items-baseline justify-between">
              <span className="text-muted-foreground text-sm">Per dag</span>
              <span className="font-semibold tabular-nums">
                {formatSek(result.dailyAmount)}
              </span>
            </div>
            <div className="flex items-baseline justify-between">
              <span className="text-muted-foreground text-sm">
                Återstående dagar ({formatNumber(result.remaining)})
              </span>
              <span className="font-semibold tabular-nums">
                {formatSek(result.remainingValue)}
              </span>
            </div>
            <div className="flex items-baseline justify-between">
              <span className="text-muted-foreground text-sm">≈ efter skatt</span>
              <span className="text-muted-foreground tabular-nums">
                {formatSek(netAfterTax(result.remainingValue))}
              </span>
            </div>
            <p className="text-muted-foreground text-xs">
              Cirka 80 % av SGI, före skatt.
              {result.sgiCapped
                ? " Din inkomst ligger över vab-taket, så dagsbeloppet är det högsta möjliga."
                : ""}
            </p>
          </CardContent>
        </Card>

        {result.overUsed && (
          <Alert variant="warning">
            <CircleAlert />
            <AlertTitle>Fler dagar än årets tak</AlertTitle>
            <AlertDescription>
              De uttagna dagarna överstiger årets tak. Kontrollera siffran — vab
              räknas per barn och kalenderår.
            </AlertDescription>
          </Alert>
        )}

        <Card>
          <CardHeader>
            <CardTitle className="flex items-center gap-2 text-base">
              <Info className="size-4" /> Regler för vab
            </CardTitle>
          </CardHeader>
          <CardContent>
            <ul className="space-y-3">
              {rules.map(({ icon: Icon, text }, i) => (
                <li key={i} className="flex gap-3 text-sm">
                  <Icon className="text-muted-foreground mt-0.5 size-4 shrink-0" />
                  <span>{text}</span>
                </li>
              ))}
            </ul>
          </CardContent>
        </Card>
      </div>
    </div>
  );
}
