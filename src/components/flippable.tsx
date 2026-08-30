"use client";

import { useEffect, useRef, useState, type ReactNode } from "react";

import { cn } from "@/lib/utils";

/**
 * A keyed wrapper around a period block. Carries `data-flip` so the parent can
 * animate it when the list is reordered, and fades in when it first appears
 * after the initial render (a split / an add). The reorder slide itself is done
 * by the parent (FLIP), not here — this stays a plain container.
 */
export function Flippable({
  flipKey,
  animateEnter = false,
  className,
  children,
}: {
  flipKey: string;
  animateEnter?: boolean;
  className?: string;
  children: ReactNode;
}) {
  // Blocks present before entrances are enabled never re-animate; only ones
  // that mount afterwards (a split / an add) fade in.
  const mountedBeforeReady = useRef(!animateEnter);
  const [entered, setEntered] = useState(false);

  useEffect(() => {
    if (animateEnter && !mountedBeforeReady.current) {
      mountedBeforeReady.current = true;
      setEntered(true);
    }
  }, [animateEnter]);

  return (
    <div data-flip={flipKey} className={cn(className, entered && "animate-flow-in")}>
      {children}
    </div>
  );
}
