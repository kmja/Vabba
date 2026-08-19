import { IconBriefcase, IconHourglass } from "@tabler/icons-react";

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

/** Two views of the same dial: a caregiver's leave as calendar length ↔ pace. */
function leaveLengthModel(days: number, pace: number, dailyRate: number) {
  const minDays = Math.max(1, Math.round(days)); // shortest leave (pace 7)
  const maxDays = Math.max(minDays + 1, Math.round(MONTHS_CAP * DAYS_PER_MONTH));
  const curDays = clamp(
    pace > 0 ? Math.round((days / pace) * 7) : minDays,
    minDays,
    maxDays,
  );
  // Föräldrapenning monthly target for a chosen calendar length (drives pace).
  const fkFromDays = (cd: number) =>
    Math.round(approxMonthlyGross(dailyRate, (minDays / cd) * 7));
  return { minDays, maxDays, curDays, fkFromDays };
}

/** Compact, standalone "Ledighetens längd" slider for one caregiver. */
export function LeaveLengthSlider({
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
  if (days <= 0 || dailyRate <= 0) return null;
  const { minDays, maxDays, curDays, fkFromDays } = leaveLengthModel(
    days,
    pace,
    dailyRate,
  );
  return (
    <div className="space-y-1">
      <div className="flex items-center justify-between gap-2">
        <span className="flex items-center gap-1.5 text-sm font-medium">
          <IconHourglass className="text-muted-foreground size-3.5" /> {name}
        </span>
        <span className="text-sm font-semibold tabular-nums">
          ≈ {(curDays / DAYS_PER_MONTH).toFixed(1).replace(".", ",")} mån
        </span>
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
  showIncome = true,
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
  /** Inside a period block the card above already shows the income live. */
  showIncome?: boolean;
}) {
  const { minDays, maxDays, curDays, fkFromDays } = leaveLengthModel(
    days,
    pace,
    dailyRate,
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

  return (
    <>
      {showIncome && (
      <div className="bg-secondary/40 rounded-md px-3 py-2">
        <div className="flex items-baseline justify-between gap-2">
          <span className="text-muted-foreground text-xs">
            {partnerSalary > 0
              ? "Hushåll per månad (före skatt)"
              : "Per månad (före skatt)"}
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
      )}

      <div className="space-y-1.5">
        <div className="flex flex-wrap items-center justify-between gap-2">
          <Label className="text-muted-foreground flex items-center gap-1.5 text-xs font-normal">
            <IconHourglass className="size-3.5" /> Ledighetens längd
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
            <IconBriefcase className="size-3.5 shrink-0" />
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
  showIncome = true,
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
  /** Inside a period block the card above already shows the income. */
  showIncome?: boolean;
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
          {value} dgr/v
          {showIncome ? ` · ≈ ${formatSek(household)}/mån` : ""}
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

/** Everything one period block needs to drive its own stretch. */
export interface PeriodControls {
  name: string;
  days: number;
  dailyRate: number;
  pace: number;
  bonusFullMonthly: number;
  salary: number;
  partnerSalary: number;
  partTime: PartTime;
  phase: PhaseControls;
  onSetTarget: (minMonthly: number) => void;
}

/**
 * The levers for one period block — the same dials as the plan-wide panel,
 * scoped to the stretch you are looking at. A block that IS a phase (the pace
 * changes at the child's first birthday) gets that phase's pace row; a
 * caregiver's single block gets the length slider instead.
 *
 * The two per-caregiver switches (part-time, change pace at 1 year) belong to
 * the person rather than the stretch, so they sit on their first block only.
 */
export function PeriodLevers({
  controls,
  phase: which,
  showToggles,
  goalDriven,
}: {
  controls: PeriodControls;
  /** 1 or 2 when this block is a phase; null when it is the whole stretch. */
  phase: 1 | 2 | null;
  showToggles: boolean;
  /** A solved goal sets the length — the length slider would fight it. */
  goalDriven: boolean;
}) {
  const {
    name,
    days,
    dailyRate,
    pace,
    bonusFullMonthly,
    salary,
    partnerSalary,
    partTime,
    phase,
  } = controls;
  if (days <= 0 || dailyRate <= 0) return null;
  const showPartTime = partnerSalary > 0;
  // A goal (a date, a budget floor) makes the solver choose the pace and the
  // length. The phase sliders write to settings it overrides, so offering
  // them would be offering a dial that does nothing — and printing their
  // arithmetic beside the block's own card would show two different numbers
  // for the same month. A block can also be a phase because the SOLVER split
  // it, not because this switch is on; that is the same case.
  const showPace = which !== null && phase.on && !goalDriven;

  return (
    <div className="space-y-3 rounded-lg border p-3">
      {showToggles && (showPartTime || !goalDriven) && (
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
          {/* The solver sets the pace under a goal — this switch would not
              change anything there. */}
          {!goalDriven && (
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
          )}
        </div>
      )}

      {showPace ? (
        <>
          <PaceRow
            label={which === 1 ? "Takt första året" : "Takt efter 1 år"}
            name={name}
            dailyRate={dailyRate}
            bonusFull={bonusFullMonthly}
            salary={salary}
            worksPartTime={partTime.works}
            partnerSalary={partnerSalary}
            value={which === 1 ? phase.phase1 : phase.phase2}
            onChange={which === 1 ? phase.onSetPhase1 : phase.onSetPhase2}
            showIncome={false}
          />
          {which === 2 &&
            (phase.phase2 < 5 ? (
              <p className="text-xs">
                <span className="font-medium">Obs:</span> under 5 dagar/vecka
                efter 1-årsdagen kan sänka SGI:n om du inte också arbetar.
              </p>
            ) : (
              <p className="text-muted-foreground text-xs">
                5 dagar/vecka efter 1 år skyddar SGI:n.
              </p>
            ))}
        </>
      ) : goalDriven ? (
        <p className="text-muted-foreground text-xs">
          Takten och längden räknas ut från målet — ändra datumet här ovanför,
          eller målet i guiden.
        </p>
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
          onSetTarget={controls.onSetTarget}
          // The period card right above already shows this stretch's income,
          // live — a second number here only invites comparing gross to net.
          showIncome={false}
        />
      )}
    </div>
  );
}
