import { useEffect, useRef, useState, type CSSProperties, type HTMLAttributes } from "react";

import { clientPoint, clientScale, clientToLocal } from "$/base/utils/dom-geometry";
import { PointerDragActivation } from "$/base/utils/pointer-drag-activation";
import { stylusPointerInputProps } from "$/base/utils/stylus-input";

const PRIMARY_PAN_POINTER_BUTTON = 0;

export interface PanPoint {
  x: number;
  y: number;
}

export interface PanPinch {
  center: PanPoint;
  distance: number;
}

export interface PanSurfaceProps extends HTMLAttributes<HTMLDivElement> {
  onPinchStart?: (pinch: PanPinch) => void;
  onPinch?: (pinch: PanPinch) => void;
  onPinchEnd?: () => PanPoint | void;
  pan: PanPoint;
  onPan: (pan: PanPoint) => void;
  /** CSS pixels per content coordinate before any ancestor transform. */
  coordinateScale?: PanPoint;
  handTool?: boolean;
  panButtons?: readonly number[];
  enabled?: boolean;
  cursor?: { hand?: CSSProperties["cursor"]; dragging?: CSSProperties["cursor"] };
  /** Host input policy receives raw wheel events and decides what they mean. */
  onWheelEvent?: (event: WheelEvent, surface: HTMLDivElement, scale: PanPoint) => void;
}

