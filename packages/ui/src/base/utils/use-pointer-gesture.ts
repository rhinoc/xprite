import { useCallback, useEffect, useRef, type PointerEvent } from "react";

export interface PointerGestureCallbacks<T> {
  onMove(event: PointerEvent<HTMLElement>, value: T): void;
  onCommit?(event: PointerEvent<HTMLElement>, value: T): void;
  onCancel?(value: T): void;
}

/** Capture and cancellation lifecycle; the owning control defines values and commit policy. */
export function usePointerGesture<T>(callbacks: PointerGestureCallbacks<T>) {
  const handlers = useRef(callbacks);
  handlers.current = callbacks;
  const active = useRef<{
    pointerId: number;
    element: HTMLElement;
    value: T;
    dispose(): void;
  } | null>(null);
  const cancel = useCallback((event?: { pointerId: number }) => {
    const gesture = active.current;
    if (!gesture || (event && event.pointerId !== gesture.pointerId)) return;
    active.current = null;
    try {
      handlers.current.onCancel?.(gesture.value);
    } finally {
      gesture.dispose();
    }
  }, []);
  useEffect(() => () => cancel(), [cancel]);
  const start = useCallback(
    (event: PointerEvent<HTMLElement>, createValue: () => T) => {
      if (active.current) return false;
      const element = event.currentTarget;
      const host = element.ownerDocument.defaultView;
      const blur = () => cancel();
      element.setPointerCapture(event.pointerId);
      let value: T;
      try {
        value = createValue();
      } catch (error) {
        if (element.hasPointerCapture(event.pointerId))
          element.releasePointerCapture(event.pointerId);
        throw error;
      }
      host?.addEventListener("blur", blur);
      active.current = {
        pointerId: event.pointerId,
        element,
        value,
        dispose() {
          host?.removeEventListener("blur", blur);
          if (element.hasPointerCapture(event.pointerId))
            element.releasePointerCapture(event.pointerId);
        },
      };
      return true;
    },
    [cancel],
  );
  const move = useCallback((event: PointerEvent<HTMLElement>) => {
    const gesture = active.current;
    if (gesture?.pointerId === event.pointerId) handlers.current.onMove(event, gesture.value);
  }, []);
  const finish = useCallback((event: PointerEvent<HTMLElement>) => {
    const gesture = active.current;
    if (!gesture || gesture.pointerId !== event.pointerId) return;
    active.current = null;
    try {
      handlers.current.onCommit?.(event, gesture.value);
    } finally {
      gesture.dispose();
    }
  }, []);
  return { active, start, move, finish, cancel };
}
