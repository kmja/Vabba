import type { ReactNode } from "react";
import { IconCheck, IconChevronDown } from "@tabler/icons-react";

import { cn } from "@/lib/utils";

/**
 * One question in the wizard's flow.
 *
 * Active: no card chrome at all — the question is the content of the screen,
 * a large heading with its input directly below. Answered or pending: a
 * compact accordion row (check badge + the chosen value) that reopens on tap.
 * Every state change animates: the box fades in/out, the heading scales
 * between headline and label size, and the panel height eases open.
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
  // A question the user hasn't reached yet stays out of the flow entirely —
  // only what's answered (above) and what's in focus is on screen.
  if (!open && !answered) return null;

  return (
    <div
      className={cn(
        "transition-[background-color,border-color,box-shadow,margin] duration-300",
        open
          ? "animate-flow-in border-transparent bg-transparent py-1 shadow-none"
          : "bg-card rounded-xl border shadow-sm",
      )}
      style={{ borderWidth: 1, borderStyle: "solid" }}
    >
      <button
        type="button"
        id={id}
        onClick={onOpen}
        aria-expanded={open}
        className={cn(
          "flex w-full items-center text-left transition-[padding,column-gap] duration-300",
          open
            ? "gap-0 px-0 pt-1 pb-0"
            : "active:bg-secondary/50 min-h-13 gap-2.5 rounded-xl px-4 py-3",
        )}
      >
        {/* Badge only exists in the collapsed row */}
        <span
          className={cn(
            "flex shrink-0 items-center justify-center rounded-full transition-all duration-300",
            open
              ? "size-0 opacity-0"
              : answered
                ? "bg-primary text-primary-foreground size-6 opacity-100"
                : "bg-muted text-muted-foreground size-6 opacity-100",
          )}
        >
          {answered ? (
            <IconCheck className="size-4" />
          ) : (
            <IconChevronDown className="size-4" />
          )}
        </span>

        <span
          className={cn(
            "min-w-0 transition-all duration-300",
            open
              ? "text-foreground flex-1 text-2xl leading-tight font-semibold"
              : "text-muted-foreground shrink-0 text-sm font-medium",
          )}
        >
          {label}
        </span>

        <span
          className={cn(
            "ml-auto min-w-0 truncate text-right text-base font-semibold tabular-nums transition-opacity duration-300 sm:text-sm",
            open ? "w-0 opacity-0" : "opacity-100",
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
          <div
            id={`${id}-panel`}
            className={cn(
              "space-y-3 transition-[padding] duration-300",
              open ? "px-0 pt-4 pb-2" : "px-4 pt-1 pb-4",
            )}
          >
            {children}
          </div>
        </div>
      </div>
    </div>
  );
}
