/**
 * The wizard's "character selection" stage — one continuous scene shared by
 * every step, animated by moving a camera and the figures (never remounted):
 *
 * - Step 1: close-up of the swaddled baby, cradled in an arm.
 * - Step 2: the camera pulls back — the caregiver holding the baby is in
 *   focus.
 * - Step 3: the baby is handed over; the second caregiver takes centre
 *   stage while the first steps back, lowers their arms and fades into the
 *   background. In solo mode the second figure never appears.
 *
 * The figures are abstract, gender-neutral silhouettes tinted with each
 * caregiver's plan colour (chart-1 / chart-2, matching the results page), so
 * no family constellation is assumed. Decorative only for assistive tech.
 */

const EASE = "cubic-bezier(0.32, 0.8, 0.3, 1)";
const DUR = "850ms";

const BASE = 118; // hem / ground line
const SY = 64; // shoulder line
const CHEST = SY + 32; // where the bundle rides
const F1X = 165;
const F2X = 245;

const BABY_AT = {
  one: { x: F1X - 3, y: CHEST, rot: -9 },
  two: { x: F2X - 3, y: CHEST - 3, rot: -9 },
};

/** Darken / lighten a theme colour without leaving the token system. */
const dark = (v: string, p: number) => `color-mix(in oklab, var(${v}), black ${p}%)`;
const light = (v: string, p: number) => `color-mix(in oklab, var(${v}), white ${p}%)`;

const move = {
  transitionProperty: "transform, opacity",
  transitionDuration: DUR,
  transitionTimingFunction: EASE,
} as const;

/**
 * One caregiver. Both arm poses are always rendered and cross-faded, because
 * SVG path data cannot be tweened by CSS — `holding` only shifts opacity.
 */
function Figure({
  cx,
  tone,
  tall = 0,
  holding,
}: {
  cx: number;
  tone: string;
  tall?: number;
  holding: boolean;
}) {
  const sy = SY - tall;
  const headY = 48 - tall;
  const headR = 14;

  const cradleArm = `M ${cx + 14},${sy + 9} Q ${cx + 22},${sy + 26} ${cx + 15},${sy + 38} Q ${cx + 2},${sy + 47} ${cx - 13},${sy + 41}`;
  const restArm = `M ${cx + 14},${sy + 9} Q ${cx + 21},${sy + 27} ${cx + 19},${sy + 46}`;
  const cradleFar = `M ${cx - 14},${sy + 8} Q ${cx - 24},${sy + 24} ${cx - 19},${sy + 35}`;
  const restFar = `M ${cx - 14},${sy + 8} Q ${cx - 21},${sy + 26} ${cx - 19},${sy + 46}`;

  return (
    <g>
      <ellipse cx={cx} cy={BASE + 3} rx="27" ry="5" fill={dark("--secondary", 7)} />

      {/* far arm (behind the torso), both poses cross-faded */}
      <g style={{ ...move, opacity: holding ? 1 : 0 }} className="motion-reduce:transition-none!">
        <path d={cradleFar} fill="none" stroke={dark(tone, 26)} strokeWidth="11" strokeLinecap="round" />
      </g>
      <g style={{ ...move, opacity: holding ? 0 : 1 }} className="motion-reduce:transition-none!">
        <path d={restFar} fill="none" stroke={dark(tone, 26)} strokeWidth="11" strokeLinecap="round" />
      </g>

      {/* torso: soft shoulders, tapered waist */}
      <path
        d={`M ${cx - 16},${BASE} Q ${cx - 18},${sy + 20} ${cx - 15},${sy + 8}
            Q ${cx - 12.5},${sy - 4} ${cx},${sy - 5} Q ${cx + 12.5},${sy - 4} ${cx + 15},${sy + 8}
            Q ${cx + 18},${sy + 20} ${cx + 16},${BASE} Z`}
        fill={`var(${tone})`}
      />

      {/* head, leaning toward the bundle while holding */}
      <g
        style={{ ...move, transform: `rotate(${holding ? -8 : 0}deg)`, transformOrigin: `${cx}px ${sy}px` }}
        className="motion-reduce:transition-none!"
      >
        <rect x={cx - 4.5} y={headY + 7} width="9" height="13" rx="4" fill={dark(tone, 16)} />
        <circle cx={cx} cy={headY} r={headR} fill={`var(${tone})`} />
        <path
          d={`M ${cx - headR},${headY} A ${headR},${headR} 0 0 1 ${cx + headR},${headY}
              Q ${cx + 7},${headY - 6} ${cx},${headY - 6} Q ${cx - 7},${headY - 6} ${cx - headR},${headY} Z`}
          fill={dark(tone, 26)}
        />
      </g>

      {/* near arm + hand, in front — a shade lighter so the limb reads */}
      <g style={{ ...move, opacity: holding ? 1 : 0 }} className="motion-reduce:transition-none!">
        <path d={cradleArm} fill="none" stroke={light(tone, 14)} strokeWidth="11.5" strokeLinecap="round" />
        <circle cx={cx - 13} cy={sy + 41} r="6.4" fill={light(tone, 20)} />
      </g>
      <g style={{ ...move, opacity: holding ? 0 : 1 }} className="motion-reduce:transition-none!">
        <path d={restArm} fill="none" stroke={light(tone, 14)} strokeWidth="11.5" strokeLinecap="round" />
        <circle cx={cx + 19} cy={sy + 46} r="6.4" fill={light(tone, 20)} />
      </g>
    </g>
  );
}

