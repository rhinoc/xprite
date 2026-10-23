import type { PointerInput } from "$/base/pointer-input";
import type { Brush, Point } from "$/base/primitives";
import { line } from "$/canvas/raster/geometry";
import {
  MYPAINT_MIN_DTIME,
  MYPAINT_PRESSURE_RANGE,
  MYPAINT_SPEED_RANGE,
  MYPAINT_SPEED_SLOWNESS,
  mypaintFilterSpeed,
  mypaintMappingCalculate,
  mypaintPressureInput,
  mypaintSlowTracking,
  mypaintSpeedInput,
  mypaintSpeedMapping,
} from "$/canvas/raster/mypaint";
import { DynamicsInput, type BrushDynamicsSettings } from "$/drawing/tool-settings";
import { clamp } from "@xprite/bedrock/common/clamp";

const MS_PER_SECOND = 1000;
const MIN_BRUSH_SIZE = 1;
const MAX_BRUSH_SIZE = 64;
const MAX_BRUSH_ANGLE = 180;
/** Pointer Events report a constant 0.5 for buttons without pressure sensing.
 * Those devices use full pressure, without gain, so a pressure mapping keeps
 * the brush value. */
const UNSENSED_PRESSURE = MYPAINT_PRESSURE_RANGE[1];
const INPUT_INDEX = { [DynamicsInput.Pressure]: 0, [DynamicsInput.Speed]: 1 } as const;
const INPUT_RANGE = {
  [DynamicsInput.Pressure]: MYPAINT_PRESSURE_RANGE,
  [DynamicsInput.Speed]: MYPAINT_SPEED_RANGE,
} as const;

export interface DynamicBrushSample {
  brush: Brush;
  /** Position between the low (0) and high (1) gradient colors. */
  gradient: number;
}

export function usesDynamicBrush(settings: BrushDynamicsSettings | undefined): boolean {
  return (
    !!settings &&
    (settings.sizeInput !== DynamicsInput.None ||
      settings.angleInput !== DynamicsInput.None ||
      settings.colorInput !== DynamicsInput.None)
  );
}

function sensesPressure(input: PointerInput): boolean {
  return (
    (input.pointerType === "pen" || input.pointerType === "eraser") &&
    Number.isFinite(input.pressure)
  );
}

/** Per-stroke libmypaint input state: tablet pressure with gain, filtered
 * screen speed, and slow position tracking. Shift at the start of a stroke
 * disables position tracking. */
export class StrokeDynamics {
  revision = 0;
  private last: PointerInput;
  private tracked: Point;
  private filteredSpeed = 0;
  private trackingDisabled: boolean;
  private releasing = false;
  private readonly speedMapping = mypaintSpeedMapping();
  constructor(
    input: PointerInput,
    readonly settings?: BrushDynamicsSettings,
  ) {
    this.last = input;
    this.tracked = { x: Math.floor(input.x), y: Math.floor(input.y) };
    this.trackingDisabled = !!input.shift;
  }
  disableTracking() {
    this.trackingDisabled = true;
  }
  update(input: PointerInput): Point {
    const same = this.last.x === input.x && this.last.y === input.y;
    if (this.releasing && same) {
      this.releasing = false;
      return this.trackedPoint();
    }
    this.releasing = false;
    this.revision++;
    const elapsed = ((input.timeStamp ?? 0) - (this.last.timeStamp ?? 0)) / MS_PER_SECOND;
    const dtime = elapsed > 0 ? elapsed : MYPAINT_MIN_DTIME;
    const p = input.screen ?? input,
      previous = this.last.screen ?? this.last;
    this.filteredSpeed = mypaintFilterSpeed(
      this.filteredSpeed,
      Math.hypot(p.x - previous.x, p.y - previous.y) / dtime,
      MYPAINT_SPEED_SLOWNESS,
      dtime,
    );
    this.last = input;
    const x = Math.floor(input.x),
      y = Math.floor(input.y),
      slowTracking = this.trackingDisabled ? 0 : (this.settings?.slowTracking ?? 0);
    this.tracked =
      slowTracking > 0
        ? {
            x: mypaintSlowTracking(this.tracked.x, x, slowTracking, dtime),
            y: mypaintSlowTracking(this.tracked.y, y, slowTracking, dtime),
          }
        : { x, y };
    return this.trackedPoint();
  }
  /** Keep the last contact's pressure so lifting the pen does not taper the end. */
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
  sample(base: Brush): DynamicBrushSample {
    return { brush: this.brush(base), gradient: this.gradient() };
  }
  brush(base: Brush): Brush {
    const s = this.settings;
    if (!s) return base;
    return {
      ...base,
      size: clamp(
        Math.round(this.output(s.sizeInput, s.sizeLow, base.size)),
        MIN_BRUSH_SIZE,
        MAX_BRUSH_SIZE,
      ),
      angle:
        clamp(
          Math.round(this.output(s.angleInput, s.angleLow, base.angle)),
          -MAX_BRUSH_ANGLE,
          MAX_BRUSH_ANGLE,
        ) || 0,
    };
  }
  gradient(): number {
    const s = this.settings;
    return s && s.colorInput !== DynamicsInput.None ? this.output(s.colorInput, 0, 1) : 0;
  }
  private trackedPoint(): Point {
    return { x: Math.round(this.tracked.x) || 0, y: Math.round(this.tracked.y) || 0 };
  }
  private inputs(): number[] {
    return [
      sensesPressure(this.last)
        ? mypaintPressureInput(this.last.pressure!, this.settings?.pressureGain ?? 0)
        : UNSENSED_PRESSURE,
      mypaintSpeedInput(this.speedMapping, this.filteredSpeed),
    ];
  }
  /** A two-point mapping over the input's soft range, limited to its endpoints. */
  private output(input: DynamicsInput, low: number, high: number): number {
    if (input === DynamicsInput.None) return high;
    const [min, max] = INPUT_RANGE[input];
    const value = mypaintMappingCalculate(
      0,
      [
        {
          input: INPUT_INDEX[input],
          points: [
            [min, low],
            [max, high],
          ],
        },
      ],
      this.inputs(),
    );
    return clamp(value, Math.min(low, high), Math.max(low, high));
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
  const steps = Math.max(Math.abs(to.x - from.x), Math.abs(to.y - from.y));
  if (steps === 0) {
    stamp(to, next);
    return;
  }
  let index = 0;
  line(from.x, from.y, to.x, to.y, (x, y) => {
    const t = index++ / steps;
    if (t === 0) return;
    const mix = (a: number, b: number) => a + (b - a) * t;
    stamp(
      { x, y },
      {
        brush: {
          ...next.brush,
          size: clamp(
            Math.round(mix(previous.brush.size, next.brush.size)),
            MIN_BRUSH_SIZE,
            MAX_BRUSH_SIZE,
          ),
          angle:
            clamp(
              Math.round(mix(previous.brush.angle, next.brush.angle)),
              -MAX_BRUSH_ANGLE,
              MAX_BRUSH_ANGLE,
            ) || 0,
        },
        gradient: mix(previous.gradient, next.gradient),
      },
    );
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
