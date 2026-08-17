import type { Metadata, Viewport } from "next";
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

const DESCRIPTION =
  "Planeringshjälp för föräldrapenning och vab (vård av barn). Räkna ut dagar och fördelning lokalt i webbläsaren.";

export const metadata: Metadata = {
  metadataBase: new URL("https://vabba.pages.dev"),
  title: {
    default: "Föräldradagar – planera föräldrapenning och vab",
    template: "%s · Föräldradagar",
  },
  description: DESCRIPTION,
  applicationName: "Föräldradagar",
  appleWebApp: {
    capable: true,
    title: "Föräldradagar",
    statusBarStyle: "default",
  },
  icons: {
    icon: [{ url: "/icon.svg", type: "image/svg+xml" }],
    apple: [{ url: "/apple-touch-icon.png", sizes: "180x180" }],
  },
  openGraph: {
    title: "Föräldradagar – planera föräldrapenning och vab",
    description: DESCRIPTION,
    locale: "sv_SE",
    type: "website",
  },
  twitter: {
    card: "summary_large_image",
    title: "Föräldradagar",
    description: DESCRIPTION,
  },
};

export const viewport: Viewport = {
  themeColor: [
    { media: "(prefers-color-scheme: light)", color: "#ffffff" },
    { media: "(prefers-color-scheme: dark)", color: "#0a0a0a" },
  ],
  // cover: lets env(safe-area-inset-*) pad the pinned wizard nav on iOS.
  viewportFit: "cover",
  // overlays-content: the keyboard is drawn ON TOP of the page rather than
  // shrinking it, so the layout (family scene, question, nav) never reflows
  // when it opens. Fields are kept clear of it by scrolling the content
  // container — see revealField in wizard.tsx.
  interactiveWidget: "overlays-content",
};

// Set the colour theme before paint so there's no flash. Reads a saved choice,
// otherwise follows the OS preference. Mirrored by <ThemeToggle />.
const THEME_INIT = `(function(){try{var t=localStorage.getItem('theme');var d=t==='dark'||((!t||t==='system')&&window.matchMedia('(prefers-color-scheme: dark)').matches);document.documentElement.classList.toggle('dark',d);}catch(e){}})();`;

export default function RootLayout({
  children,
}: Readonly<{
  children: React.ReactNode;
}>) {
  return (
    <html
      lang="sv"
      suppressHydrationWarning
      className={`${geistSans.variable} ${geistMono.variable} h-full antialiased`}
    >
      <body className="flex min-h-full flex-col overflow-x-clip">
        <script dangerouslySetInnerHTML={{ __html: THEME_INIT }} />
        <SiteHeader />
        <main className="mx-auto w-full max-w-5xl flex-1 px-4 py-8 sm:px-6 sm:py-10">
          {children}
        </main>
      </body>
    </html>
  );
}
