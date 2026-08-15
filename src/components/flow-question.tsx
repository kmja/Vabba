import type { ReactNode } from "react";
import { IconCheck, IconChevronDown } from "@tabler/icons-react";

import { cn } from "@/lib/utils";

/**
 * One question in the wizard's flow — a checkout-style accordion item.
 *
 * Open: the question is in focus with its input expanded. Collapsed: a
 * summary row with the chosen value in the header and a check badge.
 * The collapse/expand animates via the grid-rows trick (0fr ↔ 1fr), and the
 * collapsed content is `inert` so it can't be focused or clicked.
 */
export function FlowQuestion({
  id,
  label,
  value,
  open,
  answered,
  onOpen,
  children,
}: {
  id: string;
  label: string;
  /** The chosen value, shown in the header while collapsed. */
  value?: string | null;
  open: boolean;
  /** Shows the check badge when collapsed. */
  answered: boolean;
  onOpen: () => void;
  children: ReactNode;
}) {
  return (
    <div
      className={cn(
        "overflow-hidden rounded-xl border transition-[border-color,box-shadow,background-color] duration-300",
        open ? "border-primary/50 bg-card shadow-sm" : "bg-card",
      )}
    >
      <button
        type="button"
        id={id}
        onClick={onOpen}
        aria-expanded={open}
        className="active:bg-secondary/50 flex min-h-13 w-full items-center gap-2.5 px-4 py-3 text-left"
      >
        <span
          className={cn(
            "flex size-6 shrink-0 items-center justify-center rounded-full transition-colors duration-300",
            answered && !open
              ? "bg-primary text-primary-foreground"
              : "bg-muted text-muted-foreground",
          )}
        >
          {answered && !open ? (
            <IconCheck className="size-4" />
          ) : (
            <IconChevronDown
              className={cn(
                "size-4 transition-transform duration-300",
                open && "rotate-180",
              )}
            />
          )}
        </span>
        <span
          className={cn(
            "min-w-0 transition-all duration-300",
            open
              ? "text-foreground flex-1 text-xl font-semibold sm:text-lg"
              : "text-muted-foreground shrink-0 text-sm font-medium",
          )}
        >
          {label}
        </span>
        <span
          className={cn(
            "ml-auto min-w-0 truncate text-right text-base font-semibold tabular-nums transition-opacity duration-300 sm:text-sm",
            open ? "opacity-0" : "opacity-100",
          )}
        >
          {answered ? value : null}
        </span>
      </button>

      {/* Animated height: 0fr ↔ 1fr. Content stays mounted; `inert` keeps the
          collapsed panel out of focus order and hit testing. */}
      <div
        inert={!open}
        className="grid transition-[grid-template-rows] duration-300 ease-out motion-reduce:transition-none"
        style={{ gridTemplateRows: open ? "1fr" : "0fr" }}
      >
        <div className="overflow-hidden">
          <div id={`${id}-panel`} className="space-y-3 px-4 pt-1 pb-4">
            {children}
          </div>
        </div>
      </div>
    </div>
  );
}
