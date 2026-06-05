import {
  Card,
  CardContent,
  CardDescription,
  CardHeader,
  CardTitle,
} from "@/components/ui/card";
import { Separator } from "@/components/ui/separator";
import { SGI_PROTECTION, lagstanivaDailyAmount, netAfterTax } from "@/lib/rules";
import { approxMonthlyGross, formatSek } from "@/lib/format";

export interface MonthlyRow {
  name: string;
  /** Income-based (sjukpenningnivå) daily rate for this person. */
  dailyRate: number;
}

/**
 * "How much per month" — turns each person's daily rate into a rough monthly
 * deposit at the chosen leave pace, and surfaces the post-12-month SGI
 * condition when the pace is below the weekly floor.
 */
export function MonthlyEstimate({
  rows,
  daysPerWeek,
}: {
  rows: MonthlyRow[];
  daysPerWeek: number;
}) {
  const belowSgiFloor = daysPerWeek < SGI_PROTECTION.minDaysPerWeekAfterAge1;

  return (
    <Card>
      <CardHeader>
        <CardTitle>Ungefär så mycket per månad</CardTitle>
        <CardDescription>
          När inkomstbaserade dagar tas ut i takten {daysPerWeek} dagar/vecka.
        </CardDescription>
      </CardHeader>
      <CardContent className="space-y-4">
        {rows.map((r, i) => {
          const gross = approxMonthlyGross(r.dailyRate, daysPerWeek);
          return (
            <div
              key={i}
              className="flex items-baseline justify-between gap-3"
            >
              <span className="font-medium">{r.name}</span>
              <div className="text-right">
                <div className="text-xl font-semibold tabular-nums">
                  {formatSek(gross)}/mån
                </div>
                <div className="text-muted-foreground text-xs tabular-nums">
                  ≈ {formatSek(netAfterTax(gross))} efter skatt ·{" "}
                  {formatSek(r.dailyRate)}/dag
                </div>
              </div>
            </div>
          );
        })}

        <Separator />

        <p className="text-muted-foreground text-xs">
          Föräldrapenning betalas per uttagen dag, så månadsbeloppet följer hur
          många dagar i veckan som tas ut. Lägstanivådagar ger{" "}
          {formatSek(lagstanivaDailyAmount())}/dag.
        </p>

        {belowSgiFloor && (
          <p className="text-xs">
            <span className="font-medium">Tänk på SGI:</span> efter barnets
            1-årsdag skyddas SGI bara om du tar ut minst{" "}
            {SGI_PROTECTION.minDaysPerWeekAfterAge1} dagar/vecka — eller arbetar
            resten av veckan. Under det första året är SGI skyddad oavsett takt.
          </p>
        )}
      </CardContent>
    </Card>
  );
}
