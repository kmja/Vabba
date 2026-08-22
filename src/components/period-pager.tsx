import { Fragment, useState, type ReactNode } from "react";
import { IconChevronDown, IconInfoCircle } from "@tabler/icons-react";

import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import {
  CG_BAR,
  IncomeBreakdownTable,
  PeriodCard,
  type LeaveProjection,
} from "@/components/timeline";
import {
  formatMonths,
  householdMonthly,
  householdNetMonthly,
  incomeSources,
  type IncomeSource,
  type MonthlyRow,
} from "@/components/monthly-estimate";
import { PeriodLevers, type PeriodControls } from "@/components/leave-levers";
import type { GoalMode } from "@/lib/goal-seek";
import type { PlanDeadlines } from "@/lib/calc";
import type { LeaveInterval } from "@/lib/projection";
import type { BirthDaysResult } from "@/lib/birth-days";
import { netOfExtra } from "@/lib/tax";
import { MONEY, SGI_PROTECTION } from "@/lib/rules";
import { formatDate, formatDays, formatPace, formatSek } from "@/lib/format";
import { addDays, differenceInDays, toIsoDate } from "@/lib/dates";
import { cn } from "@/lib/utils";

/** Callbacks that let a period's date edits drive the plan ("custom" mode). */
export interface PeriodEditing {
  /** Caregiver display name → parent id. */
  idByName: Record<string, "A" | "B">;
  modeById: Record<"A" | "B", GoalMode>;
  hasStartOverride: Record<"A" | "B", boolean>;
  /** Editing a period's end sets that caregiver's "hemma till" date goal. */
  onEndDate: (id: "A" | "B", iso: string) => void;
  /** Back to the automatic length (as long as possible). */
  onClearEnd: (id: "A" | "B") => void;
  /** Editing a period's start delays it (a gap where both work). */
  onStartDate: (id: "A" | "B", iso: string | null) => void;
}

interface Period {
  caregiver: string;
  startsAt: Date;
  endsAt: Date;
  segments: LeaveInterval[];
  /** What makes this stretch its own block, when it isn't simply "them". */
  phase: string | null;
  /** Where this sits in its caregiver's run of periods. */
  firstOfCaregiver: boolean;
  lastOfCaregiver: boolean;
  /** When their whole run began — föräldralön is counted from there. */
  caregiverStart: Date;
  /**
   * This is `firstOfCaregiver`'s block, but its displayed start has been
   * cropped past the true one — the true start is inside a combined block
   * shown earlier. Distinct from `firstOfCaregiver` on purpose: the
   * whole-stretch toggles (part-time, byt takt vid 1 år) still belong here,
   * but the editable start date and the "first block" facts (grundnivå,
   * extra days) do not — those are attributed to the combined block instead.
   */
  truncatedStart?: boolean;
}

function paceText(pace: number): string {
  return `${Number(pace.toFixed(1)).toString().replace(".", ",")} dagar/vecka`;
}

/**
 * The projection's segments, grouped into the blocks a reader would call
 * separate periods: a new caregiver, obviously — but also a change of pace
 * (the SGI floor lifts it at the 1-year mark) or of tier, since either one
 * changes the dates AND the money. Merging those into one card meant a block
 * whose headline income was true for only part of it.
 */
function toPeriods(segments: LeaveInterval[]): Period[] {
  const out: Period[] = [];
  for (const seg of segments) {
    const cg = seg.caregiver ?? "";
    const last = out[out.length - 1];
    const same =
      last &&
      last.caregiver === cg &&
      // Adjacent in time, not just matching pace/tier — a dubbeldagar
      // overlap and a caregiver's later sequential stretch can share both
      // without being the same stretch of the calendar.
      last.endsAt.getTime() === seg.startsAt.getTime() &&
      Math.abs(last.segments[0].pace - seg.pace) < 0.05 &&
      last.segments[0].tier === seg.tier;
    if (same) {
      last.endsAt = seg.endsAt;
      last.segments.push(seg);
    } else {
      out.push({
        caregiver: cg,
        startsAt: seg.startsAt,
        endsAt: seg.endsAt,
        segments: [seg],
        phase: null,
        firstOfCaregiver: last?.caregiver !== cg,
        lastOfCaregiver: true,
        caregiverStart: last?.caregiver === cg ? last.caregiverStart : seg.startsAt,
      });
      if (last?.caregiver === cg) last.lastOfCaregiver = false;
    }
  }
  // Name the blocks that share a caregiver, so the pager can tell them apart.
  for (const per of out) {
    const solo = out.filter((o) => o.caregiver === per.caregiver).length === 1;
    per.phase = solo
      ? null
      : per.segments[0].tier === "lagsta"
        ? "lägstanivå"
        : paceText(per.segments[0].pace);
  }
  return out;
}

/**
 * The economy of one block. The caregiver's row describes their whole
 * stretch, so the pace, the days, the length and the föräldralön months are
 * narrowed to what actually falls inside this block.
 */
