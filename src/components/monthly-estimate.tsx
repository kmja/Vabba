import {
  Card,
  CardContent,
  CardDescription,
  CardHeader,
  CardTitle,
} from "@/components/ui/card";
import { Separator } from "@/components/ui/separator";
import { SGI_PROTECTION, lagstanivaDailyAmount, netAfterTax } from "@/lib/rules";
import {
  approxLeaveMonths,
  approxMonthlyGross,
  formatDays,
  formatPace,
  formatSek,
} from "@/lib/format";

export interface MonthlyRow {
  name: string;
  /** Income-based (sjukpenningnivå) daily rate for this person. */
  dailyRate: number;
  /** Total days allocated to this person. */
  days: number;
}

/**
 * Results lead: each vårdnadshavare's rough monthly deposit at the chosen leave
 * pace, plus how many days that is and how long it lasts. Surfaces the
 * post-12-month SGI condition when the pace is below the weekly floor.
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
        <CardTitle>Så mycket per månad – och hur länge</CardTitle>
        <CardDescription>
          När inkomstbaserade dagar tas ut i takten {formatPace(daysPerWeek)}{" "}
          dagar/vecka.
        </CardDescription>
      </CardHeader>
      <CardContent className="space-y-4">
        {rows.map((r, i) => {
          const gross = approxMonthlyGross(r.dailyRate, daysPerWeek);
          return (
            <div key={i} className="rounded-lg border p-4">
              <div className="flex items-baseline justify-between gap-3">
                <span className="font-medium">{r.name}</span>
                <span className="text-2xl font-bold tabular-nums">
                  {formatSek(gross)}
                  <span className="text-muted-foreground text-sm font-normal">
                    /mån
                  </span>
                </span>
              </div>
              <div className="text-muted-foreground mt-1 flex flex-wrap items-baseline justify-between gap-x-3 text-xs tabular-nums">
                <span>
                  {formatDays(r.days)} · {approxLeaveMonths(r.days, daysPerWeek)}
                </span>
                <span>
                  ≈ {formatSek(netAfterTax(gross))} efter skatt ·{" "}
                  {formatSek(r.dailyRate)}/dag
                </span>
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
