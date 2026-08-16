/**
 * The wizard's "character selection" stage — one continuous scene shared by
 * all steps, animated by moving a camera and the figures (never remounted):
 *
 * - Step 1: close-up of the baby, swaddled in someone's arms.
 * - Step 2: the camera pulls back — the caregiver holding the baby is in
 *   focus.
 * - Step 3: the baby is handed over; the second caregiver takes center
 *   stage while the first steps back (visible, out of focus). In solo mode
 *   there is no second figure and the camera stays with the only caregiver.
 *
 * The figures are abstract, gender-neutral silhouettes tinted with each
 * caregiver's plan color (chart-1/chart-2, matching the results page), so no
 * family constellation is assumed. Purely decorative for assistive tech.
 */

const EASE = "cubic-bezier(0.33, 0.8, 0.3, 1)";

/** Baby bundle center while held by caregiver 1 / caregiver 2. */
const BABY_AT_ONE = { x: 146, y: 90 };
const BABY_AT_TWO = { x: 189, y: 91 };

/** Camera: translate+scale mapping a focus point to the viewBox center. */
function camera(fx: number, fy: number, s: number): string {
  const cx = 160;
  const cy = 75;
  return `translate(${(cx - s * fx).toFixed(1)}px, ${(cy - s * fy).toFixed(1)}px) scale(${s})`;
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
  /** Display name of the caregiver going first (empty → letter badge). */
  nameFirst?: string;
  nameSecond?: string;
}) {
  const twoInFocus = step >= 3 && !soloMode;

  // Camera per step: baby close-up → first caregiver → second caregiver.
  const cameraTransform =
    step <= 1
      ? camera(BABY_AT_ONE.x, BABY_AT_ONE.y, 2.5)
      : twoInFocus
        ? camera(206, 88, 1.15)
        : camera(130, 88, 1.15);

  const baby = twoInFocus ? BABY_AT_TWO : BABY_AT_ONE;

  const move = {
    transitionProperty: "transform, opacity",
    transitionDuration: "800ms",
    transitionTimingFunction: EASE,
  } as const;

  return (
    <svg
      viewBox="0 0 320 150"
      aria-hidden
      data-family-scene
      className="pointer-events-none h-24 w-full select-none sm:h-28 [@media(max-height:520px)]:hidden"
      preserveAspectRatio="xMidYMid meet"
    >
      <g
        className="motion-reduce:transition-none!"
        style={{ ...move, transform: cameraTransform }}
      >
        {/* Soft ground */}
        <ellipse
          cx="160"
          cy="140"
          rx="150"
          ry="14"
          className="fill-secondary/70"
        />

        {/* Caregiver 1 — holds the baby first, steps back on step 3 */}
        <g
          className="origin-bottom [transform-box:fill-box] motion-reduce:transition-none!"
          style={{
            ...move,
            transform: twoInFocus
              ? "translate(-8px, 0px) scale(0.93)"
              : "translate(0px, 0px) scale(1)",
            opacity: twoInFocus ? 0.45 : 1,
          }}
        >
          <circle cx="120" cy="54" r="12" className="fill-chart-1" />
          <rect
            x="102"
            y="70"
            width="36"
            height="58"
            rx="17"
            className="fill-chart-1"
          />
          {/* cradling arm */}
          <path
            d="M106 86 Q124 106 148 93"
            className="stroke-chart-1 fill-none"
            strokeWidth="9"
            strokeLinecap="round"
          />
        </g>

        {/* Caregiver 2 — offstage until step 3 (never shown in solo mode) */}
        <g
          className="origin-bottom [transform-box:fill-box] motion-reduce:transition-none!"
          style={{
            ...move,
            transform: twoInFocus
              ? "translate(0px, 0px) scale(1.04)"
              : "translate(26px, 0px) scale(0.96)",
            opacity: twoInFocus ? 1 : 0,
          }}
        >
          <circle cx="215" cy="53" r="12" className="fill-chart-2" />
          <rect
            x="197"
            y="69"
            width="36"
            height="59"
            rx="17"
            className="fill-chart-2"
          />
          {/* receiving arm, reaching toward caregiver 1 */}
          <path
            d="M229 85 Q211 105 187 94"
            className="stroke-chart-2 fill-none"
            strokeWidth="9"
            strokeLinecap="round"
          />
        </g>

        {/* The baby — one bundle, handed between the caregivers */}
        <g
          className="origin-center [transform-box:fill-box] motion-reduce:transition-none!"
          style={{
            ...move,
            transform: `translate(${baby.x}px, ${baby.y}px) rotate(${twoInFocus ? 8 : -8}deg)`,
          }}
        >
          <ellipse cx="2" cy="0" rx="14" ry="9" className="fill-chart-4" />
          <circle cx="-11" cy="-2" r="7" className="fill-chart-4" />
          {/* a tiny face, visible in the step-1 close-up */}
          <circle cx="-13.2" cy="-3.4" r="0.9" className="fill-background" />
          <circle cx="-8.8" cy="-3.4" r="0.9" className="fill-background" />
          <path
            d="M-13 -0.6 Q-11 1 -9 -0.6"
            strokeWidth="0.9"
            strokeLinecap="round"
            className="stroke-background fill-none"
          />
        </g>

        {/* Name tags (first names or the caregiver letter), from step 2 on */}
        <g
          className="motion-reduce:transition-none!"
          style={{ ...move, opacity: step >= 2 ? 1 : 0 }}
        >
          <text
            x="120"
            y="147"
            textAnchor="middle"
            fontSize="10"
            className="fill-muted-foreground"
          >
            {nameFirst || ""}
          </text>
          <text
            x="215"
            y="147"
            textAnchor="middle"
            fontSize="10"
            style={{ ...move, opacity: twoInFocus ? 1 : 0 }}
            className="fill-muted-foreground motion-reduce:transition-none!"
          >
            {nameSecond || ""}
          </text>
        </g>
      </g>
    </svg>
  );
}
