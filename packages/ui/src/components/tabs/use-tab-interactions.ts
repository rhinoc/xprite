import {
  useEffect,
  useLayoutEffect,
  useRef,
  useState,
  type PointerEvent,
  type MouseEvent,
} from "react";

import {
  clientPoint,
  scrollPosition,
  scrollSize,
  layoutSize,
  setScrollPosition,
  hitElement,
  clientRect,
  clientScale,
} from "$/base/utils/dom-geometry";
import { PointerDragActivation } from "$/base/utils/pointer-drag-activation";
import { stylusPointerInputProps } from "$/base/utils/stylus-input";
import { TOUCH_LONG_PRESS_DELAY_MS } from "$/components/menu/pointer-gestures";

export interface TabDragPoint {
  x: number;
  y: number;
  floating: boolean;
  offsetX: number;
  offsetY: number;
}

export interface TabInteractionsOptions<T extends string> {
  tabs: readonly T[];
  value: T;
  onValueChange: (value: T) => void;
  onReorder?: (value: T, target: T) => void;
  onClose: (value: T) => void;
  onDragMove?: (value: T, point: TabDragPoint) => void;
  onDragEnd?: (value: T, point: TabDragPoint, cancelled: boolean) => void;
  dragEnabled?: boolean;
}

/** Tabs::onProcessMessage: select on press, clamp wheel traversal, close the
 * hovered tab on middle release, and float a tab after it leaves its strip.
 */
