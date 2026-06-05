"use client";

import { useEffect, useState } from "react";
import { Moon, Sun } from "lucide-react";

import { Button } from "@/components/ui/button";

/**
 * Light/dark toggle. The initial class is set by an inline script in the root
 * layout (before paint, no flash); this just reflects and flips it, persisting
 * the choice to localStorage.
 */
export function ThemeToggle() {
  const [dark, setDark] = useState(false);

  useEffect(() => {
    // eslint-disable-next-line react-hooks/set-state-in-effect -- read the class set by the no-flash script on mount
    setDark(document.documentElement.classList.contains("dark"));
  }, []);

  const toggle = () => {
    const next = !dark;
    setDark(next);
    document.documentElement.classList.toggle("dark", next);
    try {
      localStorage.setItem("theme", next ? "dark" : "light");
    } catch {
      // ignore unavailable storage
    }
  };

  return (
    <Button
      variant="ghost"
      size="icon"
      onClick={toggle}
      aria-label={dark ? "Byt till ljust tema" : "Byt till mörkt tema"}
      title="Växla tema"
    >
      {dark ? <Sun /> : <Moon />}
    </Button>
  );
}
