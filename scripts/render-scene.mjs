#!/usr/bin/env node
/**
 * Diagnostic: rasterize the wizard FamilyScene for a step so the framing can
 * be inspected without a browser. Mirrors the geometry in family-scene.tsx;
 * images are inlined as data URIs.
 *
 * Usage:
 *   node scripts/render-scene.mjs [step] [--scale=S] [--cx=S] [--cy=S]
 *          [--box=15/22] [--out=/tmp/scene.png]
 * Optional --scale/--cx/--cy override the camera so tuning can be tested
 * without editing the component. --box sets the stage frame (default 15/22).
 */
import sharp from "sharp";
import { readFileSync } from "node:fs";

const VIEW_W = 300, VIEW_H = 440, BASE = 445, FIG_H = 500;
const FIG_W = (FIG_H * 1024) / 1536;
const F1X = 130, F2X = 400;
const CLOSEUP_FOCUS = { fx: 0.5, fy: 0.582, scale: 1.17 };
const STEP_BACK_DX = (F2X - F1X) * 0.35, STEP_BACK_DY = -20;
const STEP_BACK = `translate(${STEP_BACK_DX}px, ${STEP_BACK_DY}px) scale(0.6)`;
const FADES = {
  closeup: { top: 0.05, solidFrom: 0.2, solidTo: 0.4, bottom: 0.6 },
  figures: { top: 0, solidFrom: 0, solidTo: 0.45, bottom: 0.75 },
};
const fadeOf = (s) => (s <= 1 ? FADES.closeup : FADES.figures);
void fadeOf;
const cam = (fx, fy, s) =>
  `translate(${(VIEW_W / 2 - s * fx).toFixed(2)}, ${(VIEW_H / 2 - s * fy).toFixed(2)}) scale(${s})`;

const dataUri = (f) =>
  `data:image/png;base64,${readFileSync(f).toString("base64")}`;
const IMG = {
  c1h: dataUri("public/Caregiver1_handover.png"),
  c1: dataUri("public/Caregiver1.png"),
  c2: dataUri("public/Caregiver2.png"),
};

const args = () => {
  const out = { step: 1, scale: null, cx: null, cy: null, box: "15/22", path: "/tmp/scene.png" };
  for (const t of process.argv.slice(2)) {
    if (/^\d+$/.test(t)) out.step = Number(t);
    else if (t.startsWith("--scale=")) out.scale = Number(t.split("=")[1]);
    else if (t.startsWith("--cx=")) out.cx = Number(t.split("=")[1]);
    else if (t.startsWith("--cy=")) out.cy = Number(t.split("=")[1]);
    else if (t.startsWith("--box=")) out.box = t.split("=")[1];
    else if (t.startsWith("--out=")) out.path = t.split("=")[1];
  }
  return out;
};

function sceneSvg({ step, scale, cx, cy, box }) {
  const two = step >= 3;
  const closeScale = scale ?? (step <= 1 ? CLOSEUP_FOCUS.scale : 0.72);
  const fx = cx ?? (step <= 1 ? F1X - FIG_W / 2 + FIG_W * CLOSEUP_FOCUS.fx : two ? F2X : F1X);
  const fy = cy ?? (step <= 1 ? BASE - FIG_H + FIG_H * CLOSEUP_FOCUS.fy : BASE - FIG_H * 0.5);
  const camera = cam(fx, fy, closeScale);
  const fyPx = BASE - FIG_H, fx1 = F1X - FIG_W / 2, fx2 = F2X - FIG_W / 2;

  // Stage frame: width x height from `box` (ratio "15/22" -> height = w*22/15).
  const [bw, bh] = box.split("/").map(Number);
  const W = 480;
  const BoxH = (W * bh) / bw;

  return `<svg xmlns="http://www.w3.org/2000/svg" width="${W}" height="${BoxH}" viewBox="0 0 ${VIEW_W} ${VIEW_H}">
  <rect width="${VIEW_W}" height="${VIEW_H}" fill="#efece8"/>
    <g transform="${camera}">
      <g opacity="${two ? 0.4 : 1}" transform="${two ? STEP_BACK : 'none'}" style="transform-origin:${F1X}px ${BASE}px">
        <image href="${IMG.c1h}" x="${fx1}" y="${fyPx}" width="${FIG_W}" height="${FIG_H}" opacity="${two ? 1 : 0}"/>
        <image href="${IMG.c1}" x="${fx1}" y="${fyPx}" width="${FIG_W}" height="${FIG_H}" opacity="${two ? 0 : 1}"/>
      </g>
      <g opacity="${two ? 1 : 0}">
        <image href="${IMG.c2}" x="${fx2}" y="${fyPx}" width="${FIG_W}" height="${FIG_H}"/>
      </g>
    </g>
</svg>`;
}

const o = args();
await sharp(Buffer.from(sceneSvg(o))).png().toFile(o.path);
console.log(`wrote ${o.path}  (step ${o.step}, box=${o.box}, scale=${o.scale}, cx=${o.cx}, cy=${o.cy})`);
