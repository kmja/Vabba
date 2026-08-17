/**
 * The wizard's "character selection" stage — one continuous scene shared by
 * every step, animated by moving a camera and the figures (never remounted):
 *
 * - Step 1: close-up of the swaddled baby, cradled in an arm.
 * - Step 2: the camera pulls back — the caregiver holding the baby is in
 *   focus.
 * - Step 3: the baby is handed over; the second caregiver takes centre
 *   stage while the first steps back, lowers their arm and fades into the
 *   background. In solo mode the second figure never appears.
 *
 * The figures are abstract, gender-neutral silhouettes, so no family
 * constellation is assumed. Decorative only for assistive tech.
 */

const EASE = "cubic-bezier(0.32, 0.8, 0.3, 1)";
const DUR = "850ms";

// The frame. Its own little card, painted with the scene's background — the
// illustration keeps its palette rather than borrowing the page's.
const VIEW_W = 300;
const VIEW_H = 440;

// World coordinates. The camera (below) maps a focus point in this space to
// the centre of the frame, so the figures are laid out at a comfortable size
// no matter how large the frame ends up being on screen.
const BASE = 470; // hem / ground line
const HEAD_Y = 118;
const HEAD_R = 40;
const F1X = 340;
const F2X = 540;
const NAME_Y = 502;

/** Where the bundle rides, relative to whoever is holding it. */
const BABY_AT = {
  one: { x: F1X + 45, y: 312 },
  two: { x: F2X + 45, y: 306 },
};

/** Where caregiver 1 recedes to after the handover: toward the frame's
 *  centre, smaller and higher — the vanishing point. */
const STEP_BACK = "translate(70px, -22px) scale(0.68)";

const move = {
  transitionProperty: "transform, opacity",
  transitionDuration: DUR,
  transitionTimingFunction: EASE,
} as const;

/** One caregiver's silhouette: head and shoulders down to the hem. */
function FigureBody({ cx, tone }: { cx: number; tone: string }) {
  return (
    <g>
      <circle cx={cx} cy={HEAD_Y} r={HEAD_R} fill={`var(${tone})`} />
      <path
        d={`M ${cx},158 C ${cx - 52},166 ${cx - 88},210 ${cx - 88},275
            L ${cx - 88},${BASE} L ${cx + 88},${BASE} L ${cx + 88},275
            C ${cx + 88},210 ${cx + 52},166 ${cx},158 Z`}
        fill={`var(${tone})`}
      />
    </g>
  );
}

/**
 * The cradling arm, drawn over the bundle. There is no resting pose to swap
 * to — against a solid silhouette an arm at the side is invisible — so it
 * simply fades away once the baby has been handed on.
 */
function FigureArm({
  cx,
  tone,
  holding,
}: {
  cx: number;
  tone: string;
  holding: boolean;
}) {
  return (
    <g
      style={{ ...move, opacity: holding ? 1 : 0 }}
      className="motion-reduce:transition-none!"
    >
      <path
        d={`M ${cx - 22},318 C ${cx + 12},348 ${cx + 52},350 ${cx + 78},330`}
        stroke={`var(${tone})`}
        strokeWidth="30"
        strokeLinecap="round"
        fill="none"
      />
    </g>
  );
}

/**
 * How several bundles sit together in one cradle — a row along the arm, each
 * a little smaller, so two to four read clearly at a glance.
 */
const BUNDLE_LAYOUT: { dx: number; dy: number; scale: number }[][] = [
  [{ dx: 0, dy: 0, scale: 1 }],
  [
    { dx: -22, dy: 8, scale: 0.8 },
    { dx: 22, dy: -8, scale: 0.8 },
  ],
  [
    { dx: -34, dy: 10, scale: 0.66 },
    { dx: 0, dy: -6, scale: 0.66 },
    { dx: 34, dy: 10, scale: 0.66 },
  ],
  [
    { dx: -42, dy: 12, scale: 0.58 },
    { dx: -14, dy: -4, scale: 0.58 },
    { dx: 14, dy: -4, scale: 0.58 },
    { dx: 42, dy: 12, scale: 0.58 },
  ],
];

/** The newborn — a stone-coloured bundle with a pale, sleepy face. */
function Baby() {
  return (
    <g>
      {/* arms and legs, behind the body */}
      <path
        d="M -21,-20 L -37,-50"
        stroke="var(--scene-limb)"
        strokeWidth="16"
        strokeLinecap="round"
        fill="none"
      />
      <path
        d="M 23,-24 L 31,-4"
        stroke="var(--scene-limb)"
        strokeWidth="16"
        strokeLinecap="round"
        fill="none"
      />
      <path
        d="M -17,30 L -21,56"
        stroke="var(--scene-limb)"
        strokeWidth="20"
        strokeLinecap="round"
        fill="none"
      />
      <path
        d="M 17,30 L 21,56"
        stroke="var(--scene-limb)"
        strokeWidth="20"
        strokeLinecap="round"
        fill="none"
      />
      <ellipse cx="0" cy="0" rx="38" ry="44" fill="var(--scene-bundle)" />

      <circle cx="0" cy="-67" r="30" fill="var(--scene-face)" />
      <path
        d="M 0,-95 C -2,-103 3,-107 8,-103"
        stroke="var(--scene-hair)"
        strokeWidth="3"
        strokeLinecap="round"
        fill="none"
      />
      <circle cx="-9" cy="-66" r="3" fill="var(--scene-ink)" />
      <circle cx="9" cy="-66" r="3" fill="var(--scene-ink)" />
      <path
        d="M -7,-56 C -3,-52 3,-52 7,-56"
        stroke="var(--scene-ink)"
        strokeWidth="2.5"
        strokeLinecap="round"
        fill="none"
      />
    </g>
  );
}

