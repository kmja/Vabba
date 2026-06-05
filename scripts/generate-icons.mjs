// Rasterize public/icon.svg into the PNG app-icons referenced by the web
// manifest and the iOS apple-touch-icon. Run after editing the SVG:
//
//   node scripts/generate-icons.mjs
//
// The PNGs are committed as static assets (served from public/ with correct
// content-types), so sharp is only a dev-time dependency — it never runs during
// the production build.
import sharp from "sharp";
import { fileURLToPath } from "node:url";

const svgPath = fileURLToPath(new URL("../public/icon.svg", import.meta.url));
const outPath = (name) =>
  fileURLToPath(new URL(`../public/${name}`, import.meta.url));

// Render the SVG at high density, then downscale to each target for crisp edges.
const render = (size) =>
  sharp(svgPath, { density: 384 }).resize(size, size, { fit: "contain" });

const targets = [
  { name: "icon-192.png", size: 192 },
  { name: "icon-512.png", size: 512 },
  // iOS composites apple-touch-icons on black, so flatten away any alpha.
  { name: "apple-touch-icon.png", size: 180, flatten: true },
];

await Promise.all(
  targets.map(async ({ name, size, flatten }) => {
    let img = render(size);
    if (flatten) img = img.flatten({ background: "#16a34a" });
    await img.png().toFile(outPath(name));
    console.log(`wrote public/${name} (${size}x${size})`);
  }),
);
