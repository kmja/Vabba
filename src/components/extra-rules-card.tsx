import { Info } from "lucide-react";

import {
  Card,
  CardContent,
  CardDescription,
  CardHeader,
  CardTitle,
} from "@/components/ui/card";

/**
 * Special rules the calculator doesn't model in kronor but that materially
 * affect a family's parental-leave economy. Surfaced so they aren't forgotten.
 */
const RULES: { title: string; body: string }[] = [
  {
    title: "Föräldralön (kollektivavtal)",
    body: "Många arbetsgivare betalar en föräldralön ovanpå föräldrapenningen — ofta upp till ca 90 % av lönen i omkring 6 månader, och då även på lönedelar över taket. Lägg in den per vårdnadshavare ovan, och kolla ditt avtal för exakta villkor.",
  },
  {
    title: "10 dagar vid barns födelse",
    body: "Den andra vårdnadshavaren kan ta ut ca 10 dagar tillfällig föräldrapenning i samband med födseln — utöver de 480 dagarna. Tas ut inom 60 dagar efter hemkomsten.",
  },
  {
    title: "240-dagarsregeln",
    body: "För att få sjukpenningnivå (inte bara grundnivå) de första 180 dagarna behöver du ha haft en inkomst som gett SGI i minst 240 dagar i följd före födseln.",
  },
  {
    title: "Semesterlönegrundande frånvaro",
    body: "Upp till 120 dagars föräldraledighet per barn och år (180 för ensam vårdnadshavare) är semesterlönegrundande — du fortsätter alltså tjäna in betald semester.",
  },
  {
    title: "Pensionsrätt för barnår",
    body: "Under barnets första fyra år får du extra pensionsrätt (barnår) automatiskt, även om du jobbar deltid. Bara en av vårdnadshavarna kan tillgodoräknas per år.",
  },
];

export function ExtraRulesCard() {
  return (
    <Card>
      <CardHeader>
        <CardTitle className="flex items-center gap-2">
          <Info className="size-4" /> Bra att veta
        </CardTitle>
        <CardDescription>
          Andra regler som påverkar ekonomin men inte räknas in i beloppen ovan.
        </CardDescription>
      </CardHeader>
      <CardContent className="space-y-3">
        {RULES.map((r) => (
          <div key={r.title}>
            <div className="text-sm font-medium">{r.title}</div>
            <p className="text-muted-foreground text-xs">{r.body}</p>
          </div>
        ))}
      </CardContent>
    </Card>
  );
}
