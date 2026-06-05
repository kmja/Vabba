import type { MetadataRoute } from "next";

// Web App Manifest — makes the site installable / "add to home screen" with a
// proper icon and standalone (no browser chrome) display. force-static so it's
// emitted as a plain file under `output: export`.
export const dynamic = "force-static";

export default function manifest(): MetadataRoute.Manifest {
  return {
    id: "/",
    name: "Föräldradagar – planera föräldrapenning och vab",
    short_name: "Föräldradagar",
    description:
      "Planeringshjälp för föräldrapenning och vab. Räkna ut dagar och fördelning lokalt i webbläsaren.",
    lang: "sv",
    dir: "ltr",
    start_url: "/",
    scope: "/",
    display: "standalone",
    background_color: "#ffffff",
    theme_color: "#ffffff",
    categories: ["productivity", "utilities"],
    icons: [
      { src: "/icon.svg", sizes: "any", type: "image/svg+xml", purpose: "any" },
      { src: "/icon-192.png", sizes: "192x192", type: "image/png", purpose: "any" },
      { src: "/icon-512.png", sizes: "512x512", type: "image/png", purpose: "any" },
      {
        src: "/icon-512.png",
        sizes: "512x512",
        type: "image/png",
        purpose: "maskable",
      },
    ],
  };
}
