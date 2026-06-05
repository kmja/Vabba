import { ImageResponse } from "next/og";

// Static social-preview image, prerendered at build time (no request-time data),
// so it works with `output: export`. Uses next/og's bundled font — keep to plain
// text and CSS that Satori supports (every multi-child box needs display:flex).
export const alt = "Föräldradagar – planera föräldrapenning och vab";
export const size = { width: 1200, height: 630 };
export const contentType = "image/png";
export const dynamic = "force-static";

export default function OpengraphImage() {
  return new ImageResponse(
    (
      <div
        style={{
          height: "100%",
          width: "100%",
          display: "flex",
          flexDirection: "column",
          justifyContent: "space-between",
          background: "#ffffff",
          padding: 80,
          fontFamily: "sans-serif",
        }}
      >
        <div style={{ display: "flex", alignItems: "center", gap: 20 }}>
          <div
            style={{
              width: 64,
              height: 64,
              borderRadius: 16,
              background: "#16a34a",
            }}
          />
          <div style={{ fontSize: 40, color: "#15803d", fontWeight: 600 }}>
            Föräldradagar
          </div>
        </div>

        <div style={{ display: "flex", flexDirection: "column", gap: 16 }}>
          <div
            style={{
              fontSize: 82,
              fontWeight: 800,
              color: "#0a0a0a",
              lineHeight: 1.1,
            }}
          >
            Planera föräldrapenning och vab
          </div>
          <div style={{ fontSize: 38, color: "#525252" }}>
            Räkna ut dagar, fördelning och ersättning
          </div>
        </div>

        <div style={{ fontSize: 28, color: "#737373" }}>
          Allt räknas lokalt i webbläsaren — inget skickas
        </div>
      </div>
    ),
    { ...size },
  );
}
