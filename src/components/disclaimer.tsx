import type { ReactNode } from "react";
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
 * Persistent disclaimer + ruleset date-stamp. Defaults to the föräldrapenning
 * ruleset; pass the vab ruleset's metadata (and body text) to reuse it there.
 */
export function Disclaimer({
  year = RULESET_YEAR,
  verifiedOn = RULESET_VERIFIED_ON,
  source = RULESET_PRIMARY_SOURCE,
  children,
}: {
  year?: number;
  verifiedOn?: string;
  source?: string;
  children?: ReactNode;
}) {
  return (
    <Alert>
      <Info />
      <AlertTitle>Planeringshjälp – inte officiell rådgivning</AlertTitle>
      <AlertDescription className="gap-2">
        {children ?? (
          <p>
            Det här verktyget hjälper er att utforska hur föräldrapenningen kan
            fördelas. Det är inte Försäkringskassan och inte ett beslut.
            Kontrollera alltid aktuella regler och belopp hos Försäkringskassan
            innan ni planerar.
          </p>
        )}
        <p className="text-muted-foreground text-xs">
          Regler enligt {year} (senast kontrollerade{" "}
          {formatDate(parseIsoDate(verifiedOn))}). Inga uppgifter lämnar din
          enhet.{" "}
          <a
            href={source}
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
