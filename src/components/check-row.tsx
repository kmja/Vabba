import type { ReactNode } from "react";

/** A checkbox with an inline label, shared across the wizard's steps. */
export function CheckRow({
  id,
  checked,
  onChange,
  children,
}: {
  id: string;
  checked: boolean;
  onChange: (checked: boolean) => void;
  children: ReactNode;
}) {
  return (
    <label
      htmlFor={id}
      className="flex min-h-11 cursor-pointer items-center gap-2.5 text-base font-medium select-none active:opacity-70 sm:min-h-0 sm:gap-2 sm:text-sm"
    >
      <input
        id={id}
        type="checkbox"
        checked={checked}
        onChange={(e) => onChange(e.target.checked)}
        className="accent-primary size-5 shrink-0 sm:size-4"
      />
      {children}
    </label>
  );
}
