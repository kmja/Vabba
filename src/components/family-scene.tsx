/**
 * The wizard's "character selection" stage — one continuous scene shared by
 * every step, animated by moving a camera and the figures (never remounted):
 *
 * - Step 1: close-up of the swaddled baby, cradled in caregiver 1's arm.
 * - Step 2: the camera pulls back — caregiver 1, holding the baby, is in
 *   focus.
 * - Step 3: the baby is handed over; caregiver 2 takes centre stage while
 *   caregiver 1 steps back, arm extended, and fades into the background. In
 *   solo mode the second figure never appears.
 *
 * Built from the same illustrated portraits as the results page
 * (`CaregiverPortrait`, below) — caregiver 1 in coral, caregiver 2 in blue —
 * so the cast reads as the same two people throughout the app. Floats
 * directly on the page (no card, no background of its own), fading out at
 * the bottom edge. Decorative only for assistive tech.
 */

const EASE = "cubic-bezier(0.32, 0.8, 0.3, 1)";
const DUR = "850ms";

// The frame — just a coordinate space for the camera math below, no visible
// bounds of its own.
const VIEW_W = 300;
const VIEW_H = 440;

// World coordinates — bigger than the frame; the camera below crops and
// zooms into whichever part of it is in focus. Each figure is one portrait
// image (see CaregiverPortrait) at its native 2:3 aspect, feet on BASE.
const BASE = 445;
const FIG_H = 500;
const FIG_W = (FIG_H * 1024) / 1536;
const F1X = 130; // caregiver 1 (coral), the one home first
const F2X = 400; // caregiver 2 (blue), 270 world-units over

/** Where the bundle rides in caregiver 1's holding pose, as a fraction of
 *  their own box — the step-1 close-up zooms in on this point. */
const BUNDLE_AT = { fx: 0.615, fy: 0.31 };

const STEP_BACK_DX = (F2X - F1X) * 0.35;
const STEP_BACK_DY = -20;
/** Where caregiver 1 recedes to once they've handed the baby over: toward
 *  the frame's centre, smaller — the vanishing point. */
const STEP_BACK = `translate(${STEP_BACK_DX}px, ${STEP_BACK_DY}px) scale(0.6)`;

const move = {
  transitionProperty: "transform, opacity",
  transitionDuration: DUR,
  transitionTimingFunction: EASE,
} as const;

/**
 * One caregiver's illustrated portrait, on the results page: whoever is
 * home right now holding the bundle, the other with empty arms. Two drawn
 * poses per caregiver, reused by the wizard's own animated scene below —
 * so there's no independent control over how many babies show; a multiple
 * birth still renders as the one bundle.
 */
export function CaregiverPortrait({
  second = false,
  holding = false,
}: {
  /** The second caregiver's artwork rather than the first's. */
  second?: boolean;
  /** Cradling the bundle — for whoever is home in the period shown. */
  holding?: boolean;
}) {
  const src = second
    ? holding
      ? "/Caregiver2.png"
      : "/Caregiver2_empty.png"
    : holding
      ? "/Caregiver1.png"
      : "/Caregiver1_handover.png";
  return (
    // eslint-disable-next-line @next/next/no-img-element -- static export, no image optimizer to defer to; a plain decorative illustration
    <img
      src={src}
      alt=""
      data-caregiver-portrait
      className="pointer-events-none size-full object-contain select-none"
    />
  );
}

