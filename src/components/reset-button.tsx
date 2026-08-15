"use client";

import { IconTrash } from "@tabler/icons-react";

import { Button } from "@/components/ui/button";

/**
 * Wipe the saved plan and start over — reachable from anywhere (handy when
 * testing). Clears every foraldradagar.* key (the theme choice is kept) and
 * reloads so all state re-initialises.
 */
export function ResetButton() {
  const reset = () => {
    try {
      for (const key of Object.keys(window.localStorage)) {
        if (key.startsWith("foraldradagar.")) {
          window.localStorage.removeItem(key);
        }
      }
    } catch {
      // storage unavailable — reloading still resets in-memory state
    }
    window.location.reload();
  };

  return (
    <Button
      variant="ghost"
      size="icon"
      onClick={reset}
      aria-label="Rensa sparad plan och börja om"
      title="Rensa sparad plan och börja om"
    >
      <IconTrash />
    </Button>
  );
}
