import type { Metadata } from "next";

import { Disclaimer } from "@/components/disclaimer";
import { VabCalculator } from "@/components/vab-calculator";
import {
  VAB_PRIMARY_SOURCE,
  VAB_RULESET_VERIFIED_ON,
  VAB_RULESET_YEAR,
} from "@/lib/vab";

export const metadata: Metadata = {
  title: "Vab – vård av barn",
};

export default function VabPage() {
  return (
    <div className="space-y-6">
      <header className="space-y-2">
        <h1 className="text-2xl font-bold tracking-tight sm:text-3xl">
          Vab – vård av sjukt barn
        </h1>
        <p className="text-muted-foreground max-w-2xl">
          Se hur många vab-dagar (tillfällig föräldrapenning) ni har kvar i år
          och ungefär vad de är värda.
        </p>
      </header>

      <Disclaimer
        year={VAB_RULESET_YEAR}
        verifiedOn={VAB_RULESET_VERIFIED_ON}
        source={VAB_PRIMARY_SOURCE}
      >
        <p>
          Det här räknar ut hur många vab-dagar ni har kvar i år och uppskattar
          ersättningen. Det är inte Försäkringskassan och inte ett beslut.
          Kontrollera alltid aktuella regler och belopp hos Försäkringskassan.
        </p>
      </Disclaimer>

      <VabCalculator />
    </div>
  );
}
