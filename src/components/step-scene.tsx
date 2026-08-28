/**
 * StepScene — one pre-framed image per wizard step, the visual anchor that
 * says what the step is about:
 *
 *   - step 1: the baby (a newborn "Födelsedatum" cue)
 *   - step 2: caregiver 1 holding the baby
 *   - step 3: caregiver 2 taking the baby (the handover)
 *
 * These are single, already-composed images — no runtime camera/zoom/fade, so
 * they render identically every time. The wizard's layout places this in a
 * consistent, content-first box: the question always keeps its height and the
 * image crops to fill whatever space is left.
 *
 * Each entry is an upright <picture>/<img> with a fixed aspect (object-fit:
 * cover) so trimming the box never distorts the artwork, just crops its edges.
 */
export function StepScene({ step }: { step: number }) {
  const src = step === 1 ? "/Baby.png" : step === 2 ? "/Caregiver1.png" : "/Caregiver2.png";
  return (
    // eslint-disable-next-line @next/next/no-img-element -- static export, no image optimizer to defer to; a plain decorative illustration
    <img
      src={src}
      alt=""
      aria-hidden
      data-step-scene
      className="size-full object-cover object-top select-none"
      draggable={false}
    />
  );
}
