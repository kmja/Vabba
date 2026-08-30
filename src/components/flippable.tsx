"use client";

import { useEffect, useLayoutEffect, useRef, useState, type ReactNode } from "react";

import { cn } from "@/lib/utils";

/**
 * FLIP wrapper for list items. When a keyed child moves (reorder) it slides
 * smoothly from its previous position to the new one; blocks that appear after
 * the first render (e.g. a split produces a new period) fade/slide in.
 * Entrances are gated by `animateEnter` so a full initial render doesn't all
 * animate at once.
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
  const ref = useRef<HTMLDivElement | null>(null);
  const prevRef = useRef<{ top: number; left: number } | null>(null);
  // Blocks present before entrances are enabled never re-animate; only ones
  // that mount afterwards (a split / an add) fade in.
  const mountedBeforeReady = useRef(!animateEnter);
  const [entered, setEntered] = useState(false);

  useLayoutEffect(() => {
    const el = ref.current;
    if (!el) return;
    const rect = el.getBoundingClientRect();
    if (prevRef.current) {
      const dx = prevRef.current.left - rect.left;
      const dy = prevRef.current.top - rect.top;
      if (dx !== 0 || dy !== 0) {
        el.style.transition = "none";
        el.style.transform = `translate(${dx}px, ${dy}px)`;
        const raf = requestAnimationFrame(() => {
          el.style.transition =
            "transform 450ms cubic-bezier(0.22, 1, 0.36, 1), opacity 450ms ease";
          el.style.transform = "";
        });
        return () => {
          cancelAnimationFrame(raf);
          el.style.transition = "";
          el.style.transform = "";
        };
      }
    }
    prevRef.current = { top: rect.top, left: rect.left };
  });

  useEffect(() => {
    if (animateEnter && !mountedBeforeReady.current) {
      mountedBeforeReady.current = true;
      setEntered(true);
    }
  }, [animateEnter]);

  return (
    <div
      ref={ref}
      data-flip={flipKey}
      className={cn(className, entered && "animate-flow-in")}
    >
      {children}
    </div>
  );
}
