import { Info } from "lucide-react";

import { Alert, AlertDescription, AlertTitle } from "@/components/ui/alert";
import {
  RULESET_PRIMARY_SOURCE,
  RULESET_VERIFIED_ON,
  RULESET_YEAR,
} from "@/lib/rules";
import { parseIsoDate } from "@/lib/dates";
import { formatDate } from "@/lib/format";

/**
 * Persistent, always-visible disclaimer. Also date-stamps the ruleset so users
 * know the figures can go stale.
 */
export function Disclaimer() {
  return (
    <Alert>
      <Info />
      <AlertTitle>Planeringshjälp – inte officiell rådgivning</AlertTitle>
      <AlertDescription className="gap-2">
        <p>
          Det här verktyget hjälper er att utforska hur föräldrapenningen kan
          fördelas. Det är inte Försäkringskassan och inte ett beslut.
          Kontrollera alltid aktuella regler och belopp hos Försäkringskassan
          innan ni planerar.
        </p>
        <p className="text-muted-foreground text-xs">
          Regler enligt {RULESET_YEAR} (senast kontrollerade{" "}
          {formatDate(parseIsoDate(RULESET_VERIFIED_ON))}). Inga uppgifter lämnar
          din enhet.{" "}
          <a
            href={RULESET_PRIMARY_SOURCE}
            target="_blank"
            rel="noreferrer"
            className="text-foreground underline underline-offset-2"
          >
            forsakringskassan.se
          </a>
        </p>
      </AlertDescription>
    </Alert>
  );
}
