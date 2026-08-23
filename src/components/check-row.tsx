import type { ReactNode } from "react";

import { cn } from "@/lib/utils";

/** A checkbox with an inline label, shared across the wizard's steps. */
export function CheckRow({
  id,
  checked,
  onChange,
  small = false,
  children,
}: {
  id: string;
  checked: boolean;
  onChange: (checked: boolean) => void;
  /** A quieter, smaller label — for a secondary opt-out rather than a
   *  question in its own right. */
  small?: boolean;
  children: ReactNode;
}) {
  return (
    <label
      htmlFor={id}
      className={cn(
        "flex min-h-11 cursor-pointer items-center gap-2.5 font-medium select-none active:opacity-70 sm:min-h-0 sm:gap-2",
        small ? "text-sm" : "text-base sm:text-sm",
      )}
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
