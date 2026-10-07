export enum WheelDeviceKind {
  Mouse = "mouse",
  Trackpad = "trackpad",
}
export interface WheelDeviceSample {
  x: number;
  y: number;
  deltaMode: number;
  time: number;
  wheelDeltaY?: number;
}

const PIXEL_DELTA_MODE = 0;
const DETECTION_RESET_MS = 500;
const DETECTION_SAMPLE_LIMIT = 6;
const LEGACY_MOUSE_TICK = 120;
const LARGE_MOUSE_DELTA = 80;
const MOUSE_DELTA_QUANTUM = 10;
const SMALL_TRACKPAD_DELTA = 2;
const MIN_REPEATED_MOUSE_SAMPLES = 3;

/** DOM WheelEvent has no hardware identifier. These are only hints for an
 * ordinary wheel event; browser magnification is routed before detection. */
export class BrowserWheelDetector {
  private recent: { magnitude: number; time: number }[] = [];
  private last: WheelDeviceKind = WheelDeviceKind.Trackpad;

  detect(
    input: Pick<WheelDeviceSample, "deltaMode" | "x" | "y" | "wheelDeltaY" | "time">,
  ): WheelDeviceKind {
    const { deltaMode, x, y, wheelDeltaY, time } = input;
    if (this.recent.length && time - this.recent[this.recent.length - 1].time > DETECTION_RESET_MS)
      this.recent = [];
    const magnitude = Math.max(Math.abs(x), Math.abs(y));
    this.recent.push({ magnitude, time });
    if (this.recent.length > DETECTION_SAMPLE_LIMIT) this.recent.shift();
    if (
      deltaMode !== PIXEL_DELTA_MODE ||
      (wheelDeltaY &&
        Math.abs(wheelDeltaY) >= LEGACY_MOUSE_TICK &&
        Math.abs(wheelDeltaY) % LEGACY_MOUSE_TICK === 0) ||
      (magnitude >= LARGE_MOUSE_DELTA &&
        Number.isInteger(magnitude) &&
        magnitude % MOUSE_DELTA_QUANTUM === 0)
    )
      return (this.last = WheelDeviceKind.Mouse);
    if ((x && y) || !Number.isInteger(magnitude) || magnitude <= SMALL_TRACKPAD_DELTA)
      return (this.last = WheelDeviceKind.Trackpad);
    if (this.recent.length >= MIN_REPEATED_MOUSE_SAMPLES) {
      const values = this.recent.map((item) => item.magnitude);
      if (values.every((value) => value === values[0])) return (this.last = WheelDeviceKind.Mouse);
      if (new Set(values).size >= MIN_REPEATED_MOUSE_SAMPLES)
        return (this.last = WheelDeviceKind.Trackpad);
    }
    return this.last;
  }
}
