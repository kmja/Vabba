import sharp from "sharp";
import { readFileSync } from "node:fs";

const b64 = (f) => `data:image/png;base64,${readFileSync(f).toString("base64")}`;
const IMG = {
  c1h: b64("public/Caregiver1_handover.png"),
  c1: b64("public/Caregiver1.png"),
  c2: b64("public/Caregiver2.png"),
};

const VIEW_W = 300, VIEW_H = 440, BASE = 445, FIG_H = 500;
const FIG_W = (FIG_H * 1024) / 1536, F1X = 130;
const cam = (fx, fy, s) =>
  `translate(${(VIEW_W / 2 - s * fx).toFixed(2)}, ${(VIEW_H / 2 - s * fy).toFixed(2)}) scale(${s})`;

function svgFor(step) {
  const fx1 = F1X - FIG_W / 2, fy = BASE - FIG_H;
  let camera, figs = "";
  if (step === 1) {
    const focus = { fx: 0.501, fy: 0.443, scale: 1.61 };
    camera = cam(F1X - FIG_W / 2 + FIG_W * focus.fx, BASE - FIG_H + FIG_H * focus.fy, focus.scale);
    figs = `<image href="${IMG.c1}" x="${fx1}" y="${fy}" width="${FIG_W}" height="${FIG_H}"/>`;
  } else if (step === 2) {
    camera = cam(F1X, BASE - FIG_H * 0.5, 0.92);
    figs = `<image href="${IMG.c1}" x="${fx1}" y="${fy}" width="${FIG_W}" height="${FIG_H}"/>`;
  } else {
    camera = cam(344, 195, 0.92);
    const c1 = { x: 239, y: 425, scale: 0.77 };
    const c2 = { x: 400, y: 445, scale: 1 };
    figs =
      `<g opacity="0.4"><image href="${IMG.c1h}" x="${c1.x - c1.scale * FIG_W / 2}" y="${c1.y - c1.scale * FIG_H}" width="${c1.scale * FIG_W}" height="${c1.scale * FIG_H}"/></g>` +
      `<g><image href="${IMG.c2}" x="${c2.x - c2.scale * FIG_W / 2}" y="${c2.y - c2.scale * FIG_H}" width="${c2.scale * FIG_W}" height="${c2.scale * FIG_H}"/></g>`;
  }
  const fade = step === 1
    ? { top: 0.11, solidFrom: 0.3, solidTo: 0.595, bottom: 0.8 }
    : { top: 0, solidFrom: 0, solidTo: 0.595, bottom: 0.8 };
  return { svg: `<svg xmlns="http://www.w3.org/2000/svg" width="${VIEW_W}" height="${VIEW_H}" viewBox="0 0 ${VIEW_W} ${VIEW_H}">
  <defs>
    <linearGradient id="f" x1="0" y1="0" x2="0" y2="1">
      <stop offset="${fade.top}" stop-color="#000"/>
      <stop offset="${fade.solidFrom}" stop-color="#fff"/>
      <stop offset="${fade.solidTo}" stop-color="#fff"/>
      <stop offset="${fade.bottom}" stop-color="#000"/>
    </linearGradient>
    <mask id="m"><rect width="${VIEW_W}" height="${VIEW_H}" fill="url(#f)"/></mask>
  </defs>
  <g mask="url(#m)"><g transform="${camera}">${figs}</g></g>
</svg>`, aspect: VIEW_H / VIEW_W };
}

const W = 570, H = Math.round(W * 836 / 570);
for (const step of [1, 2, 3]) {
  const { svg } = svgFor(step);
  await sharp(Buffer.from(svg)).resize(W, H).png().toFile(`public/step-${step}.png`);
  console.log(`wrote public/step-${step}.png`);
}