function rowForPeriod(base: MonthlyRow, p: Period): MonthlyRow {
  const seg = p.segments[0];
  const months = differenceInDays(p.startsAt, p.endsAt) / 30.4;
  const days = Math.round(
    p.segments.reduce(
      (a, s) => a + (differenceInDays(s.startsAt, s.endsAt) / 7) * s.pace,
      0,
    ),
  );
  const basePace = base.daysPerWeek;
  // Part-time pay is what they earn on the days they are NOT drawing benefit,
  // so it moves with the pace of this block.
  const partTimeSalary =
    base.partTimeSalary && basePace < 7
      ? (base.partTimeSalary * (7 - seg.pace)) / (7 - basePace)
      : base.partTimeSalary;
  const supp = base.supplement;
  // Rounded, because it is shown as "i ca N mån" — a raw overlap would read
  // as 2.3026315789473686.
  const suppMonths = supp
    ? Math.round(
        Math.max(
          0,
          Math.min(
            months,
            supp.months - differenceInDays(p.caregiverStart, p.startsAt) / 30.4,
          ),
        ) * 10,
      ) / 10
    : 0;
  // Föräldralön scales with how much of the week is actually spent on leave.
  // base.supplement.monthly was sized for the caregiver's first-phase pace;
  // rescale it for blocks that draw at a different one (a pace change inside
  // the föräldralön window, or the lägstanivå tier, pays no top-up at all).
  const suppMonthly =
    supp && basePace > 0 && seg.tier !== "lagsta"
      ? Math.round((supp.monthly * seg.pace) / basePace)
      : 0;
  return {
    ...base,
    daysPerWeek: seg.pace,
    // Back out the daily rate this block is actually paid at — lägstanivå
    // blocks pay a different one from the income-based ones.
    dailyRate: seg.pace > 0 ? (seg.monthly * 7) / (30.4 * seg.pace) : 0,
    days,
    leaveMonths: months,
    partTimeSalary,
    // Each block IS a phase now; the "efter 1 år" footnote has become the
    // next block.
    secondPhase: undefined,
    supplement:
      supp && suppMonths > 0.1 && suppMonthly > 0
        ? { ...supp, monthly: suppMonthly, months: suppMonths, total: suppMonthly * suppMonths }
        : undefined,
    // Facts about the whole stretch belong to one end of it.
    grundnivaFirstDays:
      p.firstOfCaregiver && !p.truncatedStart ? base.grundnivaFirstDays : undefined,
    extraDays: p.firstOfCaregiver && !p.truncatedStart ? base.extraDays : undefined,
    savedDays: p.lastOfCaregiver ? base.savedDays : undefined,
  };
}

/** One segment, cut down to `[from, to)`; null if it doesn't reach that far. */
function clipSegment(
  seg: LeaveInterval,
  from: Date,
  to: Date,
): LeaveInterval | null {
  const start = seg.startsAt.getTime() > from.getTime() ? seg.startsAt : from;
  const end = seg.endsAt.getTime() < to.getTime() ? seg.endsAt : to;
  return start.getTime() < end.getTime() ? { ...seg, startsAt: start, endsAt: end } : null;
}

/**
 * The 10-dagar and a caregiver's own leave both start at the birth, but they
 * are not the same stretch — one is tillfällig-FP for the other parent, the
 * other draws down the 480. Rendered as two overlapping blocks they read as
 * two things happening at once with no relation, which is confusing at the
 * exact moment two incomes actually matter most. Where they overlap, this
 * builds ONE combined view for that shared window: both incomes together,
 * neither one carrying the other as a "salary" line (nobody is earning a
 * salary those days).
 */
