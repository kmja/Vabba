import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { NumberField } from "@/components/number-field";
import type { GoalMode } from "@/lib/goal-seek";
import { addMonths, addYears, toIsoDate } from "@/lib/dates";
import { formatDate } from "@/lib/format";

/** Everything the results page needs to render and drive the goal picker. */
export interface GoalControls {
  mode: GoalMode;
  dateStr: string;
  budget: number;
  /** One-line result of the active goal (end date, saved days, lowest net). */
  summary: string | null;
  onMode: (mode: GoalMode) => void;
  onDate: (iso: string) => void;
  onBudget: (kr: number) => void;
}

const MODES: { value: GoalMode; label: string; desc: string }[] = [
  {
    value: "manual",
    label: "Justera själv",
    desc: "Ställ in takt och fördelning med reglagen.",
  },
  {
    value: "untilDate",
    label: "Hemma till ett datum",
    desc: "Räkna baklänges från t.ex. förskolestarten — dagar som blir över sparas.",
  },
  {
    value: "budget",
    label: "Så länge budgeten tillåter",
    desc: "Längsta möjliga ledighet där hushållet ändå klarar sin månadsbudget.",
  },
];

/** The first of August after the child's 1st birthday — typical förskolestart. */
function forskolestart(birth: Date): Date {
  const oneYear = addYears(birth, 1);
  const aug = new Date(Date.UTC(oneYear.getUTCFullYear(), 7, 1));
  return aug.getTime() >= oneYear.getTime()
    ? aug
    : new Date(Date.UTC(oneYear.getUTCFullYear() + 1, 7, 1));
}

/**
 * Results-page goal selector: solve the plan backwards from a target date or a
 * household budget floor, instead of adjusting paces by hand.
 */
export function GoalPicker({
  mode,
  dateStr,
  budget,
  birth,
  onMode,
  onDate,
  onBudget,
}: {
  mode: GoalMode;
  dateStr: string;
  budget: number;
  birth: Date;
  onMode: (mode: GoalMode) => void;
  onDate: (iso: string) => void;
  onBudget: (kr: number) => void;
}) {
  const presets: { label: string; date: Date }[] = [
    { label: "Förskolestart", date: forskolestart(birth) },
    { label: "1,5 år", date: addMonths(birth, 18) },
    { label: "2 år", date: addYears(birth, 2) },
  ];

  return (
    <div className="space-y-3">
      <Label>Vad vill ni uppnå?</Label>
      <div className="grid gap-2 sm:grid-cols-3">
        {MODES.map((m) => (
          <label
            key={m.value}
            className={`flex cursor-pointer flex-col gap-1 rounded-lg border p-3 ${
              mode === m.value ? "border-primary bg-secondary/40" : ""
            }`}
          >
            <span className="flex items-center gap-2 text-sm font-medium">
              <input
                type="radio"
                id={`goal-${m.value}`}
                name="goal-mode"
                checked={mode === m.value}
                onChange={() => onMode(m.value)}
                className="accent-primary size-4 shrink-0"
              />
              {m.label}
            </span>
            <span className="text-muted-foreground text-xs">{m.desc}</span>
          </label>
        ))}
      </div>

      {mode === "untilDate" && (
        <div className="space-y-2">
          <Label htmlFor="goal-date">Hemma till och med</Label>
          <Input
            id="goal-date"
            type="date"
            value={dateStr}
            onChange={(e) => onDate(e.target.value)}
            className="max-w-48"
          />
          <div className="flex flex-wrap gap-2">
            {presets.map((p) => (
              <button
                key={p.label}
                type="button"
                onClick={() => onDate(toIsoDate(p.date))}
                className="text-muted-foreground hover:text-foreground rounded-full border px-3 py-1 text-xs"
              >
                {p.label} · {formatDate(p.date)}
              </button>
            ))}
          </div>
        </div>
      )}

      {mode === "budget" && (
        <NumberField
          id="goal-budget"
          label="Hushållets lägsta inkomst efter skatt (kr/mån)"
          value={budget}
          step={1000}
          slider
          sliderMax={60000}
          onChange={onBudget}
          hint="Varje period tas i den långsammaste takt som ändå klarar golvet — så räcker ledigheten så länge som möjligt."
        />
      )}
    </div>
  );
}
