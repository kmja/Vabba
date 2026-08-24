import { useState, type ReactNode } from "react";
import { IconChevronDown } from "@tabler/icons-react";

import { cn } from "@/lib/utils";

/**
 * Shared chrome for the collapsible "Justera planen" result panel (both the
 * split and the sole-custody variants are this same shell). Holds the sticky
 * full-bleed section, the title + collapse toggle and the collapsed one-line
 * goal summary; the expanded body is caller-supplied.
 */
export function AdjustPlanPanel({
  toggleLabelClosed = "Fler inställningar",
  toggleLabelOpen = "Färre inställningar",
  collapsedSummary,
  children,
}: {
  /** Toggle label when collapsed. */
  toggleLabelClosed?: string;
  /** Toggle label when expanded. */
  toggleLabelOpen?: string;
  /** The one-line description of the solved plan, shown while collapsed. */
  collapsedSummary?: string | null;
  children: ReactNode;
}) {
  const [open, setOpen] = useState(false);

  return (
    <section
      className={cn(
        "bg-card text-card-foreground ml-[calc(50%_-_50vw)] w-screen space-y-3 border-b py-3",
        !open && "sticky top-0 z-30",
      )}
    >
      <div className="flex items-center justify-between gap-2 px-4 sm:px-6">
        <span className="font-semibold">Justera planen</span>
        <button
          type="button"
          onClick={() => setOpen((o) => !o)}
          aria-expanded={open}
          className="text-muted-foreground hover:text-foreground flex items-center gap-1 text-xs"
        >
          {open ? toggleLabelOpen : toggleLabelClosed}
          <IconChevronDown
            className={cn("size-4 transition-transform", open && "rotate-180")}
          />
        </button>
      </div>

      {/* Collapsed: the one line describing the solved plan. The dials live on
          the period blocks below. */}
      {!open && collapsedSummary && (
        <p className="text-muted-foreground px-4 text-xs tabular-nums sm:px-6">
          {collapsedSummary}
        </p>
      )}

      {open && (
        <div className="space-y-4 px-4 sm:px-6">{children}</div>
      )}
    </section>
  );
}