function overlapWindow(
  birth: Period,
  first: Period,
  base: MonthlyRow | undefined,
  birthDays: { result: BirthDaysResult; name: string; salary: number },
  municipalRate: number | undefined,
): {
  endsAt: Date;
  caregiver1: string;
  caregiver2: string;
  pace2: string;
  sources: IncomeSource[];
  net: number;
  grundnivaFirstDays?: number;
  extraDays?: number;
} | null {
  if (birth.caregiver === first.caregiver) return null;
  if (birth.startsAt.getTime() !== first.startsAt.getTime()) return null;
  if (!base) return null;
  const overlapEnd =
    birth.endsAt.getTime() < first.endsAt.getTime() ? birth.endsAt : first.endsAt;
  if (overlapEnd.getTime() <= birth.startsAt.getTime()) return null;

  const slice: Period = {
    ...first,
    startsAt: birth.startsAt,
    endsAt: overlapEnd,
    segments: first.segments
      .map((s) => clipSegment(s, birth.startsAt, overlapEnd))
      .filter((s): s is LeaveInterval => s !== null),
  };
  if (slice.segments.length === 0) return null;
  const sliceRow = rowForPeriod(base, slice);
  // Kalle isn't earning his salary the days he is on birth-days leave —
  // don't carry it into this window as if he were at work.
  const monthlyOwnSources = incomeSources(
    { ...sliceRow, householdBase: 0, partnerWorking: undefined },
    municipalRate,
  );
  // incomeSources() reports a MONTHLY rate — the same rate this caregiver's
  // continuing block reports. Kalle's birth-days figure, by contrast, is
  // already the exact total for these `windowDays` — a lump sum, not a
  // rate. Scaling Niki's rate down to the same window before adding them is
  // what makes the total mean anything; summing a monthly rate with a
  // 10-day total would silently overstate her side several-fold.
  const windowDays = differenceInDays(birth.startsAt, overlapEnd);
  const ratio = windowDays / 30.4;
  // Grouped by whose row it is — otherwise two people's sources read as one
  // unexplained list (and, when both have the same kind of income, as
  // duplicate rows with no way to tell whose is whose).
  const ownSources = monthlyOwnSources.map((s) => ({
    ...s,
    net: Math.round(s.net * ratio),
    gross: Math.round(s.gross * ratio),
    group: first.caregiver,
  }));
  const birthNet = netOfExtra(
    birthDays.result.total,
    { salary: birthDays.salary },
    true,
    municipalRate,
  );
  return {
    endsAt: overlapEnd,
    caregiver1: birth.caregiver,
    caregiver2: first.caregiver,
    pace2: `${formatPace(slice.segments[0].pace)} dagar/vecka`,
    sources: [
      ...ownSources,
      {
        key: "birthdays",
        label: "Vid födseln",
        net: birthNet,
        gross: birthDays.result.total,
        group: birth.caregiver,
      },
    ],
    net: ownSources.reduce((sum, s) => sum + s.net, 0) + birthNet,
    // The true start of the caregiver's stretch is inside this window, so
    // whatever applies to that start belongs here, not on the continuing
    // block (which would otherwise repeat — or the note would go missing
    // if neither block claimed it).
    grundnivaFirstDays: base.grundnivaFirstDays,
    extraDays: base.extraDays,
  };
}

/**
 * Where dubbeldagar overlap the first caregiver's ongoing leave — both
 * drawing regular föräldrapenning at once — fold the two into one block,
 * the same idea as the birth-days merge above. Unlike that one, both sides
 * are ordinary monthly-rate income (no TFP lump sum to reconcile), so both
 * get the same "scale to this window" treatment.
 *
 * `second` is dubbeldagar's own already-built Period (from `toPeriods`) —
 * it exists as a real, dated entry in the caregiver's segment list, just in
 * the wrong place: pushed in alongside that caregiver's own LATER
 * sequential stretch, so array order puts it after the first caregiver's
 * still-ongoing block rather than beside it. This merge is what actually
 * displays it; the caller filters the standalone entry out.
 */
function doubleDaysOverlap(
  first: Period,
  second: Period,
  firstBase: MonthlyRow | undefined,
  secondBase: MonthlyRow | undefined,
  municipalRate: number | undefined,
): {
  startsAt: Date;
  endsAt: Date;
  caregiver1: string;
  caregiver2: string;
  pace1: string;
  sources: IncomeSource[];
  net: number;
} | null {
  if (!firstBase || !secondBase) return null;
  if (second.endsAt.getTime() <= second.startsAt.getTime()) return null;

  const firstSlice: Period = {
    ...first,
    startsAt: second.startsAt,
    endsAt: second.endsAt,
    segments: first.segments
      .map((s) => clipSegment(s, second.startsAt, second.endsAt))
      .filter((s): s is LeaveInterval => s !== null),
  };
  if (firstSlice.segments.length === 0) return null;

  // incomeSources() reports a MONTHLY rate for both sides — scale each down
  // to this window before adding them, the same reasoning as the birth-days
  // merge (a monthly rate slipping in unscaled would dwarf a short window).
  // Both sides use the same generic keys ("fp", "supplement", ...) and the
  // same labels ("Föräldrapenning", ...) — prefix the key so React sees two
  // distinct rows instead of one overwriting the other, and group by whose
  // row it is so e.g. two "Föräldrapenning" rows read as two different
  // people's, not a duplicate.
  const windowDays = differenceInDays(second.startsAt, second.endsAt);
  const ratio = windowDays / 30.4;
  const scaled = (row: MonthlyRow, prefix: string, group: string) =>
    incomeSources(
      { ...row, householdBase: 0, partnerWorking: undefined },
      municipalRate,
    ).map((s) => ({
      ...s,
      key: `${prefix}-${s.key}`,
      net: Math.round(s.net * ratio),
      gross: Math.round(s.gross * ratio),
      group,
    }));

  const sources = [
    ...scaled(rowForPeriod(firstBase, firstSlice), "first", first.caregiver),
    ...scaled(rowForPeriod(secondBase, second), "second", second.caregiver),
  ];
  return {
    startsAt: second.startsAt,
    endsAt: second.endsAt,
    caregiver1: first.caregiver,
    caregiver2: second.caregiver,
    pace1: `${formatPace(firstSlice.segments[0].pace)} dagar/vecka`,
    sources,
    net: sources.reduce((sum, s) => sum + s.net, 0),
  };
}

