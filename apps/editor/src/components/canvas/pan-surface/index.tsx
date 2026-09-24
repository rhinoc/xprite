import { useCallback } from "react";

import {
  useWheelInput,
  EditorWheelSurface,
  type EditorWheelDecision,
} from "$/managers/input/use-wheel-input";
import { PanSurface, type PanPoint, type PanSurfaceProps } from "@xprite/ui";
import { borderSize, clientPoint, clientDeltaToLocal, clientToLocal } from "@xprite/ui/utils";

export type EditorPanPoint = PanPoint;

export interface EditorPanSurfaceProps extends Omit<PanSurfaceProps, "cursor" | "onWheelEvent"> {
  onWheelAction?: (
    decision: EditorWheelDecision,
    delta: EditorPanPoint,
    anchor: EditorPanPoint,
  ) => void;
}

/** Editor adapter that maps browser wheel policy into the shared pan surface. */
export function EditorPanSurface({ onWheelAction, ...props }: EditorPanSurfaceProps) {
  const { resolve, projectDelta } = useWheelInput();
  const onWheelEvent = useCallback(
    (event: WheelEvent, node: HTMLDivElement, coordinateScale: EditorPanPoint) => {
      if (event.defaultPrevented || !onWheelAction || (!event.deltaX && !event.deltaY)) return;
      event.preventDefault();
      const decision = resolve(event, EditorWheelSurface.Canvas);
      const { action } = decision;
      if (action === null) return;
      const movement = clientDeltaToLocal(node, { x: event.deltaX, y: event.deltaY });
      const size = borderSize(node);
      const delta = projectDelta(
        decision,
        { x: movement.x / coordinateScale.x, y: movement.y / coordinateScale.y },
        { width: size.width / coordinateScale.x, height: size.height / coordinateScale.y },
      );
      const point = clientToLocal(node, clientPoint(event));
      onWheelAction(decision, delta, {
        x: point.x / coordinateScale.x,
        y: point.y / coordinateScale.y,
      });
    },
    [resolve, projectDelta, onWheelAction],
  );

  return (
    <PanSurface
      {...props}
      onWheelEvent={onWheelAction ? onWheelEvent : undefined}
      cursor={{
        hand: "var(--ui-cursor-hand, grab)",
        dragging: "var(--ui-cursor-scroll, grabbing)",
      }}
    />
  );
}
