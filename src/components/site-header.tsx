import Link from "next/link";
import { IconCalendar } from "@tabler/icons-react";

import { ThemeToggle } from "@/components/theme-toggle";

export function SiteHeader() {
  return (
    <header className="border-b">
      <div className="mx-auto flex w-full max-w-5xl items-center justify-between gap-3 px-4 py-3 sm:px-6">
        <Link href="/" className="flex items-center gap-2 font-semibold">
          <IconCalendar className="size-5" />
          Föräldradagar
        </Link>
        <ThemeToggle />
      </div>
    </header>
  );
}
