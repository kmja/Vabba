import { useEffect, useRef, useState } from "react";
import { IconChevronLeft, IconChevronRight } from "@tabler/icons-react";

import { Select } from "@/components/ui/select";
import { isValidIsoDate, parseIsoDate, toIsoDate } from "@/lib/dates";
import { cn } from "@/lib/utils";

const SV_MONTHS = [
  "januari",
  "februari",
  "mars",
  "april",
  "maj",
  "juni",
  "juli",
  "augusti",
  "september",
  "oktober",
  "november",
  "december",
];
const SV_DAYS = ["M", "T", "O", "T", "F", "L", "S"];

function startOfMonth(d: Date): Date {
  return new Date(Date.UTC(d.getUTCFullYear(), d.getUTCMonth(), 1));
}

/** Monday-first weekday index (0–6) of a date. */
function mondayIndex(d: Date): number {
  return (d.getUTCDay() + 6) % 7;
}

/**
 * An always-expanded month calendar with big day targets, for picking dates
 * inline in the wizard flow (no native picker popup). Swipe left/right to
 * move between months. A visually hidden date input remains as the
 * autofill/automation hook for the same value.
 */
export function InlineCalendar({
  value,
  onPick,
  inputId,
  yearsBack = 12,
  yearsForward = 1,
}: {
  /** ISO yyyy-mm-dd (or empty). */
  value: string;
  onPick: (iso: string) => void;
  /** Id for the hidden fallback input (autofill/automation hook). */
  inputId: string;
  yearsBack?: number;
  yearsForward?: number;
}) {
  const selected = isValidIsoDate(value) ? parseIsoDate(value) : null;
  // The visible month is client-state; "today" is read after mount to keep
  // the prerendered HTML deterministic.
  const [view, setView] = useState<Date | null>(
    selected ? startOfMonth(selected) : null,
  );
  const [today, setToday] = useState<Date | null>(null);
  // +1 = moved forward (enter from the right), -1 = back (enter from the left).
  const [dir, setDir] = useState(1);
  useEffect(() => {
    const now = new Date();
    // eslint-disable-next-line react-hooks/set-state-in-effect -- one-time client-only init of "today"
    setToday(now);
    setView((v) => v ?? startOfMonth(now));
  }, []);

  const base = today ?? new Date(2026, 0, 1);
  const years: number[] = [];
  for (
    let y = base.getFullYear() - yearsBack;
    y <= base.getFullYear() + yearsForward;
    y++
  ) {
    years.push(y);
  }

  const month = view ?? startOfMonth(base);
  const first = startOfMonth(month);
  const daysInMonth = new Date(
    Date.UTC(first.getUTCFullYear(), first.getUTCMonth() + 1, 0),
  ).getUTCDate();
  const lead = mondayIndex(first);
  const cells: (Date | null)[] = [
    ...Array.from({ length: lead }, () => null),
    ...Array.from(
      { length: daysInMonth },
      (_, i) =>
        new Date(Date.UTC(first.getUTCFullYear(), first.getUTCMonth(), i + 1)),
    ),
  ];

  const shiftMonth = (delta: number) => {
    setDir(delta >= 0 ? 1 : -1);
    setView(
      new Date(
        Date.UTC(first.getUTCFullYear(), first.getUTCMonth() + delta, 1),
      ),
    );
  };

  // Swipe between months (horizontal only — vertical stays page scroll).
  const touchStart = useRef<{ x: number; y: number } | null>(null);
  const onTouchStart = (e: React.TouchEvent) => {
    const t = e.touches[0];
    touchStart.current = { x: t.clientX, y: t.clientY };
  };
  const onTouchEnd = (e: React.TouchEvent) => {
    const start = touchStart.current;
    touchStart.current = null;
    if (!start) return;
    const t = e.changedTouches[0];
    const dx = t.clientX - start.x;
    const dy = t.clientY - start.y;
    if (Math.abs(dx) > 40 && Math.abs(dx) > Math.abs(dy) * 1.5) {
      shiftMonth(dx < 0 ? 1 : -1);
    }
  };

  const isSameDay = (a: Date, b: Date | null) =>
    b != null && toIsoDate(a) === toIsoDate(b);
  const monthKey = `${first.getUTCFullYear()}-${first.getUTCMonth()}`;

  return (
    <div className="space-y-2">
      <div className="flex items-center justify-between gap-2">
        <button
          type="button"
          aria-label="Föregående månad"
          onClick={() => shiftMonth(-1)}
          className="active:bg-secondary/60 hover:bg-secondary/40 flex size-11 items-center justify-center rounded-md border sm:size-9"
        >
          <IconChevronLeft className="size-4" />
        </button>
        <div className="flex items-center gap-2">
          <span
            key={`m-${monthKey}`}
            data-calendar-month
            className={cn(
              "w-24 text-center text-base font-medium sm:text-sm",
              dir > 0 ? "animate-month-next" : "animate-month-prev",
            )}
          >
            {SV_MONTHS[first.getUTCMonth()]}
          </span>
          <Select
            aria-label="År"
            value={first.getUTCFullYear()}
            onChange={(e) => {
              const y = Number(e.target.value);
              setDir(y >= first.getUTCFullYear() ? 1 : -1);
              setView(new Date(Date.UTC(y, first.getUTCMonth(), 1)));
            }}
            className="w-24"
          >
            {years.map((y) => (
              <option key={y} value={y}>
                {y}
              </option>
            ))}
          </Select>
        </div>
        <button
          type="button"
          aria-label="Nästa månad"
          onClick={() => shiftMonth(1)}
          className="active:bg-secondary/60 hover:bg-secondary/40 flex size-11 items-center justify-center rounded-md border sm:size-9"
        >
          <IconChevronRight className="size-4" />
        </button>
      </div>

      {/* The grid is keyed by month so each change re-runs the slide-in. The
          wrapper keeps the swipe handlers mounted across the animation. */}
      <div
        className="overflow-hidden"
        onTouchStart={onTouchStart}
        onTouchEnd={onTouchEnd}
      >
        <div
          key={monthKey}
          data-calendar-grid
          className={cn(
            "grid touch-pan-y grid-cols-7 gap-1",
            dir > 0 ? "animate-month-next" : "animate-month-prev",
          )}
        >
          {SV_DAYS.map((d, i) => (
            <div
              key={`${d}-${i}`}
              className="text-muted-foreground py-0.5 text-center text-xs font-medium"
            >
              {d}
            </div>
          ))}
          {cells.map((day, i) =>
            day ? (
              <button
                key={i}
                type="button"
                onClick={() => onPick(toIsoDate(day))}
                className={cn(
                  "flex h-11 items-center justify-center rounded-md text-base tabular-nums transition-colors duration-150 active:scale-95 sm:h-9 sm:text-sm [@media(max-height:740px)]:h-10",
                  isSameDay(day, selected)
                    ? "bg-primary text-primary-foreground font-semibold"
                    : cn(
                        "hover:bg-secondary/60 active:bg-secondary",
                        isSameDay(day, today) && "border-primary/50 border",
                      ),
                )}
              >
                {day.getUTCDate()}
              </button>
            ) : (
              <div key={i} />
            ),
          )}
        </div>
      </div>

      {/* Hidden hook for browser autofill and automation — not part of the
          visible flow (the calendar is the input). */}
      <input
        id={inputId}
        type="date"
        tabIndex={-1}
        aria-hidden
        value={value}
        onChange={(e) => e.target.value && onPick(e.target.value)}
        className="sr-only"
      />
    </div>
  );
}
