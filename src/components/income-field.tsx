"use client";

import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { cn } from "@/lib/utils";

/**
 * Salary input with two modes: type an exact gross monthly amount, or just flag
 * "above the cap" (for parents who know they're over the SGI ceiling and don't
 * want to enter a figure — above the cap the exact salary doesn't change the
 * benefit). Domain-specific hint text is supplied by the caller.
 */
export function IncomeField({
  id,
  label,
  value,
  aboveCap,
  onValueChange,
  onAboveCapChange,
  amountHint,
  capHint,
  step = 1000,
}: {
  id: string;
  label: string;
  value: number;
  aboveCap: boolean;
  onValueChange: (n: number) => void;
  onAboveCapChange: (aboveCap: boolean) => void;
  /** Hint shown under the free-text field. */
  amountHint?: string;
  /** Hint shown when "above the cap" is selected. */
  capHint: string;
  step?: number;
}) {
  return (
    <div className="space-y-1.5">
      <Label htmlFor={id}>{label}</Label>

      <div
        role="tablist"
        aria-label={label}
        className="bg-muted inline-flex w-full rounded-lg p-1"
      >
        {[
          { key: "amount", text: "Ange lön", active: !aboveCap },
          { key: "cap", text: "Över taket", active: aboveCap },
        ].map((m) => (
          <button
            key={m.key}
            type="button"
            role="tab"
            aria-selected={m.active}
            onClick={() => onAboveCapChange(m.key === "cap")}
            className={cn(
              "flex-1 rounded-md px-3 py-1.5 text-sm font-medium transition-colors",
              m.active
                ? "bg-background text-foreground shadow-sm"
                : "text-muted-foreground hover:text-foreground",
            )}
          >
            {m.text}
          </button>
        ))}
      </div>

      {aboveCap ? (
        <p className="text-muted-foreground text-xs">{capHint}</p>
      ) : (
        <>
          <Input
            id={id}
            type="number"
            inputMode="numeric"
            min={0}
            step={step}
            placeholder="0"
            value={Number.isFinite(value) && value !== 0 ? value : ""}
            onChange={(e) => {
              const n = e.target.valueAsNumber;
              onValueChange(Number.isNaN(n) ? 0 : Math.max(0, n));
            }}
          />
          {amountHint && (
            <p className="text-muted-foreground text-xs">{amountHint}</p>
          )}
        </>
      )}
    </div>
  );
}
