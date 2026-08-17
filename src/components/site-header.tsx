import Link from "next/link";
import { IconCalendar } from "@tabler/icons-react";

import { ResetButton } from "@/components/reset-button";
import { ThemeToggle } from "@/components/theme-toggle";
import { version } from "../../package.json";

export function SiteHeader() {
  return (
    <header className="border-b">
      <div className="mx-auto flex w-full max-w-5xl items-center justify-between gap-3 px-4 py-1.5 sm:px-6 sm:py-3">
        <Link href="/" className="flex items-baseline gap-2 font-semibold">
          <IconCalendar className="size-5 self-center" />
          Föräldradagar
          <span className="text-muted-foreground text-xs font-normal tabular-nums">
            v{version}
          </span>
        </Link>
        <div className="flex items-center gap-0.5 [&_button]:size-9 sm:[&_button]:size-9">
          <ResetButton />
          <ThemeToggle />
        </div>
      </div>
    </header>
  );
}
