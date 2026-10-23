import type { PointerInput } from "$/base/pointer-input";
import type { Brush, Point } from "$/base/primitives";
import { line } from "$/canvas/raster/geometry";
import {
  MAX_STROKE_DTIME_SECONDS,
  SPEED1_SOFT_MAX,
  SPEED1_SOFT_MIN,
  dynamicColorMix,
  dynamicStampAngle,
  dynamicStampSize,
  normSpeed,
  pressureInput,
  slowTrackingPosition,
  smoothNormSpeed,
  speed1Input,
  strokeDtimeSeconds,
} from "$/drawing/mypaint-dynamics";
import { BrushDynamicInput, type BrushDynamicsSettings } from "$/drawing/tool-settings";
import { clamp } from "@xprite/bedrock/common/clamp";

const f = Math.fround;

export interface DynamicBrushSample {
  brush: Brush;
  gradient: number;
}

function pixelTarget(input: PointerInput): Point {
  return { x: Math.floor(input.x), y: Math.floor(input.y) };
}

/**
 * Keep libmypaint pressure, fine speed, and slow tracking for one stroke.
 * Speed is sampled from the smoothed value before this step is folded in,
 * which is the order in `update_states_and_setting_values`.
 * Devices without a stylus axis hold pressure at 1 so the stamp stays on the
 * brush size at the top of the curve. Pen and eraser use the reported pressure.
 */
export class StrokeDynamics {
  revision = 0;
  private last: PointerInput;
  private center: Point;
  private point: Point;
  private smoothedNormSpeed = 0;
  private sampledNormSpeed = 0;
  private trackingDisabled: boolean;
  private releasing = false;

  constructor(
    input: PointerInput,
    readonly settings?: BrushDynamicsSettings,
  ) {
    this.last = input;
    this.point = pixelTarget(input);
    this.center = { ...this.point };
    this.trackingDisabled = !!input.shift;
  }

  disableSlowTracking() {
    this.trackingDisabled = true;
  }

  update(input: PointerInput): Point {
    const same = this.last.x === input.x && this.last.y === input.y;
    if (this.releasing && same) {
      this.releasing = false;
      return { ...this.point };
    }
    this.releasing = false;
    this.revision++;
    const target = pixelTarget(input);
    const dtime = strokeDtimeSeconds(this.last.timeStamp, input.timeStamp);
    if (dtime > MAX_STROKE_DTIME_SECONDS) {
      this.center = target;
      this.point = target;
      this.smoothedNormSpeed = 0;
      this.sampledNormSpeed = 0;
      this.last = input;
      return { ...this.point };
    }
    const amount =
      this.settings?.slowTracking && !this.trackingDisabled ? this.settings.slowTrackingAmount : 0;
    this.center =
      amount > 0
        ? slowTrackingPosition(this.center.x, this.center.y, target.x, target.y, amount, dtime)
        : target;
    this.point =
      amount > 0 ? { x: Math.round(this.center.x), y: Math.round(this.center.y) } : target;
    const current = input.screen ?? input;
    const previous = this.last.screen ?? this.last;
    const physical = normSpeed(current.x - previous.x, current.y - previous.y, dtime);
    this.sampledNormSpeed = this.smoothedNormSpeed;
    this.smoothedNormSpeed = smoothNormSpeed(this.smoothedNormSpeed, physical, dtime);
    this.last = input;
    return { ...this.point };
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

  private pressure(): number {
    const stylus = this.last.pointerType === "pen" || this.last.pointerType === "eraser";
    const reported = stylus
      ? Number.isFinite(this.last.pressure)
        ? Math.max(0, this.last.pressure!)
        : 1
      : 1;
    return pressureInput(reported);
  }

  private parameter(
    mode: BrushDynamicInput,
    min: number,
    max: number,
    kind: "size" | "angle" | "color",
  ): number {
    if (mode === BrushDynamicInput.Off) return kind === "color" ? 0 : max;
    const pressure = mode === BrushDynamicInput.Pressure;
    const input = pressure ? this.pressure() : speed1Input(this.sampledNormSpeed);
    const low = pressure ? 0 : SPEED1_SOFT_MIN;
    const high = pressure ? 1 : SPEED1_SOFT_MAX;
    if (kind === "size") return dynamicStampSize(input, low, high, min, max);
    if (kind === "angle") return dynamicStampAngle(input, low, high, min, max);
    return dynamicColorMix(input, low, high);
  }

  gradient(): number {
    const settings = this.settings;
    if (!settings) return 0;
    return this.parameter(settings.color, 0, 1, "color");
  }

  sample(base: Brush): DynamicBrushSample {
    return { brush: this.brush(base), gradient: this.gradient() };
  }

  brush(base: Brush): Brush {
    const settings = this.settings;
    if (!settings) return base;
    return {
      ...base,
      size: this.parameter(settings.size, settings.minSize, base.size, "size"),
      angle: this.parameter(settings.angle, settings.minAngle, base.angle, "angle"),
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
