import {
  useCallback,
  useEffect,
  useRef,
  type RefObject,
  type PointerEvent as ReactPointerEvent,
} from "react";

import { clientPoint, clientDeltaToLocal, layoutSize } from "$/base/utils/dom-geometry";
import { PointerDragActivation, PointerDragAxis } from "$/base/utils/pointer-drag-activation";
import type { SurfaceBounds } from "$/components/canvas-surface";

export enum WindowGestureEdge {
  Move = "move",
  North = "n",
  South = "s",
  East = "e",
  West = "w",
  NorthEast = "ne",
  NorthWest = "nw",
  SouthEast = "se",
  SouthWest = "sw",
}
type Gesture = {
  pointer: number;
  activation: PointerDragActivation;
  edge: WindowGestureEdge;
  x: number;
  y: number;
  bounds: SurfaceBounds;
  scaleX: number;
  scaleY: number;
  root: HTMLElement;
  node: HTMLElement;
};

export interface WindowGestureOptions {
  open: boolean;
  root: RefObject<HTMLElement | null>;
  bounds: SurfaceBounds;
  available: SurfaceBounds;
  contentWidth: number;
  contentHeight: number;
  minimumWidth: number;
  minimumHeight: number;
  minSize: { width: number; height: number };
  border: number;
  titlebar: number;
  constrainToViewport: boolean;
  viewportEdgeInset?: number;
  autoFocus: boolean;
  onBoundsChange(bounds: SurfaceBounds): void;
}

/** Window geometry gestures without titlebar artwork or dismissal behavior. */
export function useWindowGesture({
  open,
  root,
  bounds,
  available,
  contentWidth,
  contentHeight,
  minimumWidth: MINIMUM_WIDTH,
  minimumHeight: MINIMUM_HEIGHT,
  minSize,
  border: WINDOW_BORDER,
  titlebar: WINDOW_TITLEBAR,
  constrainToViewport,
  viewportEdgeInset = 0,
  autoFocus,
  onBoundsChange: publish,
}: WindowGestureOptions) {
  const gesture = useRef<Gesture | null>(null);
  const edgeInset = constrainToViewport ? viewportEdgeInset : 0;
  const availableWidth = available.width;
  const availableHeight = available.height;
  const usableWidth = Math.max(0, availableWidth - edgeInset * 2);
  const usableHeight = Math.max(0, availableHeight - edgeInset * 2);
  const availableRight = available.x + availableWidth;
  const availableBottom = available.y + availableHeight;
  const stop = useCallback(() => {
    const active = gesture.current;
    gesture.current = null;
    if (active?.node.hasPointerCapture(active.pointer))
      active.node.releasePointerCapture(active.pointer);
  }, []);

  useEffect(() => {
    window.addEventListener("blur", stop);
    if (!open) stop();
    return () => {
      window.removeEventListener("blur", stop);
      stop();
    };
  }, [open, stop]);

  useEffect(() => {
    stop();
  }, [available.x, available.y, availableWidth, availableHeight, stop]);

  const start = (event: ReactPointerEvent<HTMLElement>, edge: WindowGestureEdge) => {
    if (event.button !== 0) return;
    event.preventDefault();
    event.stopPropagation();
    stop();
    if (autoFocus) root.current?.focus({ preventScroll: true });
    const coordinateRoot = root.current;
    if (!coordinateRoot) return;
    const size = layoutSize(coordinateRoot);
    if (!size.width || !size.height) return;
    gesture.current = {
      pointer: event.pointerId,
      activation: new PointerDragActivation(
        event,
        edge === WindowGestureEdge.East || edge === WindowGestureEdge.West
          ? PointerDragAxis.Horizontal
          : edge === WindowGestureEdge.North || edge === WindowGestureEdge.South
            ? PointerDragAxis.Vertical
            : PointerDragAxis.Both,
      ),
      edge,
      x: clientPoint(event).x,
      y: clientPoint(event).y,
      bounds: { ...bounds },
      scaleX: bounds.width / size.width,
      scaleY: bounds.height / size.height,
      root: coordinateRoot,
      node: event.currentTarget,
    };
    event.currentTarget.setPointerCapture(event.pointerId);
  };

  const move = (event: ReactPointerEvent<HTMLElement>) => {
    const active = gesture.current;
    if (!active || active.pointer !== event.pointerId) return;
    if (!active.activation.update(event)) return;
    const delta = clientDeltaToLocal(active.root, {
      x: clientPoint(event).x - active.x,
      y: clientPoint(event).y - active.y,
    });
    const dx = Math.round(delta.x * active.scaleX);
    const dy = Math.round(delta.y * active.scaleY);
    const b = active.bounds;
    if (active.edge === WindowGestureEdge.Move) {
      publish({
        ...b,
        width: contentWidth,
        height: contentHeight,
        x: Math.max(
          available.x + (constrainToViewport ? edgeInset : WINDOW_BORDER - b.width),
          Math.min(
            availableRight - (constrainToViewport ? b.width + edgeInset : WINDOW_BORDER),
            b.x + dx,
          ),
        ),
        y: Math.max(
          available.y + edgeInset,
          Math.min(
            availableBottom - (constrainToViewport ? b.height + edgeInset : WINDOW_TITLEBAR),
            b.y + dy,
          ),
        ),
      });
      return;
    }
    const minimumWidth = Math.min(
      constrainToViewport ? usableWidth : Infinity,
      Math.max(MINIMUM_WIDTH, minSize.width),
    );
    const minimumHeight = Math.min(
      constrainToViewport ? usableHeight : Infinity,
      Math.max(MINIMUM_HEIGHT, minSize.height),
    );
    let left = b.x;
    let top = b.y;
    let right = b.x + b.width;
    let bottom = b.y + b.height;
    if (
      active.edge === WindowGestureEdge.West ||
      active.edge === WindowGestureEdge.NorthWest ||
      active.edge === WindowGestureEdge.SouthWest
    )
      left = Math.max(
        constrainToViewport ? available.x + edgeInset : -Infinity,
        Math.min(right - minimumWidth, left + dx),
      );
    if (
      active.edge === WindowGestureEdge.East ||
      active.edge === WindowGestureEdge.NorthEast ||
      active.edge === WindowGestureEdge.SouthEast
    )
      right = Math.min(
        constrainToViewport ? availableRight - edgeInset : Infinity,
        Math.max(left + minimumWidth, right + dx),
      );
    if (
      active.edge === WindowGestureEdge.North ||
      active.edge === WindowGestureEdge.NorthWest ||
      active.edge === WindowGestureEdge.NorthEast
    )
      top = Math.max(
        constrainToViewport ? available.y + edgeInset : -Infinity,
        Math.min(bottom - minimumHeight, top + dy),
      );
    if (
      active.edge === WindowGestureEdge.South ||
      active.edge === WindowGestureEdge.SouthWest ||
      active.edge === WindowGestureEdge.SouthEast
    )
      bottom = Math.min(
        constrainToViewport ? availableBottom - edgeInset : Infinity,
        Math.max(top + minimumHeight, bottom + dy),
      );
    publish({ x: left, y: top, width: right - left, height: bottom - top });
  };

  return {
    start,
    stop,
    rootProps: {
      onPointerMove: move,
      onPointerUp: (event: ReactPointerEvent<HTMLElement>) => {
        if (gesture.current?.pointer === event.pointerId) {
          move(event);
          stop();
        }
      },
      onPointerCancel: stop,
      onLostPointerCapture: stop,
    },
  };
}
