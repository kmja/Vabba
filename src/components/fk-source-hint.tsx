import { ExternalLink } from "lucide-react";

const FK_MINA_SIDOR =
  "https://www.forsakringskassan.se/om-webbplatsen/mina-sidor-och-e-legitimation/om-mina-sidor";

/**
 * Small hint telling users where Försäkringskassan shows their own day counts,
 * so the "uttagna dagar" fields are a copy-paste rather than a guess.
 */
export function FkSourceHint({ what }: { what: string }) {
  return (
    <p className="text-muted-foreground text-xs">
      {what} ser du när du loggar in på{" "}
      <a
        href={FK_MINA_SIDOR}
        target="_blank"
        rel="noreferrer"
        className="text-foreground inline-flex items-center gap-0.5 underline underline-offset-2"
      >
        Försäkringskassans Mina sidor
        <ExternalLink className="size-3" />
      </a>{" "}
      eller i deras app (med BankID).
    </p>
  );
}