/** Pointer-captured pan surface with temporary Space hand mode. */
export function PanSurface({
  pan,
  onPan,
  onPinchStart,
  onPinch,
  onPinchEnd,
  coordinateScale = { x: 1, y: 1 },
  handTool = false,
  panButtons,
  enabled = true,
  cursor,
  onWheelEvent,
  children,
  style,
  ...props
}: PanSurfaceProps) {
  const surface = useRef<HTMLDivElement>(null);
  const hovered = useRef(false);
  const drag = useRef<{
    pointer: number;
    client: PanPoint;
    origin: PanPoint;
    scale: PanPoint;
    activation?: PointerDragActivation;
  } | null>(null);
  const contacts = useRef(new Map<number, PanPoint>());
  const pinching = useRef(false);
  const [spaceHeld, setSpaceHeld] = useState(false);
  const [dragging, setDragging] = useState(false);

  useEffect(() => {
    const node = surface.current;
    if (!node || !enabled || !onWheelEvent) return;
    const wheel = (event: WheelEvent) => onWheelEvent(event, node, coordinateScale);
    node.addEventListener("wheel", wheel, { passive: false });
    return () => node.removeEventListener("wheel", wheel);
  }, [enabled, onWheelEvent, coordinateScale.x, coordinateScale.y]);

  useEffect(() => {
    const reset = () => {
      const active = drag.current;
      if (active && surface.current?.hasPointerCapture(active.pointer))
        surface.current.releasePointerCapture(active.pointer);
      drag.current = null;
      for (const pointer of contacts.current.keys())
        if (surface.current?.hasPointerCapture(pointer))
          surface.current.releasePointerCapture(pointer);
      contacts.current.clear();
      if (pinching.current) onPinchEnd?.();
      pinching.current = false;
      setDragging(false);
      setSpaceHeld(false);
    };
    const down = (event: KeyboardEvent) => {
      const node = surface.current;
      if (
        !enabled ||
        !node ||
        event.code !== "Space" ||
        event.ctrlKey ||
        event.altKey ||
        event.metaKey
      )
        return;
      const target = event.target;
      if (
        target instanceof HTMLElement &&
        (target.isContentEditable ||
          target.closest('input, textarea, select, button, [role="menu"], [role="dialog"], dialog'))
      )
        return;
      if (!hovered.current && !node.contains(document.activeElement)) return;
      event.preventDefault();
      setSpaceHeld(true);
    };
    const up = (event: KeyboardEvent) => {
      if (event.code === "Space") setSpaceHeld(false);
    };
    window.addEventListener("keydown", down);
    window.addEventListener("keyup", up);
    window.addEventListener("blur", reset);
    if (!enabled) reset();
    return () => {
      window.removeEventListener("keydown", down);
      window.removeEventListener("keyup", up);
      window.removeEventListener("blur", reset);
    };
  }, [enabled, onPinchEnd]);

  const stop = () => {
    drag.current = null;
    setDragging(false);
  };

  const readPinch = (node: HTMLDivElement): PanPinch => {
    const [first, second] = [...contacts.current.values()]
      .slice(0, 2)
      .map((point) => clientToLocal(node, point));
    const a = { x: first.x / coordinateScale.x, y: first.y / coordinateScale.y };
    const b = { x: second.x / coordinateScale.x, y: second.y / coordinateScale.y };
    return {
      center: { x: (a.x + b.x) / 2, y: (a.y + b.y) / 2 },
      distance: Math.hypot(a.x - b.x, a.y - b.y),
    };
  };
  const endTouch = (node: HTMLDivElement, pointer: number) => {
    if (!contacts.current.delete(pointer)) return;
    if (node.hasPointerCapture(pointer)) node.releasePointerCapture(pointer);
    let finishedPan: PanPoint | void = undefined;
    if (pinching.current && contacts.current.size < 2) {
      pinching.current = false;
      finishedPan = onPinchEnd?.();
    }
    const next = contacts.current.entries().next().value;
    if (next) {
      const scale = clientScale(node);
      drag.current = {
        pointer: next[0],
        client: next[1],
        origin: finishedPan ? { ...finishedPan } : { ...pan },
        scale: { x: scale.x * coordinateScale.x, y: scale.y * coordinateScale.y },
      };
    } else stop();
  };

  return (
    <div
      {...props}
      ref={surface}
      {...(enabled &&
      (panButtons?.includes(PRIMARY_PAN_POINTER_BUTTON) ?? !!(handTool || spaceHeld))
        ? stylusPointerInputProps()
        : {})}
      tabIndex={props.tabIndex ?? 0}
      style={{
        touchAction: "none",
        ...style,
        ...(enabled && (handTool || spaceHeld || dragging)
          ? {
              cursor: dragging ? (cursor?.dragging ?? "grabbing") : (cursor?.hand ?? "grab"),
            }
          : {}),
      }}
      onPointerEnter={(event) => {
        hovered.current = true;
        props.onPointerEnter?.(event);
      }}
      onPointerLeave={(event) => {
        hovered.current = false;
        props.onPointerLeave?.(event);
      }}
      onPointerDown={(event) => {
        props.onPointerDown?.(event);
        if (
          !enabled ||
          event.defaultPrevented ||
          !(panButtons
            ? panButtons.includes(event.button)
            : event.button === 1 || (event.button === 0 && (handTool || spaceHeld)))
        )
          return;
        if (onPinchStart && event.pointerType === "touch" && contacts.current.size >= 2) {
          event.preventDefault();
          return;
        }
        event.preventDefault();
        const node = event.currentTarget;
        node.focus({ preventScroll: true });
        node.setPointerCapture(event.pointerId);
        if (onPinchStart && event.pointerType === "touch") {
          contacts.current.set(event.pointerId, clientPoint(event));
          if (contacts.current.size >= 2) {
            if (!pinching.current) {
              pinching.current = true;
              drag.current = null;
              onPinchStart(readPinch(node));
            }
            setDragging(true);
            return;
          }
        }
        const scale = clientScale(node);
        drag.current = {
          pointer: event.pointerId,
          activation: onPinchStart ? new PointerDragActivation(event) : undefined,
          client: clientPoint(event),
          origin: { ...pan },
          scale: {
            x: scale.x * coordinateScale.x,
            y: scale.y * coordinateScale.y,
          },
        };
        setDragging(true);
      }}
      onPointerMove={(event) => {
        props.onPointerMove?.(event);
        if (contacts.current.has(event.pointerId)) {
          contacts.current.set(event.pointerId, clientPoint(event));
          if (pinching.current) {
            onPinch?.(readPinch(event.currentTarget));
            return;
          }
        }
        const active = drag.current;
        if (
          !active ||
          active.pointer !== event.pointerId ||
          (active.activation && !active.activation.update(event))
        )
          return;
        onPan({
          x: active.origin.x + (clientPoint(event).x - active.client.x) / active.scale.x,
          y: active.origin.y + (clientPoint(event).y - active.client.y) / active.scale.y,
        });
      }}
      onPointerUp={(event) => {
        props.onPointerUp?.(event);
        if (onPinchStart && event.pointerType === "touch") {
          endTouch(event.currentTarget, event.pointerId);
          return;
        }
        if (drag.current?.pointer !== event.pointerId) return;
        if (event.currentTarget.hasPointerCapture(event.pointerId))
          event.currentTarget.releasePointerCapture(event.pointerId);
        stop();
      }}
      onPointerCancel={(event) => {
        props.onPointerCancel?.(event);
        if (onPinchStart && event.pointerType === "touch") {
          endTouch(event.currentTarget, event.pointerId);
          return;
        }
        stop();
      }}
      onLostPointerCapture={(event) => {
        props.onLostPointerCapture?.(event);
        if (onPinchStart && event.pointerType === "touch") {
          endTouch(event.currentTarget, event.pointerId);
          return;
        }
        stop();
      }}
      onAuxClick={(event) => {
        props.onAuxClick?.(event);
        if (enabled && event.button === 1) event.preventDefault();
      }}
      onDragStart={(event) => {
        props.onDragStart?.(event);
        if (enabled) event.preventDefault();
      }}
    >
      {children}
    </div>
  );
}
