import type { PointerInput } from "$/base/pointer-input";
import type { Brush, Point } from "$/base/primitives";
import { line } from "$/canvas/raster/geometry";
import { AsepriteDynamicSensor, type AsepriteDynamicsSettings } from "$/drawing/tool-settings";
import { clamp } from "@xprite/bedrock/common/clamp";
const f = Math.fround;
/** Normalize a pointer sensor to the configured interval. */
export function sensorThreshold(value: number, min: number, max: number): number {
  if (!Number.isFinite(value) || !Number.isFinite(min) || !Number.isFinite(max)) return 0;
  if (min >= max) return value < min ? 0 : 1;
  return clamp((value - min) / (max - min), 0, 1);
}
export interface DynamicBrushSample {
  brush: Brush;
  gradient: number;
}
/** Keep pointer pressure, screen motion, and canvas smoothing state for a stroke.
 * The first move establishes the velocity origin; Shift can disable smoothing. */
export class StrokeDynamics {
  revision = 0;
  private last: PointerInput;
  private velocity: Point = { x: 0, y: 0 };
  private velocityStarted = false;
  private center: Point;
  private stabilizerDisabled: boolean;
  private releasing = false;
  constructor(
    input: PointerInput,
    readonly settings?: AsepriteDynamicsSettings,
  ) {
    this.last = input;
    this.center = { x: Math.floor(input.x), y: Math.floor(input.y) };
    this.stabilizerDisabled = !!input.shift;
  }
  disableStabilizer() {
    this.stabilizerDisabled = true;
  }
  update(input: PointerInput): Point {
    const same = this.last.x === input.x && this.last.y === input.y;
    if (this.releasing && same) {
      this.releasing = false;
      return { x: Math.trunc(this.center.x) || 0, y: Math.trunc(this.center.y) || 0 };
    }
    this.releasing = false;
    this.revision++;
    const elapsed = Math.max(0, (input.timeStamp ?? 0) - (this.last.timeStamp ?? 0));
    const weight = clamp(elapsed / 50, 0, 1),
      p = input.screen ?? input,
      prev = this.last.screen ?? this.last;
    if (this.velocityStarted)
      this.velocity = {
        x: f(this.velocity.x + (Math.trunc(p.x) - Math.trunc(prev.x) - this.velocity.x) * weight),
        y: f(this.velocity.y + (Math.trunc(p.y) - Math.trunc(prev.y) - this.velocity.y) * weight),
      };
    else this.velocityStarted = true;
    this.last = input;
    const x = Math.floor(input.x),
      y = Math.floor(input.y),
      factor =
        this.settings?.stabilizer && !this.stabilizerDisabled ? this.settings.stabilizerFactor : 0;
    if (factor > 0) {
      const dx = Math.trunc(f(x - this.center.x)),
        dy = Math.trunc(f(y - this.center.y));
      this.center = { x: f(this.center.x + dx / factor), y: f(this.center.y + dy / factor) };
    } else this.center = { x, y };
    return { x: Math.trunc(this.center.x) || 0, y: Math.trunc(this.center.y) || 0 };
  }
  releaseInput(input: PointerInput): PointerInput {
    this.releasing = true;
    return {
      ...input,
      pressure: this.last.pressure,
      pointerType: this.last.pointerType,
      timeStamp: this.last.timeStamp,
      screen: this.last.screen,
    };
  }
  private sensors() {
    const s = this.settings;
    if (!s) return { pressure: 1, velocity: 0 };
    const hasPressure = this.last.pointerType === "pen" || this.last.pointerType === "eraser";
    return {
      pressure:
        hasPressure && Number.isFinite(this.last.pressure)
          ? sensorThreshold(this.last.pressure!, s.minPressureThreshold, s.maxPressureThreshold)
          : 1,
      velocity: sensorThreshold(
        clamp(Math.hypot(this.velocity.x, this.velocity.y) / 32, 0, 1),
        s.minVelocityThreshold,
        s.maxVelocityThreshold,
      ),
    };
  }
  gradient(): number {
    const s = this.settings;
    if (!s || s.gradient === AsepriteDynamicSensor.Static) return 0;
    const values = this.sensors();
    return s.gradient === AsepriteDynamicSensor.Pressure ? values.pressure : values.velocity;
  }
  sample(base: Brush): DynamicBrushSample {
    return { brush: this.brush(base), gradient: this.gradient() };
  }
  brush(base: Brush): Brush {
    const s = this.settings;
    if (!s) return base;
    const values = this.sensors();
    const value = (mode: string, min: number, max: number) => {
      if (
        mode === AsepriteDynamicSensor.Static ||
        (mode === AsepriteDynamicSensor.Pressure &&
          this.last.pointerType !== "pen" &&
          this.last.pointerType !== "eraser")
      )
        return max;
      const t = mode === AsepriteDynamicSensor.Pressure ? values.pressure : values.velocity;
      return Math.trunc(min + (max - min) * t) || 0;
    };
    return {
      ...base,
      size: clamp(value(s.size, s.minSize, base.size), 1, 64),
      angle: clamp(value(s.angle, s.minAngle, base.angle), -180, 180),
    };
  }
}
/** Interpolate brush controls by distance along the integer centerline. */
export function interpolateDynamicStroke(
  from: Point,
  to: Point,
  previous: DynamicBrushSample,
  next: DynamicBrushSample,
  stamp: (point: Point, sample: DynamicBrushSample) => void,
) {
  const steps = Math.max(Math.abs(to.x - from.x), Math.abs(to.y - from.y)) + 1,
    step = f(1 / steps);
  if (steps === 1) {
    stamp(to, next);
    return;
  }
  let index = 0;
  line(from.x, from.y, to.x, to.y, (x, y) => {
    const position = index++;
    if (position === 0) return;
    const t = Math.min(1, position * step);
    const mix = (a: number, b: number) => a + (b - a) * t;
    const sample = {
      brush: {
        ...next.brush,
        size: clamp(Math.trunc(mix(previous.brush.size, next.brush.size)), 1, 64),
        angle: clamp(Math.trunc(mix(previous.brush.angle, next.brush.angle)) || 0, -180, 180),
      },
      gradient: mix(previous.gradient, next.gradient),
    };
    stamp({ x, y }, sample);
  });
}
export function interpolateBrushStroke(
  from: Point,
  to: Point,
  previous: Brush,
  next: Brush,
  stamp: (point: Point, brush: Brush) => void,
) {
  interpolateDynamicStroke(
    from,
    to,
    { brush: previous, gradient: 0 },
    { brush: next, gradient: 0 },
    (p, s) => stamp(p, s.brush),
  );
}
