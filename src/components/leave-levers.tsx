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

export interface PhaseControls {
  on: boolean;
  phase1: number;
  phase2: number;
  onToggle: (on: boolean) => void;
  onSetPhase1: (n: number) => void;
  onSetPhase2: (n: number) => void;
}

/**
 * Per-person controls. By default a single pace, exposed as two linked sliders
 * (monthly pay and months of leave — two views of the same dial). Turn on
 * "byt takt vid 1 år" to take a second period at a different pace (e.g. slower
 * the first year, then 5/week to keep SGI).
 */
export function LeaveLevers({
  name,
  days,
  dailyRate,
  pace,
  onSetTarget,
  phase,
}: {
  name: string;
  days: number;
  dailyRate: number;
  pace: number;
  onSetTarget: (minMonthly: number) => void;
  phase: PhaseControls;
}) {
  if (days <= 0 || dailyRate <= 0) return null;

  return (
    <div className="space-y-3 rounded-lg border p-3">
      <div className="flex items-center justify-between gap-2">
        <span className="text-sm font-medium">{name}</span>
        <label className="text-muted-foreground flex cursor-pointer items-center gap-1.5 text-xs">
          <input
            type="checkbox"
            aria-label={`Byt takt vid 1 år – ${name}`}
            checked={phase.on}
            onChange={(e) => phase.onToggle(e.target.checked)}
            className="accent-primary size-3.5"
          />
          Byt takt vid 1 år
        </label>
      </div>

      {phase.on ? (
        <PhaseLevers name={name} dailyRate={dailyRate} phase={phase} />
      ) : (
        <SinglePaceLevers
          name={name}
          days={days}
          dailyRate={dailyRate}
          pace={pace}
          onSetTarget={onSetTarget}
        />
      )}
    </div>
  );
}

function SinglePaceLevers({
  name,
  days,
  dailyRate,
  pace,
  onSetTarget,
}: {
  name: string;
  days: number;
  dailyRate: number;
  pace: number;
  onSetTarget: (minMonthly: number) => void;
}) {
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
    <>
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
              aria-label={`Maxa ersättning – ${name}`}
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
              aria-label={`Maxa ledighet – ${name}`}
              className="h-7 px-2 text-xs"
              onClick={() => onSetTarget(paySlow)}
            >
              Maxa
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
    </>
  );
}

function PaceRow({
  label,
  name,
  dailyRate,
  value,
  onChange,
}: {
  label: string;
  name: string;
  dailyRate: number;
  value: number;
  onChange: (n: number) => void;
}) {
  return (
    <div className="space-y-1.5">
      <div className="flex items-center justify-between gap-2">
        <Label className="text-muted-foreground text-xs font-normal">
          {label}
        </Label>
        <span className="text-sm font-semibold tabular-nums">
          {value} dgr/v · ≈ {formatSek(approxMonthlyGross(dailyRate, value))}/mån
        </span>
      </div>
      <input
        type="range"
        aria-label={`${label} – ${name}`}
        min={1}
        max={7}
        step={1}
        value={value}
        onChange={(e) => onChange(Number(e.target.value))}
        className="accent-primary w-full"
      />
    </div>
  );
}

function PhaseLevers({
  name,
  dailyRate,
  phase,
}: {
  name: string;
  dailyRate: number;
  phase: PhaseControls;
}) {
  return (
    <>
      <PaceRow
        label="Första året"
        name={name}
        dailyRate={dailyRate}
        value={phase.phase1}
        onChange={phase.onSetPhase1}
      />
      <PaceRow
        label="Efter 1 år"
        name={name}
        dailyRate={dailyRate}
        value={phase.phase2}
        onChange={phase.onSetPhase2}
      />
      {phase.phase2 < 5 ? (
        <p className="text-xs">
          <span className="font-medium">Obs:</span> under 5 dagar/vecka efter
          1-årsdagen kan sänka SGI:n om du inte också arbetar.
        </p>
      ) : (
        <p className="text-muted-foreground text-xs">
          5 dagar/vecka efter 1 år skyddar SGI:n.
        </p>
      )}
    </>
  );
}
