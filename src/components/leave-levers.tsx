import { Briefcase, Hourglass } from "lucide-react";

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
function fpMonthly(rate: number, bonusFull: number, pace: number): number {
  return approxMonthlyGross(rate, pace) + Math.round((bonusFull * pace) / 7);
}

/** Part-time salary earned on the non-FP days of the week (if working). */
function partTimeMonthly(
  salary: number,
  pace: number,
  works: boolean,
): number {
  if (!works || salary <= 0) return 0;
  return Math.round((salary * (7 - clamp(pace, 0, 7))) / 7);
}

/** Household income while this caregiver is on leave at `pace`. */
function householdMonthly(
  rate: number,
  bonusFull: number,
  salary: number,
  works: boolean,
  partnerSalary: number,
  pace: number,
): number {
  return (
    fpMonthly(rate, bonusFull, pace) +
    partTimeMonthly(salary, pace, works) +
    partnerSalary
  );
}

export interface PhaseControls {
  on: boolean;
  phase1: number;
  phase2: number;
  onToggle: (on: boolean) => void;
  onSetPhase1: (n: number) => void;
  onSetPhase2: (n: number) => void;
}

export interface PartTime {
  works: boolean;
  onToggle: (works: boolean) => void;
}

/**
 * Per-person control. The household monthly income (this caregiver's
 * föräldrapenning + föräldralön, the partner's salary, and — if they work the
 * rest of the week — their part-time salary) is the headline; you set how long
 * the leave runs. Because part-time work largely replaces the lost salary, the
 * real trade-off is time-at-home vs. income, shown live.
 */
export function LeaveLevers({
  name,
  days,
  dailyRate,
  pace,
  bonusFullMonthly = 0,
  salary = 0,
  partnerSalary = 0,
  partTime,
  onSetTarget,
  phase,
}: {
  name: string;
  days: number;
  dailyRate: number;
  pace: number;
  bonusFullMonthly?: number;
  /** This caregiver's own gross monthly salary (for part-time work). */
  salary?: number;
  /** The partner's monthly salary, added to the household total. */
  partnerSalary?: number;
  partTime: PartTime;
  onSetTarget: (minMonthly: number) => void;
  phase: PhaseControls;
}) {
  if (days <= 0 || dailyRate <= 0) return null;

  const showPartTime = partnerSalary > 0; // only a meaningful concept with a partner

  return (
    <div className="space-y-3 rounded-lg border p-3">
      <div className="flex flex-wrap items-center justify-between gap-x-3 gap-y-1.5">
        <span className="text-sm font-medium">{name}</span>
        <div className="flex flex-wrap gap-x-3 gap-y-1.5">
          {showPartTime && (
            <label className="text-muted-foreground flex cursor-pointer items-center gap-1.5 text-xs">
              <input
                type="checkbox"
                aria-label={`Jobbar deltid under ledigheten – ${name}`}
                checked={partTime.works}
                onChange={(e) => partTime.onToggle(e.target.checked)}
                className="accent-primary size-3.5"
              />
              Jobbar deltid
            </label>
          )}
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
      </div>

      {phase.on ? (
        <PhaseLevers
          name={name}
          dailyRate={dailyRate}
          bonusFull={bonusFullMonthly}
          salary={salary}
          worksPartTime={partTime.works}
          partnerSalary={partnerSalary}
          phase={phase}
        />
      ) : (
        <DurationLever
          name={name}
          days={days}
          dailyRate={dailyRate}
          bonusFull={bonusFullMonthly}
          salary={salary}
          worksPartTime={partTime.works}
          partnerSalary={partnerSalary}
          pace={pace}
          onSetTarget={onSetTarget}
        />
      )}
    </div>
  );
}

