import type { ShowcaseDevice } from "$/managers/showcase/showcase-device";
import { clientPoint, PointerDragActivation } from "@xprite/ui/utils";

const PRIMARY_BUTTON = 0;
const MOUSE_POINTER_TYPE = "mouse";

export interface OverviewDeviceHit {
  device: ShowcaseDevice;
  /** Position on the device face, normalized from -1 to 1 with Y pointing up. */
  position: { x: number; y: number };
}

/** Pick actual model surfaces; page scrolling and drag gestures do not activate them. */
export function observeOverviewDeviceSelection(
  stage: HTMLElement,
  isOverview: () => boolean,
  pick: (point: { x: number; y: number }) => OverviewDeviceHit | undefined,
  hover: (device?: ShowcaseDevice, position?: OverviewDeviceHit["position"]) => void,
  select: (device: ShowcaseDevice) => void,
) {
  let hoverFrame: number | undefined;
  let pendingHover: PointerEvent | undefined;
  let pressed:
    | { id: number; device: ShowcaseDevice; activation: PointerDragActivation }
    | undefined;
  const hitAt = (event: PointerEvent) => {
    if (!isOverview()) return undefined;
    if (event.target instanceof Element && event.target.closest("a, button")) return undefined;
    return pick(clientPoint(event));
  };
  const reset = () => {
    if (hoverFrame !== undefined) cancelAnimationFrame(hoverFrame);
    hoverFrame = undefined;
    pendingHover = undefined;
    pressed = undefined;
    hover(undefined);
  };
  const updateHover = () => {
    hoverFrame = undefined;
    const event = pendingHover;
    pendingHover = undefined;
    if (!event) return;
    const hit = hitAt(event);
    hover(hit?.device, hit?.position);
  };
  const down = (event: PointerEvent) => {
    if (hoverFrame !== undefined) cancelAnimationFrame(hoverFrame);
    hoverFrame = undefined;
    pendingHover = undefined;
    if (!event.isPrimary || event.button !== PRIMARY_BUTTON) {
      pressed = undefined;
      return;
    }
    if (event.pointerType !== MOUSE_POINTER_TYPE) hover(undefined);
    const device = hitAt(event)?.device;
    pressed = device
      ? { id: event.pointerId, device, activation: new PointerDragActivation(event) }
      : undefined;
  };
  const move = (event: PointerEvent) => {
    if (pressed?.id === event.pointerId && pressed.activation.update(event)) pressed = undefined;
    if (event.pointerType === MOUSE_POINTER_TYPE && event.buttons === 0) {
      pendingHover = event;
      if (hoverFrame === undefined) hoverFrame = requestAnimationFrame(updateHover);
    }
  };
  const up = (event: PointerEvent) => {
    const candidate = pressed;
    pressed = undefined;
    if (
      !candidate ||
      candidate.id !== event.pointerId ||
      candidate.activation.update(event) ||
      hitAt(event)?.device !== candidate.device
    )
      return;
    hover(undefined);
    select(candidate.device);
  };
  stage.addEventListener("pointerdown", down);
  stage.addEventListener("pointermove", move);
  stage.addEventListener("pointerup", up);
  stage.addEventListener("pointerleave", reset);
  stage.addEventListener("pointercancel", reset);
  window.addEventListener("blur", reset);
  document.addEventListener("visibilitychange", reset);
  return () => {
    stage.removeEventListener("pointerdown", down);
    stage.removeEventListener("pointermove", move);
    stage.removeEventListener("pointerup", up);
    stage.removeEventListener("pointerleave", reset);
    stage.removeEventListener("pointercancel", reset);
    window.removeEventListener("blur", reset);
    document.removeEventListener("visibilitychange", reset);
    reset();
  };
}
