import type { ToolWheelInput } from "$/managers/ports/preview";
import { BrowserWheelDetector, WheelDeviceKind } from "@xprite/bedrock/browser/wheel-device";

const wheelDetector = new BrowserWheelDetector();
const PIXEL_WHEEL_MODE = 0;
const LINE_WHEEL_MODE = 1;
const LINE_WHEEL_PIXELS = 16;
const PAGE_WHEEL_PIXELS = 600;

export function readToolWheel(event: WheelEvent): ToolWheelInput {
  const magnify = event.ctrlKey && event.deltaMode === PIXEL_WHEEL_MODE;
  const detected = magnify
    ? WheelDeviceKind.Trackpad
    : wheelDetector.detect({
        x: event.deltaX,
        y: event.deltaY,
        deltaMode: event.deltaMode,
        time: event.timeStamp,
        wheelDeltaY: (event as WheelEvent & { wheelDeltaY?: number }).wheelDeltaY,
      });
  return {
    precise: detected === WheelDeviceKind.Trackpad,
    magnify,
    zoom: event.ctrlKey || event.metaKey,
    shift: event.shiftKey,
    unit:
      event.deltaMode === PIXEL_WHEEL_MODE
        ? 1
        : event.deltaMode === LINE_WHEEL_MODE
          ? LINE_WHEEL_PIXELS
          : PAGE_WHEEL_PIXELS,
  };
}
