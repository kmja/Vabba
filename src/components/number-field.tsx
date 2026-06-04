import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";

/** A labelled numeric input shared by the planner and the vab calculator. */
export function NumberField({
  id,
  label,
  value,
  onChange,
  min = 0,
  step = 1,
  placeholder,
  hint,
}: {
  id: string;
  label: string;
  value: number;
  onChange: (n: number) => void;
  min?: number;
  step?: number;
  placeholder?: string;
  hint?: string;
}) {
  return (
    <div className="space-y-1.5">
      <Label htmlFor={id}>{label}</Label>
      <Input
        id={id}
        type="number"
        inputMode="numeric"
        min={min}
        step={step}
        placeholder={placeholder}
        value={Number.isFinite(value) && value !== 0 ? value : ""}
        onChange={(e) => {
          const n = e.target.valueAsNumber;
          onChange(Number.isNaN(n) ? 0 : Math.max(min, n));
        }}
      />
      {hint && <p className="text-muted-foreground text-xs">{hint}</p>}
    </div>
  );
}
