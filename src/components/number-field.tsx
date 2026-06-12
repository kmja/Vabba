import { Minus, Plus } from "lucide-react";

import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";

/** A labelled numeric input shared by the planner and the vab calculator. */
export function NumberField({
  id,
  label,
  value,
  onChange,
  min = 0,
  max,
  step = 1,
  placeholder,
  hint,
  stepper = false,
  slider = false,
  sliderMax,
}: {
  id: string;
  label: string;
  value: number;
  onChange: (n: number) => void;
  min?: number;
  max?: number;
  step?: number;
  placeholder?: string;
  hint?: string;
  stepper?: boolean;
  /** Show a drag slider in addition to the input (needs `max` or `sliderMax`). */
  slider?: boolean;
  /** Upper bound for the slider only — lets the typed value exceed it. */
  sliderMax?: number;
}) {
  const clamp = (n: number) => {
    const lo = Math.max(min, n);
    return max !== undefined ? Math.min(max, lo) : lo;
  };
  const rangeMax = max ?? sliderMax;

  const input = (
    <Input
      id={id}
      type="number"
      inputMode="numeric"
      min={min}
      max={max}
      step={step}
      placeholder={placeholder}
      value={Number.isFinite(value) && value !== 0 ? value : ""}
      onChange={(e) => {
        const n = e.target.valueAsNumber;
        onChange(Number.isNaN(n) ? 0 : clamp(n));
      }}
      className={stepper ? "text-center" : undefined}
    />
  );

  return (
    <div className="space-y-1.5">
      <Label htmlFor={id}>{label}</Label>
      {stepper ? (
        <div className="flex items-center gap-1.5">
          <Button
            type="button"
            variant="outline"
            size="icon"
            className="size-9 shrink-0"
            aria-label="Minska"
            onClick={() => onChange(clamp(value - step))}
          >
            <Minus />
          </Button>
          {input}
          <Button
            type="button"
            variant="outline"
            size="icon"
            className="size-9 shrink-0"
            aria-label="Öka"
            onClick={() => onChange(clamp(value + step))}
          >
            <Plus />
          </Button>
        </div>
      ) : (
        input
      )}
      {slider && rangeMax !== undefined && (
        <input
          type="range"
          aria-label={`${label} (skjutreglage)`}
          min={min}
          max={rangeMax}
          step={step}
          value={Math.min(
            rangeMax,
            Math.max(min, Number.isFinite(value) ? value : min),
          )}
          onChange={(e) => onChange(clamp(Number(e.target.value)))}
          className="accent-primary w-full"
        />
      )}
      {hint && <p className="text-muted-foreground text-xs">{hint}</p>}
    </div>
  );
}