/** A four-point star — the illustration's bit of sparkle. */
function Sparkle({ x, y, r }: { x: number; y: number; r: number }) {
  return (
    <path
      d={`M 0,${-r} l ${r * 0.27},${r * 0.73} ${r * 0.73},${r * 0.27}
          ${-r * 0.73},${r * 0.27} ${-r * 0.27},${r * 0.73}
          ${-r * 0.27},${-r * 0.73} ${-r * 0.73},${-r * 0.27}
          ${r * 0.73},${-r * 0.27} z`}
      transform={`translate(${x}, ${y})`}
      fill="var(--scene-bundle)"
    />
  );
}

export function FamilyScene({
  step,
  soloMode,
  babyCount = 1,
  nameFirst,
  nameSecond,
}: {
  /** Current wizard step (1 = the baby, 2 = first caregiver, 3 = second). */
  step: number;
  soloMode: boolean;
  /** Children in this birth (1–4) — the cradle holds that many bundles. */
  babyCount?: number;
  nameFirst?: string;
  nameSecond?: string;
}) {
  const bundles =
    BUNDLE_LAYOUT[Math.min(Math.max(babyCount, 1), 4) - 1] ?? BUNDLE_LAYOUT[0];
  const two = step >= 3 && !soloMode;
  const baby = two ? BABY_AT.two : BABY_AT.one;

  // Camera: map a focus point to the centre of the frame at a given zoom.
  const cam = (fx: number, fy: number, s: number) =>
    `translate(${(VIEW_W / 2 - s * fx).toFixed(1)}px, ${(VIEW_H / 2 - s * fy).toFixed(1)}px) scale(${s})`;
  const camera =
    step <= 1
      ? // Close on the cradle: the bundle centred, the arm around it and the
        // parent's chest behind. Wide enough for four bundles.
        cam(BABY_AT.one.x, 290, 2)
      : two
        ? // Both figures: caregiver 2 holding, caregiver 1 behind them.
          cam(489, 290, 0.95)
        : cam(F1X, 290, 1);

  return (
    <svg
      viewBox={`0 0 ${VIEW_W} ${VIEW_H}`}
      aria-hidden
      data-family-scene
      preserveAspectRatio="xMidYMid meet"
      className="pointer-events-none h-full w-full select-none"
    >
      <rect
        x="0"
        y="0"
        width={VIEW_W}
        height={VIEW_H}
        rx="16"
        fill="var(--scene-bg)"
      />
      <Sparkle x={26} y={372} r={11} />
      <Sparkle x={266} y={52} r={11} />

      <g style={{ ...move, transform: camera }} className="motion-reduce:transition-none!">
        {/* Caregiver 1 — holds the baby first, then steps back out of focus */}
        <g
          style={{
            ...move,
            opacity: two ? 0.38 : 1,
            transform: two ? STEP_BACK : "none",
            transformOrigin: `${F1X}px ${BASE}px`,
          }}
          className="motion-reduce:transition-none!"
        >
          <FigureBody cx={F1X} tone="--scene-ink" />
        </g>

        {/* Caregiver 2 — offstage until the handover (never in solo mode) */}
        <g style={{ ...move, opacity: two ? 1 : 0 }} className="motion-reduce:transition-none!">
          <FigureBody cx={F2X} tone="--scene-ink-2" />
        </g>

        {/* The bundle(s) travel between the two cradles: above both bodies,
            below both arms, so whoever holds them holds them properly. */}
        {bundles.map((b, i) => (
          <g
            key={i}
            style={{
              ...move,
              transform: `translate(${baby.x + b.dx}px, ${baby.y + b.dy}px) scale(${b.scale})`,
            }}
            className="motion-reduce:transition-none!"
          >
            <Baby />
          </g>
        ))}

        <g
          style={{
            ...move,
            opacity: two ? 0.38 : 1,
            transform: two ? STEP_BACK : "none",
            transformOrigin: `${F1X}px ${BASE}px`,
          }}
          className="motion-reduce:transition-none!"
        >
          <FigureArm cx={F1X} tone="--scene-ink" holding={!two} />
        </g>
        <g style={{ ...move, opacity: two ? 1 : 0 }} className="motion-reduce:transition-none!">
          <FigureArm cx={F2X} tone="--scene-ink-2" holding={two} />
        </g>

        {/* Name tags — the "character select" label under each figure */}
        <g style={{ ...move, opacity: step >= 2 ? 1 : 0 }} className="motion-reduce:transition-none!">
          <text
            x={F1X}
            y={NAME_Y}
            textAnchor="middle"
            fontSize="28"
            fill="var(--scene-ink)"
            // Follows caregiver 1 as they step back (the label keeps its size
            // — only the figure shrinks).
            style={{ ...move, transform: two ? "translate(70px, -26px)" : "none" }}
            className="motion-reduce:transition-none!"
          >
            {nameFirst || ""}
          </text>
          <text
            x={F2X}
            y={NAME_Y}
            textAnchor="middle"
            fontSize="28"
            fill="var(--scene-ink-2)"
            style={{ ...move, opacity: two ? 1 : 0 }}
            className="motion-reduce:transition-none!"
          >
            {nameSecond || ""}
          </text>
        </g>
      </g>
    </svg>
  );
}
