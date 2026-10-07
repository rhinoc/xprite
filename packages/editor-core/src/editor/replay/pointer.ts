import { EditorPointerPhase, type EditorPointerSample } from "$/editor/types";

const CURSOR_IDLE_MS = 600;
const MAX_INTERPOLATION_GAP_MS = 120;

export interface ReplayPointerSample extends EditorPointerSample {
  at: number;
  stroke: number;
}

/** Interpolate the pen position only. Artwork is always the captured raster.
 * Pen lifts, cancellations, long pauses and different strokes are discontinuities. */
export function replayPointerAt(
  samples: readonly ReplayPointerSample[],
  at: number,
): ReplayPointerSample | null {
  let low = 0,
    high = samples.length;
  while (low < high) {
    const middle = (low + high) >>> 1;
    if (samples[middle].at <= at) low = middle + 1;
    else high = middle;
  }
  const before = samples[low - 1];
  if (
    !before?.point ||
    before.phase === EditorPointerPhase.Leave ||
    before.phase === EditorPointerPhase.Cancel
  )
    return null;
  if (!before.pressed && at - before.at > CURSOR_IDLE_MS) return null;
  const after = samples[low];
  if (
    !after?.point ||
    after.phase !== EditorPointerPhase.Move ||
    before.stroke !== after.stroke ||
    before.tool !== after.tool ||
    before.pressed !== after.pressed ||
    after.at - before.at > MAX_INTERPOLATION_GAP_MS ||
    after.at <= before.at
  )
    return before;
  const ratio = (at - before.at) / (after.at - before.at);
  const previous = samples[low - 2];
  const next = samples[low + 1];
  const sameContact = (
    sample: ReplayPointerSample | undefined,
  ): sample is ReplayPointerSample & { point: NonNullable<ReplayPointerSample["point"]> } =>
    !!sample?.point &&
    sample.stroke === before.stroke &&
    sample.tool === before.tool &&
    sample.pressed === before.pressed;
  // Derive velocity from irregular input timestamps and limit overshoot.
  const coordinate = (axis: "x" | "y") => {
    const start = before.point![axis],
      end = after.point![axis];
    const duration = after.at - before.at;
    const delta = end - start;
    const limit = (tangent: number) =>
      delta === 0 || tangent * delta < 0
        ? 0
        : Math.sign(delta) * Math.min(Math.abs(tangent), 3 * Math.abs(delta));
    const m0 = limit(
      sameContact(previous) && before.at - previous.at <= MAX_INTERPOLATION_GAP_MS
        ? ((end - previous.point![axis]) / (after.at - previous.at)) * duration
        : delta,
    );
    const m1 = limit(
      sameContact(next) && next.at - after.at <= MAX_INTERPOLATION_GAP_MS
        ? ((next.point![axis] - start) / (next.at - before.at)) * duration
        : delta,
    );
    const squared = ratio * ratio,
      cubed = squared * ratio;
    return (
      (2 * cubed - 3 * squared + 1) * start +
      (cubed - 2 * squared + ratio) * m0 +
      (-2 * cubed + 3 * squared) * end +
      (cubed - squared) * m1
    );
  };
  return {
    ...before,
    point: { x: coordinate("x"), y: coordinate("y") },
    pressure: before.pressure + (after.pressure - before.pressure) * ratio,
    size: before.size + (after.size - before.size) * ratio,
  };
}
