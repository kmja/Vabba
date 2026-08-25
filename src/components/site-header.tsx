"use client";

import { IconPlus } from "@tabler/icons-react";

import { Button } from "@/components/ui/button";
import { ResetButton } from "@/components/reset-button";
import { ThemeToggle } from "@/components/theme-toggle";
import { useHomeNav } from "@/lib/home-nav";
import { version } from "../../package.json";

export function SiteHeader() {
  // Registered by the one <Planner> instance once it mounts — null on the
  // very first paint, and harmlessly a no-op if it's ever missing.
  const { goHome, newPlan } = useHomeNav();
  return (
    <header className="border-b">
      <div className="mx-auto flex w-full max-w-5xl items-center justify-between gap-3 px-4 py-1.5 sm:px-6 sm:py-3">
        <button
          type="button"
          onClick={() => goHome?.()}
          className="flex items-baseline gap-2 font-semibold"
        >
          Föräldradagar
          <span className="text-muted-foreground text-xs font-normal tabular-nums">
            v{version}
          </span>
        </button>
        <div className="flex items-center gap-0.5 [&_button]:size-9 sm:[&_button]:size-9">
          <Button
            type="button"
            variant="ghost"
            size="icon"
            onClick={() => newPlan?.()}
            aria-label="Ny plan"
            title="Ny plan"
          >
            <IconPlus />
          </Button>
          <ResetButton />
          <ThemeToggle />
        </div>
      </div>
    </header>
  );
}
