"use client";

import { createContext, useContext, useState, type ReactNode } from "react";

/**
 * Bridges the site header (rendered once, in the root layout) to whatever
 * the one `<Planner>` instance considers "home"/"new plan" — the two are
 * siblings, not parent/child, so there's no prop path between them.
 * `Planner` registers its own handlers on mount; the header calls them,
 * oblivious to what they do.
 */
interface HomeNav {
  goHome: (() => void) | null;
  setGoHome: (fn: (() => void) | null) => void;
  /** Start a fresh plan (reset the working plan, enter the wizard). */
  newPlan: (() => void) | null;
  setNewPlan: (fn: (() => void) | null) => void;
}

const HomeNavContext = createContext<HomeNav | null>(null);

export function HomeNavProvider({ children }: { children: ReactNode }) {
  const [goHome, setGoHome] = useState<(() => void) | null>(null);
  const [newPlan, setNewPlan] = useState<(() => void) | null>(null);
  return (
    <HomeNavContext.Provider value={{ goHome, setGoHome, newPlan, setNewPlan }}>
      {children}
    </HomeNavContext.Provider>
  );
}

export function useHomeNav(): HomeNav {
  const ctx = useContext(HomeNavContext);
  if (!ctx) throw new Error("useHomeNav must be used within HomeNavProvider");
  return ctx;
}