function DurationLever({
  name,
  days,
  dailyRate,
  bonusFull,
  salary,
  worksPartTime,
  partnerSalary,
  pace,
  onSetTarget,
}: {
  name: string;
  days: number;
  dailyRate: number;
  bonusFull: number;
  salary: number;
  worksPartTime: boolean;
  partnerSalary: number;
  pace: number;
  onSetTarget: (minMonthly: number) => void;
}) {
  const minDays = Math.max(1, Math.round(days)); // shortest leave (pace 7)
  const maxDays = Math.max(minDays + 1, Math.round(MONTHS_CAP * DAYS_PER_MONTH));
  const curDays = clamp(
    pace > 0 ? Math.round((days / pace) * 7) : minDays,
    minDays,
    maxDays,
  );
  const household = householdMonthly(
    dailyRate,
    bonusFull,
    salary,
    worksPartTime,
    partnerSalary,
    pace,
  );
  const fpPart = fpMonthly(dailyRate, bonusFull, pace);
  const workPart = partTimeMonthly(salary, pace, worksPartTime);

  // Pace from a chosen calendar length.
  const fkFromDays = (cd: number) =>
    Math.round(approxMonthlyGross(dailyRate, (minDays / cd) * 7));

  return (
    <>
      <div className="bg-secondary/40 rounded-md px-3 py-2">
        <div className="flex items-baseline justify-between gap-2">
          <span className="text-muted-foreground text-xs">
            {partnerSalary > 0 ? "Hushåll per månad" : "Per månad"}
          </span>
          <span className="text-lg font-bold tabular-nums">
            {formatSek(household)}
          </span>
        </div>
        <div className="text-muted-foreground text-[11px] tabular-nums">
          ersättning ≈ {formatSek(fpPart)}
          {workPart > 0 ? ` + deltidslön ≈ ${formatSek(workPart)}` : ""}
          {partnerSalary > 0
            ? ` + partnerns lön ≈ ${formatSek(partnerSalary)}`
            : ""}
        </div>
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
              aria-label={`Kortast ledighet – ${name}`}
              className="h-7 px-2 text-xs"
              onClick={() => onSetTarget(fkFromDays(minDays))}
            >
              Kortast
            </Button>
            <Button
              type="button"
              size="sm"
              variant="outline"
              aria-label={`Längst ledighet – ${name}`}
              className="h-7 px-2 text-xs"
              onClick={() => onSetTarget(fkFromDays(maxDays))}
            >
              Längst
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

      <p className="text-muted-foreground flex items-center gap-1.5 text-xs">
        {worksPartTime && partnerSalary > 0 ? (
          <>
            <Briefcase className="size-3.5 shrink-0" />
            Längre ledighet = mindre hemtid per vecka (du jobbar mer), inte mindre
            pengar.
          </>
        ) : (
          "Längre ledighet sprider föräldrapenningen tunnare per månad."
        )}
      </p>
    </>
  );
}

function PaceRow({
  label,
  name,
  dailyRate,
  bonusFull,
  salary,
  worksPartTime,
  partnerSalary,
  value,
  onChange,
}: {
  label: string;
  name: string;
  dailyRate: number;
  bonusFull: number;
  salary: number;
  worksPartTime: boolean;
  partnerSalary: number;
  value: number;
  onChange: (n: number) => void;
}) {
  const household = householdMonthly(
    dailyRate,
    bonusFull,
    salary,
    worksPartTime,
    partnerSalary,
    value,
  );
  return (
    <div className="space-y-1.5">
      <div className="flex items-center justify-between gap-2">
        <Label className="text-muted-foreground text-xs font-normal">
          {label}
        </Label>
        <span className="text-sm font-semibold tabular-nums">
          {value} dgr/v · ≈ {formatSek(household)}/mån
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
  salary,
  worksPartTime,
  partnerSalary,
  phase,
}: {
  name: string;
  dailyRate: number;
  bonusFull: number;
  salary: number;
  worksPartTime: boolean;
  partnerSalary: number;
  phase: PhaseControls;
}) {
  return (
    <>
      <PaceRow
        label="Första året"
        name={name}
        dailyRate={dailyRate}
        bonusFull={bonusFull}
        salary={salary}
        worksPartTime={worksPartTime}
        partnerSalary={partnerSalary}
        value={phase.phase1}
        onChange={phase.onSetPhase1}
      />
      <PaceRow
        label="Efter 1 år"
        name={name}
        dailyRate={dailyRate}
        bonusFull={bonusFull}
        salary={salary}
        worksPartTime={worksPartTime}
        partnerSalary={partnerSalary}
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
