import { useEffect, useRef, type CSSProperties, type MouseEventHandler } from "react";

import { composeEventHandlers } from "$/base/utils/compose-event-handlers";
import { clientPoint, hitElement, clientRect } from "$/base/utils/dom-geometry";
import type {
  ContextMenuTargetProps,
  ContextMenuTargetPropsGetter,
} from "$/components/menu/context-menu-types";
import { PointerClickSequence, TouchLongPressGesture } from "$/components/menu/pointer-gestures";
import type { LongPressActivation, PointerContact } from "$/components/menu/pointer-gestures";

interface ContextMenuTargetOptions {
  longPressTarget?: string | false;
  longPressActivation?: LongPressActivation;
  touchDoubleClickTarget?: string;
  gestureScope?: unknown;
  canOpenTouchMenu?: (input: PointerContact, target: Element) => boolean;
  onContextMenu?: MouseEventHandler<HTMLElement>;
  open?: MouseEventHandler<HTMLElement>;
  style?: CSSProperties;
}

type ContextMenuNativeEvent = MouseEvent & {
  uiTouchLongPress?: boolean;
  uiKeyboardContextMenu?: boolean;
  pointerType?: string;
  sourceCapabilities?: { firesTouchEvents?: boolean };
};
const RECENT_TOUCH_INTERVAL_MS = 1400;
const RECENT_TOUCH_DISTANCE = 32;
const TOUCH_CLICK_SUPPRESSION_MS = 700;
const touchOwners = new WeakMap<Event, () => void>();

