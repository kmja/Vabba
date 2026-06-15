import type { Metadata } from "next";

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
          Räkna ut föräldradagar och vab steg för steg — maximera ersättningen,
          dela tiden jämnt eller förläng ledigheten, utan att förlora reserverade
          dagar eller SGI.
        </p>
      </header>

      <Planner />
    </div>
  );
}
