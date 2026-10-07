import { SNAP_DURATION_MS } from "$/adapters/showcase/showcase-motion";
import { layoutSize } from "@xprite/ui/utils";

enum NavigationKey {
  Previous = "ArrowLeft",
  Next = "ArrowRight",
}

enum WheelUnit {
  Pixel = 0,
  Line = 1,
  Page = 2,
}

const WHEEL_LINE_PIXELS = 16;
const WHEEL_THRESHOLD = 40;
const WHEEL_IDLE_MS = 180;
const PREVIOUS_DEVICE = -1;
const NEXT_DEVICE = 1;

/** One wheel burst moves one device; trackpad momentum cannot skip the next snap. */
export function observeShowcaseNavigation(
  host: HTMLElement,
  callback: (direction: number) => void,
  enabled: () => boolean,
) {
  const stage = host.parentElement ?? host;
  let lastWheel = -Infinity;
  let lastSwitch = -Infinity;
  let accumulated = 0;
  let consumed = false;

  const keydown = (event: KeyboardEvent) => {
    if (!enabled()) return;
    if (event.target instanceof Element && event.target.closest("[data-showcase-stories]")) return;
    if (event.defaultPrevented || event.altKey || event.ctrlKey || event.metaKey) return;
    if (event.key !== NavigationKey.Previous && event.key !== NavigationKey.Next) return;
    event.preventDefault();
    callback(event.key === NavigationKey.Next ? NEXT_DEVICE : PREVIOUS_DEVICE);
  };
  const wheel = (event: WheelEvent) => {
    if (!enabled()) return;
    if (event.defaultPrevented || event.ctrlKey || event.metaKey || event.altKey) return;
    // Vertical scrolling belongs to the page; horizontal input navigates the demo.
    if (!event.shiftKey && Math.abs(event.deltaX) <= Math.abs(event.deltaY)) return;
    const raw = event.shiftKey ? event.deltaY || event.deltaX : event.deltaX;
    if (raw === 0) return;
    event.preventDefault();
    const now = performance.now();
    if (now - lastWheel > WHEEL_IDLE_MS) {
      accumulated = 0;
      consumed = false;
    }
    lastWheel = now;
    if (consumed || now - lastSwitch < SNAP_DURATION_MS) return;
    const unit =
      event.deltaMode === WheelUnit.Page
        ? layoutSize(stage).width
        : event.deltaMode === WheelUnit.Line
          ? WHEEL_LINE_PIXELS
          : 1;
    const delta = raw * unit;
    if (Math.sign(delta) !== Math.sign(accumulated)) accumulated = 0;
    accumulated += delta;
    if (Math.abs(accumulated) < WHEEL_THRESHOLD) return;
    consumed = true;
    lastSwitch = now;
    callback(accumulated > 0 ? NEXT_DEVICE : PREVIOUS_DEVICE);
  };
  window.addEventListener("keydown", keydown);
  stage.addEventListener("wheel", wheel, { passive: false });
  return () => {
    window.removeEventListener("keydown", keydown);
    stage.removeEventListener("wheel", wheel);
  };
}
