import Link from "next/link";
import { IconCalendar } from "@tabler/icons-react";

import { ThemeToggle } from "@/components/theme-toggle";
import { version } from "../../package.json";

export function SiteHeader() {
  return (
    <header className="border-b">
      <div className="mx-auto flex w-full max-w-5xl items-center justify-between gap-3 px-4 py-3 sm:px-6">
        <Link href="/" className="flex items-baseline gap-2 font-semibold">
          <IconCalendar className="size-5 self-center" />
          Föräldradagar
          <span className="text-muted-foreground text-xs font-normal tabular-nums">
            v{version}
          </span>
        </Link>
        <ThemeToggle />
      </div>
    </header>
  );
}
