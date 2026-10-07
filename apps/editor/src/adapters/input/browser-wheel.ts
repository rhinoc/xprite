import {
  EditorWheelInputKind,
  type EditorWheelInputPort,
  type EditorWheelNormalizedInput,
} from "$/managers/ports/platform";
import { WheelDevice } from "$/managers/ports/wheel-device";
import { BrowserWheelDetector, WheelDeviceKind } from "@xprite/bedrock/browser/wheel-device";

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
    const detected =
      magnify || this.detector.detect(input) === WheelDeviceKind.Trackpad
        ? WheelDevice.Trackpad
        : WheelDevice.Mouse;
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
