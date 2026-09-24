import { useEffect, useRef, useState, type CSSProperties, type HTMLAttributes } from "react";

import { clientPoint, clientScale } from "$/base/utils/dom-geometry";
import { stylusPointerInputProps } from "$/base/utils/stylus-input";

const PRIMARY_PAN_POINTER_BUTTON = 0;

export interface PanPoint {
  x: number;
  y: number;
}

export interface PanSurfaceProps extends HTMLAttributes<HTMLDivElement> {
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
  } | null>(null);
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
  }, [enabled]);

  const stop = () => {
    drag.current = null;
    setDragging(false);
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
        event.preventDefault();
        const node = event.currentTarget;
        node.focus({ preventScroll: true });
        node.setPointerCapture(event.pointerId);
        const scale = clientScale(node);
        drag.current = {
          pointer: event.pointerId,
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
        const active = drag.current;
        if (!active || active.pointer !== event.pointerId) return;
        onPan({
          x: active.origin.x + (clientPoint(event).x - active.client.x) / active.scale.x,
          y: active.origin.y + (clientPoint(event).y - active.client.y) / active.scale.y,
        });
      }}
      onPointerUp={(event) => {
        props.onPointerUp?.(event);
        if (drag.current?.pointer !== event.pointerId) return;
        if (event.currentTarget.hasPointerCapture(event.pointerId))
          event.currentTarget.releasePointerCapture(event.pointerId);
        stop();
      }}
      onPointerCancel={(event) => {
        props.onPointerCancel?.(event);
        stop();
      }}
      onLostPointerCapture={(event) => {
        props.onLostPointerCapture?.(event);
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
