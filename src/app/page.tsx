import { Disclaimer } from "@/components/disclaimer";
import { Planner } from "@/components/planner";

export default function Home() {
  return (
    <main className="mx-auto w-full max-w-5xl flex-1 px-4 py-8 sm:px-6 sm:py-10">
      <header className="mb-6 space-y-2">
        <h1 className="text-2xl font-bold tracking-tight sm:text-3xl">
          Planera föräldrapenningen
        </h1>
        <p className="text-muted-foreground max-w-2xl">
          Hitta en bra fördelning av era föräldradagar mellan två föräldrar —
          maximera ersättningen eller dela tiden jämnt, utan att förlora
          reserverade dagar eller SGI.
        </p>
      </header>

      <div className="mb-6">
        <Disclaimer />
      </div>

      <Planner />

      <footer className="text-muted-foreground mt-12 border-t pt-6 text-xs">
        <p className="max-w-3xl">
          Det här är ett planeringsverktyg, inte officiell rådgivning och inte
          ett beslut från Försäkringskassan. Beloppen är uppskattningar före
          skatt och kan vara inaktuella. Kontrollera alltid aktuella regler och
          belopp hos Försäkringskassan. Alla beräkningar sker lokalt i din
          webbläsare och inga uppgifter lämnar din enhet.
        </p>
      </footer>
    </main>
  );
}
