import type { Metadata } from "next";

import { Disclaimer } from "@/components/disclaimer";
import { Planner } from "@/components/planner";

export const metadata: Metadata = {
  title: "Föräldrapenning",
};

export default function Home() {
  return (
    <div className="space-y-6">
      <header className="space-y-2">
        <h1 className="text-2xl font-bold tracking-tight sm:text-3xl">
          Planera föräldrapenningen
        </h1>
        <p className="text-muted-foreground max-w-2xl">
          Hitta en bra fördelning av era föräldradagar mellan två vårdnadshavare —
          maximera ersättningen eller dela tiden jämnt, utan att förlora
          reserverade dagar eller SGI.
        </p>
      </header>

      <Disclaimer />

      <Planner />
    </div>
  );
}
