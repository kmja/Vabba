"use client";

import Link from "next/link";
import { usePathname } from "next/navigation";
import { CalendarDays } from "lucide-react";

import { cn } from "@/lib/utils";
import { ThemeToggle } from "@/components/theme-toggle";

const NAV = [
  { href: "/", label: "Föräldrapenning" },
  { href: "/vab", label: "Vab – vård av barn" },
] as const;

export function SiteHeader() {
  const pathname = usePathname();

  return (
    <header className="border-b">
      <div className="mx-auto flex w-full max-w-5xl flex-col gap-3 px-4 py-3 sm:flex-row sm:items-center sm:justify-between sm:px-6">
        <Link href="/" className="flex items-center gap-2 font-semibold">
          <CalendarDays className="size-5" />
          Föräldradagar
        </Link>
        <div className="flex items-center gap-1">
          <nav className="flex gap-1">
            {NAV.map((item) => {
              const active =
                item.href === "/"
                  ? pathname === "/"
                  : pathname.startsWith(item.href);
              return (
                <Link
                  key={item.href}
                  href={item.href}
                  aria-current={active ? "page" : undefined}
                  className={cn(
                    "rounded-md px-3 py-1.5 text-sm font-medium transition-colors",
                    active
                      ? "bg-secondary text-foreground"
                      : "text-muted-foreground hover:bg-secondary/60 hover:text-foreground",
                  )}
                >
                  {item.label}
                </Link>
              );
            })}
          </nav>
          <ThemeToggle />
        </div>
      </div>
    </header>
  );
}
