import {
  EditorWheelInputKind,
  type EditorWheelInputPort,
  type EditorWheelNormalizedInput,
} from "$/managers/ports/platform";
import { WheelDevice, type DetectedWheelDevice } from "$/managers/ports/wheel-device";

interface BrowserWheelSample {
  x: number;
  y: number;
  deltaMode: number;
  time: number;
  wheelDeltaY?: number;
  ctrl?: boolean;
  controlKeyPressed: boolean;
  meta?: boolean;
  shift?: boolean;
  alt?: boolean;
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
class BrowserWheelDetector {
  private recent: { magnitude: number; time: number }[] = [];
  private last: DetectedWheelDevice = WheelDevice.Trackpad;

  detect(
    input: Pick<BrowserWheelSample, "deltaMode" | "x" | "y" | "wheelDeltaY" | "time">,
  ): DetectedWheelDevice {
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
      return (this.last = WheelDevice.Mouse);
    if ((x && y) || !Number.isInteger(magnitude) || magnitude <= SMALL_TRACKPAD_DELTA)
      return (this.last = WheelDevice.Trackpad);
    if (this.recent.length >= MIN_REPEATED_MOUSE_SAMPLES) {
      const values = this.recent.map((item) => item.magnitude);
      if (values.every((value) => value === values[0])) return (this.last = WheelDevice.Mouse);
      if (new Set(values).size >= MIN_REPEATED_MOUSE_SAMPLES)
        return (this.last = WheelDevice.Trackpad);
    }
    return this.last;
  }
}

/** Browser-only translation shared across canvas, panels, and previews. */
export class BrowserWheelInput implements EditorWheelInputPort {
  private readonly detector = new BrowserWheelDetector();
  private readonly events = new WeakMap<WheelEvent, EditorWheelNormalizedInput>();

  connect = (target: HTMLElement, handler: (event: WheelEvent) => void): (() => void) => {
    const wheel = (event: WheelEvent) => {
      if (!event.defaultPrevented) handler(event);
    };
    target.addEventListener("wheel", wheel, { passive: false });
    return () => target.removeEventListener("wheel", wheel);
  };

  read(
    event: WheelEvent,
    device: WheelDevice,
    controlKeyPressed: boolean,
  ): EditorWheelNormalizedInput {
    const existing = this.events.get(event);
    if (existing) return existing;
    const input = this.normalize(
      {
        x: event.deltaX,
        y: event.deltaY,
        deltaMode: event.deltaMode,
        time: event.timeStamp,
        wheelDeltaY: (event as WheelEvent & { wheelDeltaY?: number }).wheelDeltaY,
        ctrl: event.ctrlKey,
        controlKeyPressed,
        meta: event.metaKey,
        shift: event.shiftKey,
        alt: event.altKey,
      },
      device,
    );
    this.events.set(event, input);
    return input;
  }

  private normalize(
    input: BrowserWheelSample,
    device = WheelDevice.Auto,
  ): EditorWheelNormalizedInput {
    const magnify =
      !!input.ctrl && input.deltaMode === PIXEL_DELTA_MODE && !input.controlKeyPressed;
    // Synthetic pinch events do not train the shared ordinary-wheel detector.
    const detected = magnify ? WheelDevice.Trackpad : this.detector.detect(input);
    const precise =
      magnify ||
      (device === WheelDevice.Auto
        ? detected === WheelDevice.Trackpad
        : device === WheelDevice.Trackpad);
    return {
      x: input.x,
      y: input.y,
      precise,
      detected,
      kind: magnify ? EditorWheelInputKind.Magnify : EditorWheelInputKind.Wheel,
      ctrl: input.ctrl,
      meta: input.meta,
      shift: input.shift,
      alt: input.alt,
    };
  }
}
