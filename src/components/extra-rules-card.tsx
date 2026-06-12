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
    title: "Semesterlönegrundande frånvaro",
    body: "Upp till 120 dagars föräldraledighet per barn och år (180 för ensam vårdnadshavare) är semesterlönegrundande — du fortsätter alltså tjäna in betald semester. Värdet beror på ditt semesteravtal och räknas inte in här.",
  },
  {
    title: "Pensionsrätt för barnår",
    body: "Under barnets första fyra år får du extra pensionsrätt (barnår) automatiskt, även om du jobbar deltid. Bara en av vårdnadshavarna kan tillgodoräknas per år — det är en framtida förmån, inte pengar nu.",
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
          Förmåner som påverkar ekonomin på sikt men inte räknas in i beloppen
          ovan — de sköts automatiskt eller beror på avtal.
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
