import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { NumberField } from "@/components/number-field";
import type { GoalMode } from "@/lib/goal-seek";
import { addMonths, addYears, toIsoDate } from "@/lib/dates";
import { formatDate } from "@/lib/format";

const MODES: { value: GoalMode; label: string; desc: string }[] = [
  {
    value: "manual",
    label: "Justera själv",
    desc: "Full takt som utgångsläge — finjustera med reglagen på resultatsidan.",
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
 * One caregiver's goal, asked in the wizard: adjust by hand, be home until a
 * date, or the longest leave within a household budget.
 */
export function CaregiverGoalControl({
  idPrefix,
  name,
  mode,
  dateStr,
  budget,
  birth,
  onMode,
  onDate,
  onBudget,
}: {
  idPrefix: string;
  name: string;
  mode: GoalMode;
  dateStr: string;
  budget: number;
  /** Parsed birth date (valid once step 1 is done); null hides the presets. */
  birth: Date | null;
  onMode: (mode: GoalMode) => void;
  onDate: (iso: string) => void;
  onBudget: (kr: number) => void;
}) {
  const presets: { label: string; date: Date }[] = birth
    ? [
        { label: "Förskolestart", date: forskolestart(birth) },
        { label: "1,5 år", date: addMonths(birth, 18) },
        { label: "2 år", date: addYears(birth, 2) },
      ]
    : [];

  return (
    <div className="space-y-3">
      <Label>Vad vill {name} uppnå?</Label>
      <div className="grid gap-2">
        {MODES.map((m) => (
          <label
            key={m.value}
            className={`flex cursor-pointer gap-2.5 rounded-lg border p-3 ${
              mode === m.value ? "border-primary bg-secondary/40" : ""
            }`}
          >
            <input
              type="radio"
              id={`${idPrefix}-goal-${m.value}`}
              name={`${idPrefix}-goal`}
              checked={mode === m.value}
              onChange={() => onMode(m.value)}
              className="accent-primary mt-0.5 size-5 shrink-0 sm:size-4"
            />
            <span>
              <span className="block text-base font-medium sm:text-sm">{m.label}</span>
              <span className="text-muted-foreground block text-xs">
                {m.desc}
              </span>
            </span>
          </label>
        ))}
      </div>

      {mode === "untilDate" && (
        <div className="space-y-2">
          <Label htmlFor={`${idPrefix}-goal-date`}>Hemma till och med</Label>
          <Input
            id={`${idPrefix}-goal-date`}
            type="date"
            value={dateStr}
            onChange={(e) => onDate(e.target.value)}
            className="max-w-48"
          />
          {presets.length > 0 && (
            <div className="flex flex-wrap gap-2">
              {presets.map((p) => (
                <button
                  key={p.label}
                  type="button"
                  onClick={() => onDate(toIsoDate(p.date))}
                  className="text-muted-foreground hover:text-foreground min-h-10 rounded-full border px-3.5 py-1 text-sm sm:min-h-0 sm:px-3 sm:text-xs"
                >
                  {p.label} · {formatDate(p.date)}
                </button>
              ))}
            </div>
          )}
        </div>
      )}

      {mode === "budget" && (
        <NumberField
          id={`${idPrefix}-goal-budget-floor`}
          label="Hushållets lägsta inkomst efter skatt (kr/mån)"
          value={budget}
          step={1000}
          slider
          sliderMax={60000}
          onChange={onBudget}
          hint="Perioden tas i den långsammaste takt som ändå klarar golvet — så räcker ledigheten så länge som möjligt."
        />
      )}
    </div>
  );
}