export function useTabInteractions<T extends string>({
  tabs,
  value,
  onValueChange,
  onClose,
  onReorder,
  onDragMove,
  onDragEnd,
  dragEnabled,
}: TabInteractionsOptions<T>) {
  const canDrag = dragEnabled ?? Boolean(onReorder || onDragMove || onDragEnd);
  const ref = useRef<HTMLDivElement>(null);
  const [dragging, setDragging] = useState<{
    value: T;
    delta: number;
    originIndex: number;
    x: number;
    y: number;
    offsetX: number;
    offsetY: number;
    floating: boolean;
    scaleX: number;
    scaleY: number;
  } | null>(null);
  const onValueChangeRef = useRef(onValueChange);
  onValueChangeRef.current = onValueChange;
  const onReorderRef = useRef(onReorder);
  const onDragMoveRef = useRef(onDragMove);
  const onDragEndRef = useRef(onDragEnd);
  onReorderRef.current = onReorder;
  onDragMoveRef.current = onDragMove;
  onDragEndRef.current = onDragEnd;
  const selection = useRef(value);
  selection.current = value;
  const drag = useRef<{
    pointer: number;
    activation: PointerDragActivation;
    draggable: boolean;
    value: T;
    x: number;
    y: number;
    originLeft: number;
    originIndex: number;
    index: number;
    translate: number;
    scaleX: number;
    scaleY: number;
    moved: boolean;
    floating: boolean;
    offsetX: number;
    offsetY: number;
    node: HTMLElement;
    touch: boolean;
    ready: boolean;
    scrolling: boolean;
    initialScrollX: number;
    timer: number | null;
    reorderTarget?: T;
  } | null>(null);
  const removeDragListeners = useRef<(() => void) | null>(null);
  const middle = useRef<{ pointer: number; element: HTMLElement } | null>(null);
  const suppressClick = useRef(false);

  const stopDrag = (cancelled: boolean, point?: { x: number; y: number }) => {
    removeDragListeners.current?.();
    removeDragListeners.current = null;
    const active = drag.current;
    drag.current = null;
    setDragging(null);
    if (active) {
      suppressClick.current = active.moved || active.scrolling || cancelled;
      if (active.timer !== null) window.clearTimeout(active.timer);
      active.node.style.transform = "";
      active.node.style.zIndex = "";
      if (active.node.hasPointerCapture(active.pointer))
        active.node.releasePointerCapture(active.pointer);
      if (active.touch && !active.moved && !active.scrolling && !cancelled)
        onValueChangeRef.current(active.value);
      if (active.touch && active.moved && !cancelled && !active.floating && active.reorderTarget)
        onReorderRef.current?.(active.value, active.reorderTarget);
      if (active.moved)
        onDragEndRef.current?.(
          active.value,
          {
            x: point?.x ?? active.x,
            y: point?.y ?? active.y,
            floating: active.floating,
            offsetX: active.offsetX,
            offsetY: active.offsetY,
          },
          cancelled,
        );
    }
  };

  useEffect(() => {
    if (!canDrag && drag.current?.draggable) stopDrag(true);
  }, [canDrag]);

  useLayoutEffect(() => {
    const active = drag.current;
    if (!active || !dragging || active.floating) return;
    const rect = clientRect(active.node);
    active.translate += (active.originLeft + dragging.delta - rect.left) / active.scaleX;
    active.node.style.transform = `translateX(${active.translate}px)`;
  }, [tabs, dragging]);

  useEffect(() => {
    const node = ref.current;
    if (!node) return;
    const wheel = (event: WheelEvent) => {
      if (node.closest('[data-ui-compact="true"]')) return;
      if (event.defaultPrevented || !tabs.length) return;
      const direction = Math.sign(event.deltaX + event.deltaY);
      if (!direction) return;
      event.preventDefault();
      const index = tabs.indexOf(selection.current);
      if (index < 0) return;
      const next = Math.max(0, Math.min(tabs.length - 1, index + direction));
      if (next !== index) {
        selection.current = tabs[next];
        onValueChange(tabs[next]);
      }
    };
    node.addEventListener("wheel", wheel, { passive: false });
    return () => node.removeEventListener("wheel", wheel);
  }, [tabs, value, onValueChange]);

  useEffect(() => {
    const cancel = () => {
      stopDrag(true);
      const active = middle.current;
      middle.current = null;
      if (active?.element.hasPointerCapture(active.pointer))
        active.element.releasePointerCapture(active.pointer);
    };
    const visibility = () => {
      if (document.visibilityState === "hidden") cancel();
    };
    document.addEventListener("visibilitychange", visibility);
    window.addEventListener("blur", cancel);
    return () => {
      document.removeEventListener("visibilitychange", visibility);
      window.removeEventListener("blur", cancel);
      cancel();
    };
  }, []);

  return {
    ref,
    dragging,
    getTabProps: (tab: T) => ({
      ...stylusPointerInputProps(),
      "data-ui-tab-value": tab,
      onPointerDown: (event: PointerEvent<HTMLElement>) => {
        if (event.defaultPrevented) return;
        if (event.pointerType === "touch" && (!event.isPrimary || drag.current)) {
          stopDrag(true);
          return;
        }
        suppressClick.current = false;
        if (
          event.button === 0 &&
          !(event.pointerType === "touch" && event.target === event.currentTarget) &&
          !(
            event.target instanceof Element &&
            event.target.closest("button") &&
            event.target.closest("button") !== event.currentTarget
          )
        )
          onValueChange(tab);
        if (
          event.button === 0 &&
          (canDrag || event.pointerType === "touch") &&
          event.target === event.currentTarget
        ) {
          if (event.pointerType !== "touch") {
            event.preventDefault();
            event.currentTarget.dataset.uiPointerFocused = "true";
            event.currentTarget.focus({ preventScroll: true });
          }
          const rect = clientRect(event.currentTarget);
          const scale = clientScale(event.currentTarget);
          const contact = {
            pointer: event.pointerId,
            activation: new PointerDragActivation(event),
            draggable: canDrag,
            value: tab,
            x: clientPoint(event).x,
            y: clientPoint(event).y,
            originLeft: rect.left,
            originIndex: tabs.indexOf(tab),
            index: tabs.indexOf(tab),
            translate: 0,
            scaleX: scale.x,
            scaleY: scale.y,
            moved: false,
            floating: false,
            offsetX: clientPoint(event).x - rect.left,
            offsetY: clientPoint(event).y - rect.top,
            node: event.currentTarget,
            touch: event.pointerType === "touch",
            ready: event.pointerType !== "touch",
            scrolling: false,
            initialScrollX: scrollPosition(ref.current)?.x ?? 0,
            timer: null as number | null,
            reorderTarget: undefined as T | undefined,
          };
          drag.current = contact;
          if (contact.touch && contact.draggable)
            contact.timer = window.setTimeout(() => {
              if (drag.current === contact && !contact.scrolling) contact.ready = true;
              contact.timer = null;
            }, TOUCH_LONG_PRESS_DELAY_MS);
          const move = (pointer: globalThis.PointerEvent) => {
            const active = drag.current;
            if (!active || active.pointer !== pointer.pointerId) return;
            const deltaX = clientPoint(pointer).x - active.x;
            const deltaY = clientPoint(pointer).y - active.y;
            if (!active.activation.update(pointer)) return;
            const strip = clientRect(ref.current);
            const outsideStrip =
              !!strip &&
              !(
                clientPoint(pointer).x >= strip.left &&
                clientPoint(pointer).x < strip.right &&
                clientPoint(pointer).y >= strip.top &&
                clientPoint(pointer).y < strip.bottom
              );
            const outsideVertical =
              !!strip &&
              (clientPoint(pointer).y < strip.top || clientPoint(pointer).y >= strip.bottom);
            if (
              active.touch &&
              active.scrolling &&
              active.draggable &&
              outsideVertical &&
              Math.abs(deltaY) >= Math.abs(deltaX)
            ) {
              active.scrolling = false;
              active.ready = true;
            }
            if (active.touch && !active.ready && !active.scrolling) {
              const horizontal = Math.abs(deltaX) > Math.abs(deltaY);
              const canScroll =
                !!ref.current && scrollSize(ref.current).width > layoutSize(ref.current).width;
              // A swipe along an overflowing strip scrolls it; moving out of
              // the strip detaches the tab without requiring a stationary hold.
              if (horizontal && canScroll) active.scrolling = true;
              else if (active.draggable && (outsideStrip || !canScroll)) active.ready = true;
              if (active.timer !== null) window.clearTimeout(active.timer);
              active.timer = null;
            }
            if (active.scrolling) {
              if (ref.current)
                setScrollPosition(ref.current, {
                  x: active.initialScrollX - deltaX / clientScale(ref.current).x,
                });
              return;
            }
            if (!active.ready || !active.draggable) return;
            if (active.touch) pointer.preventDefault();
            active.moved = true;

            const floating = outsideStrip;
            active.floating = floating;
            onDragMoveRef.current?.(active.value, {
              x: clientPoint(pointer).x,
              y: clientPoint(pointer).y,
              floating,
              offsetX: active.offsetX,
              offsetY: active.offsetY,
            });

            if (!floating) {
              const candidates = [
                ...(ref.current?.querySelectorAll<HTMLElement>("[data-ui-tab-value]") ?? []),
              ];
              const slots = candidates.map((node) => {
                const rect = clientRect(node);
                return {
                  value: node.dataset.uiTabValue as T,
                  left: rect.left - (node === active.node ? active.translate * active.scaleX : 0),
                  right: rect.right - (node === active.node ? active.translate * active.scaleX : 0),
                };
              });
              const index = slots.findIndex(
                (slot) =>
                  clientPoint(pointer).x >= slot.left && clientPoint(pointer).x < slot.right,
              );
              const nextIndex =
                index >= 0 ? index : clientPoint(pointer).x < slots[0]?.left ? 0 : slots.length - 1;
              if (nextIndex >= 0 && nextIndex !== active.index) {
                active.index = nextIndex;
                if (active.touch) active.reorderTarget = slots[nextIndex].value;
                else onReorderRef.current?.(active.value, slots[nextIndex].value);
              }
              const rect = clientRect(active.node);
              active.translate += (active.originLeft + deltaX - rect.left) / active.scaleX;
              active.node.style.transform = `translateX(${active.translate}px)`;
              active.node.style.zIndex = "var(--ui-tab-drag-layer)";
            } else {
              active.node.style.transform = "";
              active.node.style.zIndex = "";
              active.translate = 0;
            }
            setDragging({
              value: active.value,
              delta: deltaX,
              originIndex: active.originIndex,
              x: clientPoint(pointer).x,
              y: clientPoint(pointer).y,
              offsetX: active.offsetX,
              offsetY: active.offsetY,
              floating,
              scaleX: active.scaleX,
              scaleY: active.scaleY,
            });
          };
          const up = (pointer: globalThis.PointerEvent) => {
            if (drag.current?.pointer === pointer.pointerId) {
              move(pointer);
              if (drag.current?.moved || drag.current?.scrolling) pointer.preventDefault();
              stopDrag(false, { x: clientPoint(pointer).x, y: clientPoint(pointer).y });
            }
          };
          const cancel = (pointer: globalThis.PointerEvent) => {
            if (drag.current?.pointer === pointer.pointerId)
              stopDrag(true, { x: clientPoint(pointer).x, y: clientPoint(pointer).y });
          };
          const interrupt = (pointer: globalThis.PointerEvent) => {
            if (drag.current?.touch && pointer.pointerId !== drag.current.pointer) stopDrag(true);
          };
          window.addEventListener("pointerdown", interrupt, true);
          window.addEventListener("pointermove", move);
          window.addEventListener("pointerup", up);
          window.addEventListener("pointercancel", cancel);
          removeDragListeners.current = () => {
            window.removeEventListener("pointerdown", interrupt, true);
            window.removeEventListener("pointermove", move);
            window.removeEventListener("pointerup", up);
            window.removeEventListener("pointercancel", cancel);
          };
          event.currentTarget.setPointerCapture(event.pointerId);
        }
        if (event.button !== 1) return;
        event.preventDefault();
        event.currentTarget.setPointerCapture(event.pointerId);
        middle.current = { pointer: event.pointerId, element: event.currentTarget };
      },
      onKeyDown: (event: import("react").KeyboardEvent<HTMLElement>) => {
        delete event.currentTarget.dataset.uiPointerFocused;
        if (event.key === "Escape" && drag.current) {
          stopDrag(true);
          event.preventDefault();
          event.stopPropagation();
        }
      },
      onBlur: (event: import("react").FocusEvent<HTMLElement>) => {
        delete event.currentTarget.dataset.uiPointerFocused;
      },
      onPointerUp: (event: PointerEvent<HTMLElement>) => {
        if (event.button !== 1 || middle.current?.pointer !== event.pointerId) return;
        event.preventDefault();
        middle.current = null;
        if (event.currentTarget.hasPointerCapture(event.pointerId))
          event.currentTarget.releasePointerCapture(event.pointerId);
        const target = hitElement(
          { x: clientPoint(event).x, y: clientPoint(event).y },
          document,
        )?.closest<HTMLElement>("[data-ui-tab-value]");
        const value = tabs.find((item) => item === target?.dataset.uiTabValue);
        if (value !== undefined && target && ref.current?.contains(target)) onClose(value);
      },
      onPointerCancel: () => {
        middle.current = null;
      },
      onLostPointerCapture: (event: PointerEvent<HTMLElement>) => {
        if (drag.current?.pointer === event.pointerId) stopDrag(true);
        middle.current = null;
      },
      onClick: (event: MouseEvent<HTMLElement>) => {
        if (event.detail !== 0 && suppressClick.current) {
          event.preventDefault();
          event.stopPropagation();
          return;
        }
        onValueChangeRef.current(tab);
      },
      onAuxClick: (event: MouseEvent<HTMLElement>) => {
        if (event.button === 1) event.preventDefault();
      },
    }),
  };
}