/** The birth-days block's slot in the accordion's single-open state. */
const BIRTH_IDX = -1;
/** The dubbeldagar-merge block's slot in the accordion's single-open state. */
const DOUBLE_IDX = -2;

/**
 * A dated line between two blocks — where one stretch ends and the next
 * begins. Carries the gap note when there is real waiting time between them
 * (both working); says nothing extra when the next stretch picks up right
 * away, or overlaps the one before it (the 10-dagar alongside the first
 * caregiver's own leave).
 */
function DateMarker({
  date,
  gapDays,
  atBirth,
}: {
  date: Date;
  gapDays: number;
  /** This is the very first marker, dated to the birth itself. */
  atBirth: boolean;
}) {
  return (
    <div data-period-marker className="flex items-center gap-2 px-0.5">
      <span className="bg-border h-px flex-1" />
      <span className="text-muted-foreground shrink-0 text-center text-[11px] leading-tight tabular-nums">
        <span className="block">{formatDate(date)}</span>
        {gapDays > 0 && (
          <span data-gap-note className="block">
            ≈ {gapDays} dagar {atBirth ? "efter födseln" : "då båda jobbar"}
          </span>
        )}
      </span>
      <span className="bg-border h-px flex-1" />
    </div>
  );
}

/**
 * The shell every block shares: a header you can open, and a panel.
 *
 * `subtitle` and `headerRight` are always visible — the header's own text.
 * `alwaysVisible` is extra content still shown before the fold (the income
 * breakdown, for a period block); `children` is what the chevron reveals.
 */
function Block({
  colorIdx,
  colorIdx2,
  title,
  phase,
  subtitle,
  headerRight,
  alwaysVisible,
  open,
  onToggle,
  panelId,
  children,
}: {
  colorIdx: number;
  /** A second dot, for a block where two caregivers are both home. */
  colorIdx2?: number;
  title: string;
  phase: string | null;
  subtitle: ReactNode;
  headerRight?: ReactNode;
  alwaysVisible?: ReactNode;
  open: boolean;
  onToggle: () => void;
  panelId: string;
  children: ReactNode;
}) {
  return (
    <div
      className={cn(
        "bg-card rounded-lg border shadow-sm transition-colors",
        open && "border-primary/40",
      )}
    >
      <button
        type="button"
        data-period-header
        aria-expanded={open}
        aria-controls={panelId}
        onClick={onToggle}
        className="active:bg-secondary/40 flex w-full items-start gap-3 rounded-lg px-4 py-3 text-left"
      >
        <span className="mt-1 flex shrink-0 gap-0.5">
          <span
            className={cn(
              "size-2.5 rounded-sm",
              CG_BAR[colorIdx % CG_BAR.length],
            )}
          />
          {colorIdx2 != null && (
            <span
              className={cn(
                "size-2.5 rounded-sm",
                CG_BAR[colorIdx2 % CG_BAR.length],
              )}
            />
          )}
        </span>
        <span className="min-w-0 flex-1">
          <span className="flex flex-wrap items-baseline justify-between gap-x-2 gap-y-1">
            <span className="flex flex-wrap items-baseline gap-x-2 gap-y-1 text-sm font-semibold">
              {title}
              {phase && (
                <span className="text-muted-foreground bg-secondary rounded-full px-2 py-0.5 text-xs font-medium">
                  {phase}
                </span>
              )}
            </span>
            {headerRight}
          </span>
          <span className="text-muted-foreground mt-0.5 block text-xs tabular-nums">
            {subtitle}
          </span>
        </span>
        <IconChevronDown
          className={cn(
            "text-muted-foreground mt-1 size-4 shrink-0 transition-transform duration-300",
            open && "rotate-180",
          )}
        />
      </button>

      {alwaysVisible && <div className="px-4 pb-3">{alwaysVisible}</div>}

      {/* Animated height: 0fr ↔ 1fr. The content stays mounted, and `inert`
          keeps a shut panel out of focus order. */}
      <div
        id={panelId}
        inert={!open}
        className="grid transition-[grid-template-rows] duration-300 ease-out motion-reduce:transition-none"
        style={{ gridTemplateRows: open ? "1fr" : "0fr" }}
      >
        <div className="overflow-hidden">
          <div className="px-4 pt-1 pb-4">{children}</div>
        </div>
      </div>
    </div>
  );
}

