import { Coins, Hourglass } from "lucide-react";

import { Button } from "@/components/ui/button";
import { Label } from "@/components/ui/label";
import { approxMonthlyGross, formatSek } from "@/lib/format";

/** Practical longest stretch the duration slider allows. */
const MONTHS_CAP = 36;
const DAYS_PER_MONTH = 30.4;

function clamp(n: number, lo: number, hi: number): number {
  return Math.max(lo, Math.min(hi, n));
}

/** Föräldrapenning + employer föräldralön for `pace`, the way it's drawn. */
function combinedMonthly(rate: number, bonusFull: number, pace: number): number {
  return approxMonthlyGross(rate, pace) + Math.round((bonusFull * pace) / 7);
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
 * Per-person controls, framed around **household** income. While this caregiver
 * is on leave the partner is working, so the monthly figure is this caregiver's
 * föräldrapenning + föräldralön + the partner's salary (`householdBase`). The
 * two sliders (household pay and length of leave) are linked through the pace;
 * "Maxa" maximises the combined household income (fastest pace).
 */
export function LeaveLevers({
  name,
  days,
  dailyRate,
  pace,
  bonusFullMonthly = 0,
  householdBase = 0,
  onSetTarget,
  phase,
}: {
  name: string;
  days: number;
  dailyRate: number;
  pace: number;
  /** Employer föräldralön at full-time pace (monthly), if any. */
  bonusFullMonthly?: number;
  /** The working partner's monthly salary, added to the household total. */
  householdBase?: number;
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
        <PhaseLevers
          name={name}
          dailyRate={dailyRate}
          bonusFull={bonusFullMonthly}
          householdBase={householdBase}
          phase={phase}
        />
      ) : (
        <SinglePaceLevers
          name={name}
          days={days}
          dailyRate={dailyRate}
          bonusFull={bonusFullMonthly}
          householdBase={householdBase}
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
  bonusFull,
  householdBase,
  pace,
  onSetTarget,
}: {
  name: string;
  days: number;
  dailyRate: number;
  bonusFull: number;
  householdBase: number;
  pace: number;
  onSetTarget: (minMonthly: number) => void;
}) {
  // Household monthly = this caregiver's FP + föräldralön + partner salary.
  // Only the FP+bonus part follows the pace; the partner's salary is constant.
  const fkFull = approxMonthlyGross(dailyRate, 7);
  const variableFull = fkFull + bonusFull; // FP + bonus at full pace
  const minDays = Math.max(1, Math.round(days)); // shortest leave (pace 7)
  const maxDays = Math.max(minDays + 1, Math.round(MONTHS_CAP * DAYS_PER_MONTH));

  const curDays = clamp(
    pace > 0 ? Math.round((days / pace) * 7) : minDays,
    minDays,
    maxDays,
  );
  const payFull = variableFull + householdBase; // household at full pace
  const paySlow =
    combinedMonthly(dailyRate, bonusFull, (minDays / maxDays) * 7) +
    householdBase;
  const curPay = combinedMonthly(dailyRate, bonusFull, pace) + householdBase;

  // Map a desired household pay / leave length back to the FK monthly target.
  const fkFromDays = (cd: number) =>
    Math.round(approxMonthlyGross(dailyRate, (minDays / cd) * 7));
  const fkFromPay = (household: number) =>
    variableFull > 0
      ? Math.round(
          (Math.max(0, household - householdBase) / variableFull) * fkFull,
        )
      : fkFull;

  return (
    <>
      <div className="space-y-1.5">
        <div className="flex items-center justify-between gap-2">
          <Label className="text-muted-foreground flex items-center gap-1.5 text-xs font-normal">
            <Coins className="size-3.5" />
            {householdBase > 0 ? "Hushåll per månad" : "Per månad"}
            {bonusFull > 0 ? " (inkl. föräldralön)" : ""}
          </Label>
          <div className="flex items-center gap-2">
            <span className="text-sm font-semibold tabular-nums">
              {formatSek(curPay)}
            </span>
            <Button
              type="button"
              size="sm"
              variant="outline"
              aria-label={`Maxa ersättning – ${name}`}
              className="h-7 px-2 text-xs"
              onClick={() => onSetTarget(fkFull)}
            >
              Maxa
            </Button>
          </div>
        </div>
        <input
          type="range"
          aria-label={`Hushållsinkomst per månad – ${name}`}
          min={Math.round(paySlow)}
          max={Math.round(payFull)}
          step={100}
          value={clamp(curPay, Math.round(paySlow), Math.round(payFull))}
          onChange={(e) => onSetTarget(fkFromPay(Number(e.target.value)))}
          className="accent-primary w-full"
        />
        {householdBase > 0 && (
          <p className="text-muted-foreground text-[11px]">
            varav ≈ {formatSek(householdBase)}/mån i partnerns lön (hen arbetar)
          </p>
        )}
      </div>

      <div className="space-y-1.5">
        <div className="flex items-center justify-between gap-2">
          <Label className="text-muted-foreground flex items-center gap-1.5 text-xs font-normal">
            <Hourglass className="size-3.5" /> Ledighetens längd
          </Label>
          <div className="flex items-center gap-2">
            <span className="text-sm font-semibold tabular-nums">
              ≈ {(curDays / DAYS_PER_MONTH).toFixed(1).replace(".", ",")} mån
            </span>
            <Button
              type="button"
              size="sm"
              variant="outline"
              aria-label={`Maxa ledighet – ${name}`}
              className="h-7 px-2 text-xs"
              onClick={() => onSetTarget(fkFromDays(maxDays))}
            >
              Maxa
            </Button>
          </div>
        </div>
        <input
          type="range"
          aria-label={`Ledighetens längd i dagar – ${name}`}
          min={minDays}
          max={maxDays}
          step={1}
          value={curDays}
          onChange={(e) => onSetTarget(fkFromDays(Number(e.target.value)))}
          className="accent-primary w-full"
        />
      </div>

      <p className="text-muted-foreground text-xs">
        Mer per månad ger kortare ledighet — och tvärtom. Justeras dag för dag.
      </p>
    </>
  );
}

function PaceRow({
  label,
  name,
  dailyRate,
  bonusFull,
  householdBase,
  value,
  onChange,
}: {
  label: string;
  name: string;
  dailyRate: number;
  bonusFull: number;
  householdBase: number;
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
          {value} dgr/v · ≈{" "}
          {formatSek(combinedMonthly(dailyRate, bonusFull, value) + householdBase)}
          /mån
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
  bonusFull,
  householdBase,
  phase,
}: {
  name: string;
  dailyRate: number;
  bonusFull: number;
  householdBase: number;
  phase: PhaseControls;
}) {
  return (
    <>
      <PaceRow
        label="Första året"
        name={name}
        dailyRate={dailyRate}
        bonusFull={bonusFull}
        householdBase={householdBase}
        value={phase.phase1}
        onChange={phase.onSetPhase1}
      />
      <PaceRow
        label="Efter 1 år"
        name={name}
        dailyRate={dailyRate}
        bonusFull={bonusFull}
        householdBase={householdBase}
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