/** Desktop double-clicks retain their meaning; touch menus use a stationary long press. */
export function useContextMenuTarget({
  longPressTarget,
  longPressActivation,
  touchDoubleClickTarget,
  gestureScope,
  canOpenTouchMenu,
  onContextMenu,
  open,
  style,
}: ContextMenuTargetOptions): ContextMenuTargetPropsGetter {
  const selector = useRef(longPressTarget);
  selector.current = longPressTarget;
  const eligibility = useRef(canOpenTouchMenu);
  eligibility.current = canOpenTouchMenu;
  const lastTouch = useRef<{ x: number; y: number; at: number } | null>(null);
  const suppressed = useRef<{ x: number; y: number; until: number } | null>(null);
  const taps = useRef(new PointerClickSequence());
  const longPress = useRef<TouchLongPressGesture | null>(null);
  if (!longPress.current)
    longPress.current = new TouchLongPressGesture(
      (input, target) => {
        taps.current.reset();
        suppressed.current = {
          x: clientPoint(input).x,
          y: clientPoint(input).y,
          until: Date.now() + TOUCH_CLICK_SUPPRESSION_MS,
        };
        const cancel = new PointerEvent("pointercancel", {
          bubbles: true,
          pointerId: input.pointerId,
          pointerType: "touch",
        });
        Object.defineProperty(cancel, "uiTouchLongPress", { value: true });
        target.dispatchEvent(cancel);
        const event = new MouseEvent("contextmenu", {
          bubbles: true,
          cancelable: true,
          button: 2,
          clientX: clientPoint(input).x,
          clientY: clientPoint(input).y,
        });
        Object.defineProperty(event, "uiTouchLongPress", { value: true });
        target.dispatchEvent(event);
      },
      (input, target) => eligibility.current?.(input, target) ?? true,
    );
  useEffect(() => {
    const cancel = () => {
      longPress.current?.cancel();
      taps.current.reset();
      lastTouch.current = null;
      suppressed.current = null;
    };
    const release = (event: PointerEvent) => {
      if (longPress.current?.release(event)) {
        suppressed.current = {
          x: clientPoint(event).x,
          y: clientPoint(event).y,
          until: Date.now() + TOUCH_CLICK_SUPPRESSION_MS,
        };
        event.preventDefault();
        event.stopPropagation();
        taps.current.reset();
      }
    };
    const pointerCancel = (event: PointerEvent) => {
      if (!(event as PointerEvent & { uiTouchLongPress?: boolean }).uiTouchLongPress) {
        longPress.current?.cancel(event);
        taps.current.reset();
      }
    };
    // The popup can cover the pressed target. Consume its release before it
    // reaches a menu item, even when capture was released by drag cancellation.
    const click = (event: MouseEvent) => {
      if (event.detail === 0) return;
      const value = suppressed.current;
      if (
        !(event as MouseEvent & { uiTouchDoubleClick?: boolean }).uiTouchDoubleClick &&
        value &&
        Date.now() < value.until &&
        Math.hypot(clientPoint(event).x - value.x, clientPoint(event).y - value.y) <
          RECENT_TOUCH_DISTANCE
      ) {
        event.preventDefault();
        event.stopPropagation();
      }
    };
    const press = (event: PointerEvent) => {
      suppressed.current = null;
      if (event.pointerType !== "touch" || !event.isPrimary) {
        longPress.current?.cancel();
        taps.current.reset();
      }
    };
    const visibility = () => {
      if (document.visibilityState === "hidden") cancel();
    };
    document.addEventListener("visibilitychange", visibility);
    window.addEventListener("blur", cancel);
    window.addEventListener("pointerup", release, true);
    window.addEventListener("pointercancel", pointerCancel, true);
    window.addEventListener("pointerdown", press, true);
    window.addEventListener("click", click, true);
    window.addEventListener("dblclick", click, true);
    return () => {
      document.removeEventListener("visibilitychange", visibility);
      window.removeEventListener("blur", cancel);
      window.removeEventListener("pointerup", release, true);
      window.removeEventListener("pointercancel", pointerCancel, true);
      window.removeEventListener("pointerdown", press, true);
      window.removeEventListener("click", click, true);
      window.removeEventListener("dblclick", click, true);
      cancel();
    };
  }, [gestureScope, longPressTarget, longPressActivation]);
  const hit = (root: HTMLElement, x: number, y: number, targetSelector = selector.current) => {
    if (targetSelector === false) return null;
    const target = targetSelector
      ? hitElement({ x: x, y: y }, root.ownerDocument)?.closest(targetSelector)
      : root;
    return target && root.contains(target) ? target : null;
  };
  return <Props extends object = ContextMenuTargetProps>(
    props: Props & ContextMenuTargetProps = {} as Props & ContextMenuTargetProps,
  ) => ({
    ...props,
    style: style ? { ...style, ...props.style } : props.style,
    onPointerDownCapture: composeEventHandlers((event) => {
      if (event.pointerType !== "touch") {
        suppressed.current = null;
        lastTouch.current = null;
        return;
      }
      lastTouch.current = { x: clientPoint(event).x, y: clientPoint(event).y, at: Date.now() };
      const target = hit(event.currentTarget, clientPoint(event).x, clientPoint(event).y);
      const tapTarget = hit(
        event.currentTarget,
        clientPoint(event).x,
        clientPoint(event).y,
        touchDoubleClickTarget ?? selector.current,
      );
      if (target || tapTarget) {
        touchOwners.get(event.nativeEvent)?.();
        touchOwners.set(event.nativeEvent, () => {
          longPress.current?.cancel();
          taps.current.reset();
        });
      }
      longPress.current?.press(event.nativeEvent, target, longPressActivation);
      taps.current.press(
        event.nativeEvent,
        hit(
          event.currentTarget,
          clientPoint(event).x,
          clientPoint(event).y,
          touchDoubleClickTarget ?? selector.current,
        ),
      );
      if (!event.isPrimary) taps.current.reset();
    }, props.onPointerDownCapture),
    onPointerMoveCapture: composeEventHandlers((event) => {
      longPress.current?.move(event.nativeEvent);
      taps.current.move(event.nativeEvent);
    }, props.onPointerMoveCapture),
    onPointerUp: composeEventHandlers(props.onPointerUp, (event) => {
      if (event.pointerType !== "touch" || taps.current.release(event.nativeEvent) !== 2) return;
      const target = hit(
        event.currentTarget,
        clientPoint(event).x,
        clientPoint(event).y,
        touchDoubleClickTarget ?? selector.current,
      );
      if (!target) return;
      suppressed.current = {
        x: clientPoint(event).x,
        y: clientPoint(event).y,
        until: Date.now() + TOUCH_CLICK_SUPPRESSION_MS,
      };
      const doubleClick = new MouseEvent("dblclick", {
        bubbles: true,
        cancelable: true,
        clientX: clientPoint(event).x,
        clientY: clientPoint(event).y,
        detail: 2,
      });
      Object.defineProperty(doubleClick, "uiTouchDoubleClick", { value: true });
      target.dispatchEvent(doubleClick);
    }),
    onPointerCancel: composeEventHandlers(props.onPointerCancel, (event) => {
      if (!(event.nativeEvent as PointerEvent & { uiTouchLongPress?: boolean }).uiTouchLongPress)
        longPress.current?.cancel(event.nativeEvent);
      taps.current.reset();
    }),
    onKeyDown: composeEventHandlers(props.onKeyDown, (event) => {
      if (event.key === "Escape") {
        longPress.current?.cancel();
        taps.current.reset();
      }
      if (event.key === "ContextMenu" || (event.shiftKey && event.key === "F10")) {
        event.preventDefault();
        event.stopPropagation();
        if (!(event.target instanceof HTMLElement)) return;
        const bounds = clientRect(event.target);
        const contextMenu = new MouseEvent("contextmenu", {
          bubbles: true,
          cancelable: true,
          clientX: bounds.left,
          clientY: bounds.bottom,
        });
        Object.defineProperty(contextMenu, "uiKeyboardContextMenu", { value: true });
        event.target.dispatchEvent(contextMenu);
      }
    }),
    onContextMenu: composeEventHandlers(props.onContextMenu, (event) => {
      const original = event.nativeEvent as ContextMenuNativeEvent;
      const recent = lastTouch.current;
      const recentTouch =
        !original.pointerType &&
        !original.sourceCapabilities &&
        recent &&
        Date.now() - recent.at < RECENT_TOUCH_INTERVAL_MS &&
        Math.hypot(clientPoint(original).x - recent.x, clientPoint(original).y - recent.y) <
          RECENT_TOUCH_DISTANCE;
      if (
        !original.uiTouchLongPress &&
        !original.uiKeyboardContextMenu &&
        (original.pointerType === "touch" ||
          original.sourceCapabilities?.firesTouchEvents ||
          recentTouch)
      ) {
        event.preventDefault();
        event.stopPropagation();
        return;
      }
      onContextMenu?.(event);
      if (!event.defaultPrevented) open?.(event);
    }),
  });
}