/** The 10-dagar: no dates to edit, no föräldrapenning days spent. */
function BirthDaysBlock({
  period,
  result,
  salary,
  municipalRate,
  colorIdx,
  open,
  onToggle,
}: {
  period: Period;
  result: BirthDaysResult;
  /** Their monthly salary — these days are taxed at its margin. */
  salary: number;
  municipalRate: number;
  colorIdx: number;
  open: boolean;
  onToggle: () => void;
}) {
  const net = netOfExtra(result.total, { salary }, true, municipalRate);
  return (
    <Block
      colorIdx={colorIdx}
      title={period.caregiver}
      phase={period.phase}
      subtitle={`≈ ${formatSek(net)} · ${formatDays(result.days)}`}
      open={open}
      onToggle={onToggle}
      panelId="period-panel-birth"
    >
      <div className="bg-secondary/40 flex items-baseline justify-between rounded-lg border p-4">
        <span className="text-muted-foreground text-sm">
          {formatDays(result.days)} × {formatSek(result.dailyAmount)}/dag
        </span>
        <span className="text-xl font-bold tabular-nums">
          {formatSek(result.total)}
        </span>
      </div>
      <p className="text-muted-foreground mt-2 text-xs">
        Tillfällig föräldrapenning i samband med födseln — utöver de 480, så
        inga föräldrapenningdagar går åt. ≈ {formatSek(net)} efter skatt. Tas
        ut inom 60 dagar efter hemkomsten.
        {result.sgiCapped
          ? " Beloppet är begränsat av taket för tillfällig föräldrapenning (7,5 prisbasbelopp)."
          : ""}
      </p>
    </Block>
  );
}

/**
 * The results centrepiece: every stretch of leave listed top to bottom, each
 * one an accordion — the header carries who, when and how long, and opening
 * it shows the editable span and the economy of that stretch. The start and
 * end dates are directly editable: an end date becomes that caregiver's
 * "hemma till" goal, a start date delays their period.
 */
