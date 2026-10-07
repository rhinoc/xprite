import { useEffect, useRef, useState } from "react";
import type { PointerEvent } from "react";

import type { ShowcaseManager } from "$/managers/showcase/showcase-manager";
import {
  clientPoint,
  clientToLocal,
  layoutSize,
  PointerDragActivation,
  PointerDragAxis,
} from "@xprite/ui/utils";

const SWIPE_DISTANCE = 24;
const SWIPE_WIDTH_FRACTION = 0.05;
const FLICK_DISTANCE = 8;
const FLICK_VELOCITY = 0.2;
const VELOCITY_WINDOW_MS = 120;
const FLICK_RELEASE_GRACE_MS = 160;
const MAX_PREVIEW = 0.95;
const PRIMARY_BUTTON = 0;
const MOUSE_POINTER_TYPE = "mouse";

interface DragSample {
  x: number;
  time: number;
}

/** Horizontal swipes leave vertical page scrolling and pinch zoom to the browser. */
export function useDeviceSwipe(manager: ShowcaseManager) {
  const [dragging, setDragging] = useState(false);
  const gesture = useRef<{
    id: number;
    pointerType: string;
    origin: { x: number; y: number };
    activation: PointerDragActivation;
    horizontal: boolean;
    distance: number;
    width: number;
    samples: DragSample[];
  }>();

  useEffect(() => () => manager.finishDrag(0), [manager]);

  const sample = (event: PointerEvent<HTMLElement>) => {
    const current = gesture.current;
    if (!current || current.id !== event.pointerId) return;
    const point = clientToLocal(event.currentTarget, clientPoint(event));
    current.distance = point.x - current.origin.x;
    const last = current.samples[current.samples.length - 1];
    // A stationary pointerup should not erase the speed of the preceding flick.
    if (point.x !== last.x) {
      current.samples.push({ x: point.x, time: event.timeStamp });
      while (
        current.samples.length > 2 &&
        current.samples[0].time < event.timeStamp - VELOCITY_WINDOW_MS
      )
        current.samples.shift();
    }
    manager.previewDrag(
      Math.max(-MAX_PREVIEW, Math.min(MAX_PREVIEW, current.distance / current.width)),
    );
  };

  const finish = (event: PointerEvent<HTMLElement>, commit: boolean) => {
    const current = gesture.current;
    if (!current || current.id !== event.pointerId) return;
    if (commit && current.horizontal) sample(event);
    gesture.current = undefined;
    setDragging(false);
    let direction = 0;
    if (commit && current.horizontal) {
      const first = current.samples[0];
      const last = current.samples[current.samples.length - 1];
      const velocity =
        event.timeStamp - last.time <= FLICK_RELEASE_GRACE_MS
          ? (last.x - first.x) / Math.max(1, last.time - first.time)
          : 0;
      const threshold = Math.min(SWIPE_DISTANCE, current.width * SWIPE_WIDTH_FRACTION);
      // Mouse intent was already accepted by PointerDragActivation. Do not
      // reject that drag again just because it was short or paused before release.
      const farEnough =
        current.pointerType === MOUSE_POINTER_TYPE
          ? current.distance !== 0
          : Math.abs(current.distance) >= threshold;
      const flick =
        Math.abs(current.distance) >= FLICK_DISTANCE && Math.abs(velocity) >= FLICK_VELOCITY;
      if (farEnough || flick) direction = (farEnough ? current.distance : velocity) < 0 ? 1 : -1;
    }
    // Commit before releasing capture; lostpointercapture must not cancel this snap.
    manager.finishDrag(direction);
    if (event.currentTarget.hasPointerCapture(event.pointerId))
      event.currentTarget.releasePointerCapture(event.pointerId);
  };

  return {
    dragging,
    onPointerDown: (event: PointerEvent<HTMLElement>) => {
      if (!manager.getSnapshot().started) return;
      if (!event.isPrimary || event.button !== PRIMARY_BUTTON || gesture.current) return;
      const origin = clientToLocal(event.currentTarget, clientPoint(event));
      gesture.current = {
        id: event.pointerId,
        pointerType: event.pointerType,
        origin,
        activation: new PointerDragActivation(event, PointerDragAxis.Horizontal),
        horizontal: false,
        distance: 0,
        width: Math.max(1, layoutSize(event.currentTarget).width),
        samples: [{ x: origin.x, time: event.timeStamp }],
      };
      event.currentTarget.setPointerCapture(event.pointerId);
    },
    onPointerMove: (event: PointerEvent<HTMLElement>) => {
      const current = gesture.current;
      if (!current || current.id !== event.pointerId) return;
      if (!current.horizontal) {
        if (!current.activation.update(event)) return;
        const point = clientToLocal(event.currentTarget, clientPoint(event));
        // Wait for a clear horizontal intent instead of rejecting the whole
        // gesture on its first diagonal sample. Native pan-y still owns scrolling.
        if (Math.abs(point.y - current.origin.y) > Math.abs(point.x - current.origin.x)) return;
        current.horizontal = true;
        manager.beginDrag();
        setDragging(true);
      }
      sample(event);
    },
    onPointerUp: (event: PointerEvent<HTMLElement>) => finish(event, true),
    onPointerCancel: (event: PointerEvent<HTMLElement>) => finish(event, false),
    onLostPointerCapture: (event: PointerEvent<HTMLElement>) => finish(event, false),
  };
}
