import { clientPoint } from "$/base/utils/dom-geometry";
import { connectStylusTouchDefaults, stylusPointerOwner } from "$/base/utils/stylus-input";
import { PointerClickSequence } from "$/components/menu/pointer-gestures";

const SYNTHETIC_DOUBLE_CLICK_FLAG = "uiTouchDoubleClick";
const DOUBLE_CLICK_DETAIL = 2;
const PRIMARY_POINTER_BUTTON = 0;
const scopes = new WeakMap<Document, { references: number; disconnect: () => void }>();

/** One native listener per document, including nested providers and portal controls. */
export function connectStylusPointerRegions(document: Document): () => void {
  let scope = scopes.get(document);
  if (!scope) {
    const taps = new PointerClickSequence();
    const prevented = new Set<number>();
    let generation = 0;
    const reset = () => {
      generation++;
      taps.reset();
      prevented.clear();
    };
    const visibility = () => {
      if (document.hidden) reset();
    };
    const host = document.defaultView;
    const disconnectTouches = connectStylusTouchDefaults(
      document,
      (event) => !!stylusPointerOwner(event),
      (_event, touches) => {
        for (const touch of touches) prevented.add(touch.identifier);
      },
    );
    const down = (event: PointerEvent) => {
      if (event.pointerType !== "pen") {
        taps.reset();
        return;
      }
      const owner = stylusPointerOwner(event);
      if (owner && event.button === PRIMARY_POINTER_BUTTON) taps.press(event, owner);
      else taps.reset();
    };
    const move = (event: PointerEvent) => {
      if (event.pointerType === "pen") taps.move(event);
    };
    const up = (event: PointerEvent) => {
      if (event.pointerType !== "pen") return;
      // Other browsers retain their native double-click path. Synthesize only
      // for contacts whose native touch defaults were actually cancelled.
      if (!prevented.delete(event.pointerId)) {
        taps.reset();
        return;
      }
      if (taps.release(event) !== DOUBLE_CLICK_DETAIL) return;
      const owner = stylusPointerOwner(event);
      if (!owner) return;
      const point = clientPoint(event);
      const doubleClick = new MouseEvent("dblclick", {
        bubbles: true,
        cancelable: true,
        detail: DOUBLE_CLICK_DETAIL,
        button: event.button,
        clientX: point.x,
        clientY: point.y,
        altKey: event.altKey,
        ctrlKey: event.ctrlKey,
        metaKey: event.metaKey,
        shiftKey: event.shiftKey,
      });
      Object.defineProperty(doubleClick, SYNTHETIC_DOUBLE_CLICK_FLAG, { value: true });
      const releasedGeneration = generation;
      queueMicrotask(() => {
        if (generation === releasedGeneration && owner.isConnected)
          owner.dispatchEvent(doubleClick);
      });
    };
    const cancel = (event: PointerEvent) => {
      if (event.pointerType !== "pen") return;
      reset();
    };
    host?.addEventListener("blur", reset);
    document.addEventListener("visibilitychange", visibility);
    document.addEventListener("pointerdown", down, true);
    document.addEventListener("pointermove", move, { capture: true, passive: true });
    document.addEventListener("pointerup", up, true);
    document.addEventListener("pointercancel", cancel, true);
    scope = {
      references: 0,
      disconnect: () => {
        disconnectTouches();
        host?.removeEventListener("blur", reset);
        document.removeEventListener("visibilitychange", visibility);
        document.removeEventListener("pointerdown", down, true);
        document.removeEventListener("pointermove", move, true);
        document.removeEventListener("pointerup", up, true);
        document.removeEventListener("pointercancel", cancel, true);
        reset();
      },
    };
    scopes.set(document, scope);
  }
  const activeScope = scope;
  activeScope.references++;
  let connected = true;
  return () => {
    if (!connected) return;
    connected = false;
    if (--activeScope.references === 0) {
      activeScope.disconnect();
      scopes.delete(document);
    }
  };
}