export function PeriodPager({
  projection,
  rows = [],
  deadlines,
  editing,
  levers,
  municipalRate,
  oneYear,
  sgiLiftedNames,
  birthDays,
  doubleDaysWindow,
}: {
  projection?: LeaveProjection;
  rows?: MonthlyRow[];
  deadlines: PlanDeadlines;
  editing: PeriodEditing;
  /** Per-caregiver dials, so each block can drive its own stretch. */
  levers?: Partial<Record<"A" | "B", PeriodControls>>;
  /** The other parent's days around the birth — the first leave there is. */
  birthDays?: {
    result: BirthDaysResult;
    name: string;
    salary: number;
    municipalRate: number;
  };
  /** Dubbeldagar: the second caregiver's overlap with the first, if any. */
  doubleDaysWindow?: {
    caregiver: string;
    startsAt: Date;
    endsAt: Date;
    rate: number;
  } | null;
  /** The household's kommunalskatt — used for every net in a block. */
  municipalRate?: number;
  /** The child's first birthday, where the SGI pace floor starts to bite. */
  oneYear?: Date;
  /** Caregivers whose pace that floor raised. */
  sgiLiftedNames?: Set<string>;
}) {
  // Which block is expanded. One at a time keeps the list scannable; the
  // open one can be clicked shut.
  const [openIdx, setOpenIdx] = useState<number | null>(
    // The topmost block starts open — the 10-dagar one when there is one.
    birthDays && birthDays.result.days > 0 ? BIRTH_IDX : 0,
  );
  const segments = projection?.segments ?? [];
  const periods = toPeriods(segments);
  const cgOrder = periods
    .map((p) => p.caregiver)
    .filter((name, i, arr) => arr.indexOf(name) === i);

  // No dated periods (e.g. no days left) — fall back to plain cards.
  if (periods.length === 0) {
    return (
      <section className="space-y-3">
        <h2 className="leading-none font-semibold">Perioder</h2>
        {rows.map((row, i) => (
          <PeriodCard key={i} row={row} colorIdx={i} />
        ))}
      </section>
    );
  }

  // "10-dagar" comes before everything else: the other parent is home from
  // the birth, days that never touch the 480.
  const birth: Period | null = birthDays
    ? {
        caregiver: birthDays.name,
        startsAt: deadlines.birth,
        endsAt: addDays(deadlines.birth, birthDays.result.days),
        segments: [],
        phase: "vid födseln",
        firstOfCaregiver: false,
        lastOfCaregiver: false,
        caregiverStart: deadlines.birth,
      }
    : null;

  // Where the 10-dagar overlaps the first caregiver's own leave (the usual
  // case — both start at the birth), fold the two into one block for that
  // shared window instead of two blocks that appear to happen side by side
  // with no relation.
  const overlap =
    birth && birthDays
      ? overlapWindow(
          birth,
          periods[0],
          rows.find((r) => r.name === periods[0].caregiver),
          birthDays,
          municipalRate,
        )
      : null;

  // Dubbeldagar: the second caregiver's own period (pushed in by the solver
  // alongside their later sequential stretch, so it landed out of order —
  // see the comment on doubleDaysOverlap). Find it, merge it into a second
  // combined block, and drop the standalone entry so it isn't shown twice.
  const doubleDaysPeriod = doubleDaysWindow
    ? (periods.find(
        (p) =>
          p.caregiver === doubleDaysWindow.caregiver &&
          p.startsAt.getTime() === doubleDaysWindow.startsAt.getTime(),
      ) ?? null)
    : null;
  const doubleDaysMerge = doubleDaysPeriod
    ? doubleDaysOverlap(
        periods[0],
        doubleDaysPeriod,
        rows.find((r) => r.name === periods[0].caregiver),
        rows.find((r) => r.name === doubleDaysPeriod.caregiver),
        municipalRate,
      )
    : null;
  const periodsShown = doubleDaysPeriod
    ? periods.filter((p) => p !== doubleDaysPeriod)
    : periods;

  // The first caregiver's block, truncated past whichever combined window
  // above reaches furthest — its true start is inside that block, so this
  // one no longer owns the "first" facts (grundnivå, extra days) or an
  // editable start date. It is still their first block for the whole-stretch
  // toggles (part-time, byt takt vid 1 år), so `firstOfCaregiver` stays true.
  const croppedStart = doubleDaysMerge?.endsAt ?? overlap?.endsAt;
  const displayPeriods = croppedStart
    ? [
        { ...periodsShown[0], startsAt: croppedStart, truncatedStart: true },
        ...periodsShown.slice(1),
      ]
    : periodsShown;

  const total = formatMonths(
    differenceInDays(
      periodsShown[0].startsAt,
      periodsShown[periodsShown.length - 1].endsAt,
    ) / 30.4,
  );

  return (
    <section className="space-y-3">
      <div className="flex items-center justify-between gap-2">
        <h2 className="leading-none font-semibold">Perioder</h2>
        <span className="text-muted-foreground text-xs tabular-nums">
          {total} totalt
        </span>
      </div>

      <div className="space-y-2">
        {birth && birthDays && overlap && (
          <>
            <DateMarker date={birth.startsAt} gapDays={0} atBirth />
            <Block
              colorIdx={Math.max(0, cgOrder.indexOf(overlap.caregiver1))}
              colorIdx2={Math.max(0, cgOrder.indexOf(overlap.caregiver2))}
              title={`${overlap.caregiver1} & ${overlap.caregiver2}`}
              phase="vid födseln"
              subtitle={
                <>
                  <span className="block">
                    {overlap.caregiver1} vid födseln · {overlap.caregiver2}{" "}
                    {overlap.pace2}
                  </span>
                  <span className="block">
                    {formatDays(birthDays.result.days)}
                  </span>
                </>
              }
              headerRight={
                <span className="text-foreground shrink-0 text-base font-bold tabular-nums">
                  ≈ {formatSek(overlap.net)}
                </span>
              }
              alwaysVisible={
                <div className="border-t pt-2.5">
                  <IncomeBreakdownTable sources={overlap.sources} />
                </div>
              }
              open={openIdx === BIRTH_IDX}
              onToggle={() =>
                setOpenIdx(openIdx === BIRTH_IDX ? null : BIRTH_IDX)
              }
              panelId="period-panel-birth"
            >
              <p className="text-muted-foreground text-xs">
                {overlap.caregiver1}s dagar är tillfällig föräldrapenning,
                utöver de 480 — bara {overlap.caregiver2}s sida räknas av
                potten. ≈ {formatSek(birthDays.result.total)} av det ovan är{" "}
                {overlap.caregiver1}s, tas ut inom 60 dagar efter
                hemkomsten.
                {birthDays.result.sgiCapped
                  ? " Begränsat av taket för tillfällig föräldrapenning (7,5 prisbasbelopp)."
                  : ""}
              </p>
              {overlap.grundnivaFirstDays ? (
                <p className="text-muted-foreground mt-2 text-xs">
                  Första {formatDays(overlap.grundnivaFirstDays)} på
                  grundnivå ({formatSek(MONEY.grundnivaPerDay)}/dag)
                </p>
              ) : null}
              {overlap.extraDays ? (
                <p className="text-muted-foreground mt-2 text-xs">
                  inkl. {formatDays(overlap.extraDays)} sparade från tidigare
                  barn
                </p>
              ) : null}
            </Block>
          </>
        )}
        {birth && birthDays && !overlap && (
          <>
            <DateMarker date={birth.startsAt} gapDays={0} atBirth />
            <BirthDaysBlock
              period={birth}
              result={birthDays.result}
              salary={birthDays.salary}
              municipalRate={birthDays.municipalRate}
              colorIdx={Math.max(0, cgOrder.indexOf(birth.caregiver))}
              open={openIdx === BIRTH_IDX}
              onToggle={() =>
                setOpenIdx(openIdx === BIRTH_IDX ? null : BIRTH_IDX)
              }
            />
          </>
        )}
        {doubleDaysMerge && (
          <>
            <DateMarker
              date={doubleDaysMerge.startsAt}
              gapDays={0}
              atBirth={!overlap && !birth}
            />
            <Block
              colorIdx={Math.max(
                0,
                cgOrder.indexOf(doubleDaysMerge.caregiver1),
              )}
              colorIdx2={Math.max(
                0,
                cgOrder.indexOf(doubleDaysMerge.caregiver2),
              )}
              title={`${doubleDaysMerge.caregiver1} & ${doubleDaysMerge.caregiver2}`}
              phase="dubbeldagar"
              subtitle={
                <>
                  <span className="block">
                    {doubleDaysMerge.caregiver1} {doubleDaysMerge.pace1} ·{" "}
                    {doubleDaysMerge.caregiver2} dubbeldagar
                  </span>
                  <span className="block">
                    {formatDays(
                      differenceInDays(
                        doubleDaysMerge.startsAt,
                        doubleDaysMerge.endsAt,
                      ),
                    )}
                  </span>
                </>
              }
              headerRight={
                <span className="text-foreground shrink-0 text-base font-bold tabular-nums">
                  ≈ {formatSek(doubleDaysMerge.net)}
                </span>
              }
              alwaysVisible={
                <div className="border-t pt-2.5">
                  <IncomeBreakdownTable sources={doubleDaysMerge.sources} />
                </div>
              }
              open={openIdx === DOUBLE_IDX}
              onToggle={() =>
                setOpenIdx(openIdx === DOUBLE_IDX ? null : DOUBLE_IDX)
              }
              panelId="period-panel-double"
            >
              <p className="text-muted-foreground text-xs">
                {doubleDaysMerge.caregiver2} tar dubbeldagar — dagar båda
                vårdnadshavarna är hemma samtidigt, en dag ur var och ens egen
                pott. Kan bara tas innan barnet fyllt 15 månader.
              </p>
            </Block>
          </>
        )}
        {displayPeriods.map((p, i) => {
          const base = rows.find((r) => r.name === p.caregiver);
          const row = base ? rowForPeriod(base, p) : undefined;
          const net = row ? householdNetMonthly(row, municipalRate) : null;
          const sources = row ? incomeSources(row, municipalRate) : [];
          const id = editing.idByName[p.caregiver];
          const mode: GoalMode = id ? editing.modeById[id] : "budget";
          const colorIdx = Math.max(0, cgOrder.indexOf(p.caregiver));
          const months = formatMonths(
            differenceInDays(p.startsAt, p.endsAt) / 30.4,
          );
          const paceText = `${formatPace(row?.daysPerWeek ?? p.segments[0]?.pace ?? 0)} dagar/vecka`;
          const pace =
            p.phase === "lägstanivå" ? `lägstanivå · ${paceText}` : paceText;
          // The stretch that begins at the first birthday is where the SGI
          // floor lifts the pace — say so there, once, instead of listing it
          // as something wrong with the plan.
          const sgiStartsHere =
            oneYear != null &&
            (sgiLiftedNames?.has(p.caregiver) ?? false) &&
            !p.firstOfCaregiver &&
            Math.abs(differenceInDays(oneYear, p.startsAt)) <= 2;
          // The marker just above this block: the boundary with whatever
          // came before it — the birth block's end for the very first
          // period (so overlapping the 10-dagar reads as no gap at all,
          // rather than one measured from the birth itself). When the two
          // were merged into one combined block above, that block's own end
          // IS this boundary, and the two are contiguous by construction.
          const priorEnd =
            i > 0
              ? displayPeriods[i - 1].endsAt
              : (doubleDaysMerge?.endsAt ??
                overlap?.endsAt ??
                birth?.endsAt ??
                deadlines.birth);
          const gapBefore = differenceInDays(priorEnd, p.startsAt);

          return (
            <Fragment key={i}>
              <DateMarker
                date={p.startsAt}
                gapDays={gapBefore > 3 ? gapBefore : 0}
                atBirth={i === 0 && !birth}
              />
              <Block
                colorIdx={colorIdx}
                title={p.caregiver}
                phase={null}
                subtitle={
                  <>
                    <span className="block">{months}</span>
                    <span className="block">{pace}</span>
                  </>
                }
                headerRight={
                  net != null ? (
                    <span className="text-foreground shrink-0 text-base font-bold tabular-nums">
                      ≈ {formatSek(net)}
                      <span className="text-muted-foreground text-xs font-normal">
                        /mån
                      </span>
                    </span>
                  ) : undefined
                }
                alwaysVisible={
                  sources.length > 0 ? (
                    <div className="border-t pt-2.5">
                      <IncomeBreakdownTable sources={sources} />
                    </div>
                  ) : undefined
                }
                open={openIdx === i}
                onToggle={() => setOpenIdx(openIdx === i ? null : i)}
                panelId={`period-panel-${i}`}
              >
              {/* Editable span — edits become goals ("custom" planning). */}
              <div className="grid grid-cols-2 gap-3">
                <div className="space-y-1">
                  <Label htmlFor={`period-start-${i}`} className="text-xs">
                    Från
                  </Label>
                  <Input
                    id={`period-start-${i}`}
                    type="date"
                    value={toIsoDate(p.startsAt)}
                    // A later block starts where the previous one ended —
                    // only the start of the whole stretch can move. A
                    // truncated first block's TRUE start is inside the
                    // combined block above it, so it can't move from here
                    // either.
                    disabled={!p.firstOfCaregiver || p.truncatedStart}
                    onChange={(e) =>
                      id &&
                      e.target.value &&
                      editing.onStartDate(id, e.target.value)
                    }
                  />
                </div>
                <div className="space-y-1">
                  <Label htmlFor={`period-end-${i}`} className="text-xs">
                    Till
                  </Label>
                  <Input
                    id={`period-end-${i}`}
                    type="date"
                    value={toIsoDate(p.endsAt)}
                    disabled={!p.lastOfCaregiver}
                    onChange={(e) =>
                      id &&
                      e.target.value &&
                      editing.onEndDate(id, e.target.value)
                    }
                  />
                </div>
              </div>
              <div className="mt-1.5 flex flex-wrap gap-x-3 gap-y-1">
                {mode === "untilDate" && id && p.lastOfCaregiver && (
                  <button
                    type="button"
                    onClick={() => editing.onClearEnd(id)}
                    className="text-muted-foreground hover:text-foreground active:text-foreground inline-flex min-h-10 items-center text-xs underline underline-offset-2 sm:min-h-0"
                  >
                    Släpp slutdatumet (automatisk längd)
                  </button>
                )}
                {id &&
                  p.firstOfCaregiver &&
                  !p.truncatedStart &&
                  editing.hasStartOverride[id] && (
                  <button
                    type="button"
                    onClick={() => editing.onStartDate(id, null)}
                    className="text-muted-foreground hover:text-foreground active:text-foreground inline-flex min-h-10 items-center text-xs underline underline-offset-2 sm:min-h-0"
                  >
                    Återställ startdatumet
                  </button>
                )}
              </div>

              {sgiStartsHere && (
                <p className="text-muted-foreground mt-2 flex items-start gap-2 text-xs">
                  <IconInfoCircle className="mt-0.5 size-3.5 shrink-0" />
                  <span>
                    Från 1-årsdagen krävs minst{" "}
                    {SGI_PROTECTION.minDaysPerWeekAfterAge1} uttagsdagar i
                    veckan för att SGI:n ska skyddas, så takten är höjd här.
                  </span>
                </p>
              )}

              {/* The fine print behind the headline numbers above. */}
              {row && (
                <div className="text-muted-foreground mt-3 space-y-0.5 text-xs">
                  <div className="tabular-nums">
                    Hushåll brutto ≈ {formatSek(householdMonthly(row))}/mån ·{" "}
                    {formatSek(row.dailyRate)}/dag föräldrapenning ·{" "}
                    {formatDays(row.days)}
                  </div>
                  {row.supplement && (
                    <div>
                      Föräldralön i ca{" "}
                      {String(row.supplement.months).replace(".", ",")} mån
                      {row.aboveCap ? " · täcker även lön över taket" : ""}
                    </div>
                  )}
                  {row.grundnivaFirstDays ? (
                    <div>
                      Första {formatDays(row.grundnivaFirstDays)} på grundnivå
                      ({formatSek(MONEY.grundnivaPerDay)}/dag)
                    </div>
                  ) : null}
                  {row.extraDays ? (
                    <div>
                      inkl. {formatDays(row.extraDays)} sparade från tidigare
                      barn
                    </div>
                  ) : null}
                  {row.savedDays ? (
                    <div>
                      sparar {formatDays(row.savedDays)} till senare
                      (klämdagar, lov …)
                    </div>
                  ) : null}
                </div>
              )}

              {/* Play with this stretch: the pace and what it pays. */}
              {id && levers?.[id] && (
                <div className="mt-3">
                  <PeriodLevers
                    controls={levers[id]}
                    phase={
                      p.phase && p.segments[0]?.tier !== "lagsta"
                        ? p.firstOfCaregiver
                          ? 1
                          : 2
                        : null
                    }
                    showToggles={p.firstOfCaregiver}
                    goalDriven={mode !== "manual"}
                  />
                </div>
              )}
              </Block>
            </Fragment>
          );
        })}
      </div>

      <p className="text-muted-foreground text-xs">
        Ledigheten slutar {formatDate(periods[periods.length - 1].endsAt)} ·
        inkomstdagar tas ut före {formatDate(deadlines.sjukpenningDeadline)} ·
        alla dagar förfaller {formatDate(deadlines.expiry)}.
      </p>
    </section>
  );
}