export function FamilyScene({
  step,
  soloMode,
  babyCount = 1,
}: {
  /** Current wizard step (1 = the baby, 2 = first caregiver, 3 = second). */
  step: number;
  soloMode: boolean;
  /** Children in this birth (1–4) — shown as a badge on the bundle. */
  babyCount?: number;
}) {
  const two = step >= 3 && !soloMode;

  // Camera: map a focus point to the centre of the frame at a given zoom.
  const cam = (fx: number, fy: number, s: number) =>
    `translate(${(VIEW_W / 2 - s * fx).toFixed(1)}px, ${(VIEW_H / 2 - s * fy).toFixed(1)}px) scale(${s})`;
  const figMidY = BASE - FIG_H * 0.5;
  const camera =
    step <= 1
      ? // Close on caregiver 1's bundle — the arm and their chest behind it.
        cam(
          F1X - FIG_W / 2 + FIG_W * BUNDLE_AT.fx,
          BASE - FIG_H + FIG_H * BUNDLE_AT.fy,
          3,
        )
      : two
        ? // Both figures, close together mid-handover.
          cam((F1X + F2X) / 2, figMidY, 0.46)
        : cam(F1X, figMidY, 0.72);

  const fy = BASE - FIG_H;
  const fx1 = F1X - FIG_W / 2;
  const fx2 = F2X - FIG_W / 2;
  // Where the multiple-birth badge sits: the corner of whoever currently
  // holds the bundle's arms, near where it rides — offset off the bundle
  // itself so it doesn't sit on top of the baby's face.
  const badgeAt = two
    ? {
        x: F2X - FIG_W / 2 + FIG_W * (BUNDLE_AT.fx + 0.1),
        y: fy + FIG_H * (BUNDLE_AT.fy - 0.06),
      }
    : {
        x: fx1 + FIG_W * (BUNDLE_AT.fx + 0.1),
        y: fy + FIG_H * (BUNDLE_AT.fy - 0.06),
      };

  // Fades the whole illustration out toward the bottom edge, rather than
  // cutting it off flush against the page — floats on it instead of sitting
  // in a boxed frame.
  const fade = "linear-gradient(to bottom, black 0%, black 68%, transparent 98%)";

  return (
    <svg
      viewBox={`0 0 ${VIEW_W} ${VIEW_H}`}
      aria-hidden
      data-family-scene
      preserveAspectRatio="xMidYMid meet"
      className="pointer-events-none h-full w-full select-none"
      style={{ maskImage: fade, WebkitMaskImage: fade }}
    >
      <g style={{ ...move, transform: camera }} className="motion-reduce:transition-none!">
        {/* Caregiver 1 (coral) — holds the baby first, then hands over and
            steps back out of focus. Both poses share the same silhouette
            and framing, so the crossfade reads as a change of pose. */}
        <g
          style={{
            ...move,
            opacity: two ? 0.4 : 1,
            transform: two ? STEP_BACK : "none",
            transformOrigin: `${F1X}px ${BASE}px`,
          }}
          className="motion-reduce:transition-none!"
        >
          <image
            href="/Caregiver1_handover.png"
            x={fx1}
            y={fy}
            width={FIG_W}
            height={FIG_H}
            style={{ ...move, opacity: two ? 1 : 0 }}
            className="motion-reduce:transition-none!"
          />
          <image
            href="/Caregiver1.png"
            x={fx1}
            y={fy}
            width={FIG_W}
            height={FIG_H}
            style={{ ...move, opacity: two ? 0 : 1 }}
            className="motion-reduce:transition-none!"
          />
        </g>

        {/* Caregiver 2 (blue) — offstage until the handover (never in solo
            mode), already holding once they arrive. */}
        <g style={{ ...move, opacity: two ? 1 : 0 }} className="motion-reduce:transition-none!">
          <image href="/Caregiver2.png" x={fx2} y={fy} width={FIG_W} height={FIG_H} />
        </g>

        {/* A multiple birth reads as one bundle in the portraits — say so
            with a small badge rather than redrawing the illustration. */}
        {babyCount > 1 && (
          <g
            style={{ ...move, transform: `translate(${badgeAt.x}px, ${badgeAt.y}px)` }}
            className="motion-reduce:transition-none!"
          >
            <circle r="15" fill="var(--scene-ink)" />
            <text
              textAnchor="middle"
              dominantBaseline="central"
              fontSize="15"
              fontWeight="700"
              fill="var(--scene-bg)"
            >
              ×{babyCount}
            </text>
          </g>
        )}

      </g>
    </svg>
  );
}
