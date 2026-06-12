import { Coins, Hourglass } from "lucide-react";

import { Button } from "@/components/ui/button";
import { Label } from "@/components/ui/label";
import { approxMonthlyGross, formatSek } from "@/lib/format";

/** Practical longest stretch the months slider allows. */
const MONTHS_CAP = 36;
const DAYS_PER_MONTH = 30.4;

function monthsAtPace(days: number, pace: number): number {
  return pace > 0 ? (days * 7) / (pace * DAYS_PER_MONTH) : 0;
}

function clamp(n: number, lo: number, hi: number): number {
  return Math.max(lo, Math.min(hi, n));
}

/**
 * Per-person trade-off levers. A caregiver's monthly pay and leave duration are
 * two views of one variable — their pace (days/week) — so the two sliders are
 * linked: dragging either re-derives a monthly target that drives the pace.
 */
export function LeaveLevers({
  name,
  days,
  dailyRate,
  pace,
  onSetTarget,
}: {
  name: string;
  /** Days allocated to this caregiver (fixed by the split). */
  days: number;
  /** Their income-based daily rate. */
  dailyRate: number;
  /** Their current leave pace (days/week). */
  pace: number;
  /** Set this caregiver's target monthly pay (which sets the pace). */
  onSetTarget: (minMonthly: number) => void;
}) {
  if (days <= 0 || dailyRate <= 0) return null;

  const payFull = approxMonthlyGross(dailyRate, 7); // fastest → most per month
  const monthsFull = monthsAtPace(days, 7); // fastest → shortest leave
  const monthsMin = Math.max(1, Math.floor(monthsFull));
  const monthsMax = Math.max(monthsMin + 1, MONTHS_CAP);
  const paySlow = Math.max(1, Math.round((dailyRate * days) / monthsMax));

  const currentPay = approxMonthlyGross(dailyRate, pace);
  const currentMonths = monthsAtPace(days, pace);
  const payValue = clamp(currentPay, paySlow, payFull);
  const monthsValue = clamp(Math.round(currentMonths), monthsMin, monthsMax);

  return (
    <div className="space-y-3 rounded-lg border p-3">
      <div className="text-sm font-medium">{name}</div>

      {/* Pay lever */}
      <div className="space-y-1.5">
        <div className="flex items-center justify-between gap-2">
          <Label className="text-muted-foreground flex items-center gap-1.5 text-xs font-normal">
            <Coins className="size-3.5" /> Ersättning per månad
          </Label>
          <div className="flex items-center gap-2">
            <span className="text-sm font-semibold tabular-nums">
              {formatSek(currentPay)}
            </span>
            <Button
              type="button"
              size="sm"
              variant="outline"
              className="h-7 px-2 text-xs"
              onClick={() => onSetTarget(payFull)}
            >
              Maxa
            </Button>
          </div>
        </div>
        <input
          type="range"
          aria-label={`Ersättning per månad – ${name}`}
          min={paySlow}
          max={payFull}
          step={500}
          value={payValue}
          onChange={(e) => onSetTarget(Number(e.target.value))}
          className="accent-primary w-full"
        />
      </div>

      {/* Months lever */}
      <div className="space-y-1.5">
        <div className="flex items-center justify-between gap-2">
          <Label className="text-muted-foreground flex items-center gap-1.5 text-xs font-normal">
            <Hourglass className="size-3.5" /> Månader ledigt
          </Label>
          <div className="flex items-center gap-2">
            <span className="text-sm font-semibold tabular-nums">
              ≈ {Math.round(currentMonths)} mån
            </span>
            <Button
              type="button"
              size="sm"
              variant="outline"
              className="h-7 px-2 text-xs"
              onClick={() => onSetTarget(paySlow)}
            >
              Förläng
            </Button>
          </div>
        </div>
        <input
          type="range"
          aria-label={`Månader ledigt – ${name}`}
          min={monthsMin}
          max={monthsMax}
          step={1}
          value={monthsValue}
          onChange={(e) =>
            onSetTarget(Math.round((dailyRate * days) / Number(e.target.value)))
          }
          className="accent-primary w-full"
        />
      </div>

      <p className="text-muted-foreground text-xs">
        Mer per månad ger kortare ledighet — och tvärtom.
      </p>
    </div>
  );
}
