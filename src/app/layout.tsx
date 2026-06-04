import type { Metadata } from "next";
import { Geist, Geist_Mono } from "next/font/google";
import "./globals.css";

import { SiteHeader } from "@/components/site-header";

const geistSans = Geist({
  variable: "--font-geist-sans",
  subsets: ["latin"],
});

const geistMono = Geist_Mono({
  variable: "--font-geist-mono",
  subsets: ["latin"],
});

export const metadata: Metadata = {
  title: {
    default: "Föräldradagar – planera föräldrapenning och vab",
    template: "%s · Föräldradagar",
  },
  description:
    "Planeringshjälp för föräldrapenning och vab (vård av barn). Räkna ut dagar och fördelning lokalt i webbläsaren. Inte officiell rådgivning.",
};

export default function RootLayout({
  children,
}: Readonly<{
  children: React.ReactNode;
}>) {
  return (
    <html
      lang="sv"
      className={`${geistSans.variable} ${geistMono.variable} h-full antialiased`}
    >
      <body className="min-h-full flex flex-col">
        <SiteHeader />
        <main className="mx-auto w-full max-w-5xl flex-1 px-4 py-8 sm:px-6 sm:py-10">
          {children}
        </main>
        <footer className="border-t">
          <div className="text-muted-foreground mx-auto w-full max-w-5xl px-4 py-6 text-xs sm:px-6">
            <p className="max-w-3xl">
              Planeringsverktyg, inte officiell rådgivning och inte ett beslut
              från Försäkringskassan. Beloppen är uppskattningar före skatt och
              kan vara inaktuella. Kontrollera alltid aktuella regler och belopp
              hos Försäkringskassan. Alla beräkningar sker lokalt i din
              webbläsare och inga uppgifter lämnar din enhet.
            </p>
          </div>
        </footer>
      </body>
    </html>
  );
}