/** The swaddled newborn — a cream blanket that reads against either parent. */
function Baby({ x, y, rot }: { x: number; y: number; rot: number }) {
  return (
    <g
      style={{ ...move, transform: `translate(${x}px, ${y}px) rotate(${rot}deg)` }}
      className="motion-reduce:transition-none!"
    >
      <path
        d="M -6,-12 Q 13,-10.5 20,-2.5 Q 23,0 20,2.5 Q 13,10.5 -6,12 Q -16,12 -16,0 Q -16,-12 -6,-12 Z"
        fill="var(--swaddle)"
      />
      <path
        d="M -7,-11.5 Q -1,0 -7,11.5"
        fill="none"
        stroke="var(--swaddle-fold)"
        strokeWidth="2.1"
        strokeLinecap="round"
      />
      <circle cx="-18.5" cy="-0.5" r="9.2" fill="var(--baby-skin)" />
      <path d="M -24,-7 Q -18.5,-11.6 -13,-7 Q -18.5,-9 -24,-7 Z" fill={dark("--baby-skin", 20)} />
      <circle cx="-21.5" cy="-1.6" r="1.1" fill="var(--baby-face)" />
      <circle cx="-15.9" cy="-1.6" r="1.1" fill="var(--baby-face)" />
      <path
        d="M -21,2.3 Q -18.7,4.1 -16.4,2.3"
        fill="none"
        stroke="var(--baby-face)"
        strokeWidth="1.1"
        strokeLinecap="round"
      />
    </g>
  );
}

export function FamilyScene({
  step,
  soloMode,
  nameFirst,
  nameSecond,
}: {
  /** Current wizard step (1 = the baby, 2 = first caregiver, 3 = second). */
  step: number;
  soloMode: boolean;
  nameFirst?: string;
  nameSecond?: string;
}) {
  const two = step >= 3 && !soloMode;
  const baby = two ? BABY_AT.two : BABY_AT.one;

  // Camera: map a focus point to the centre of the viewBox at a given zoom.
  const cam = (fx: number, fy: number, s: number) =>
    `translate(${(180 - s * fx).toFixed(1)}px, ${(73 - s * fy).toFixed(1)}px) scale(${s})`;
  const camera =
    step <= 1
      ? cam(baby.x + 8, 97, 2.2)
      : two
        ? cam(F2X, 84, 1.3)
        : cam(F1X, 84, 1.3);

  return (
    <svg
      viewBox="0 0 360 146"
      aria-hidden
      data-family-scene
      preserveAspectRatio="xMidYMid meet"
      className="pointer-events-none h-28 w-full select-none sm:h-32 [@media(max-height:560px)]:hidden [@media(max-height:740px)]:h-16"
    >
      <g style={{ ...move, transform: camera }} className="motion-reduce:transition-none!">
        {/* Caregiver 1 — holds the baby first, then steps back out of focus */}
        <g
          style={{
            ...move,
            opacity: two ? 0.36 : 1,
            transform: two ? "translate(-12px, 0px) scale(0.87)" : "none",
            transformOrigin: `${F1X}px ${BASE}px`,
          }}
          className="motion-reduce:transition-none!"
        >
          <Figure cx={F1X} tone="--chart-1" holding={!two} />
        </g>

        {/* Caregiver 2 — offstage until the handover (never in solo mode) */}
        <g style={{ ...move, opacity: two ? 1 : 0 }} className="motion-reduce:transition-none!">
          <Figure cx={F2X} tone="--chart-2" tall={3} holding={two} />
        </g>

        <Baby x={baby.x} y={baby.y} rot={baby.rot} />

        {/* Name tags — the "character select" label under each figure */}
        <g style={{ ...move, opacity: step >= 2 ? 1 : 0 }} className="motion-reduce:transition-none!">
          <text
            x={F1X}
            y={BASE + 18}
            textAnchor="middle"
            fontSize="11"
            className="fill-muted-foreground"
          >
            {nameFirst || ""}
          </text>
          <text
            x={F2X}
            y={BASE + 18}
            textAnchor="middle"
            fontSize="11"
            style={{ ...move, opacity: two ? 1 : 0 }}
            className="fill-muted-foreground motion-reduce:transition-none!"
          >
            {nameSecond || ""}
          </text>
        </g>
      </g>
    </svg>
  );
}
