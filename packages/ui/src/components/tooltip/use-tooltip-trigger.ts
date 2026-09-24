import { useCallback, useEffect, useId, useRef, useState } from "react";

import { composeEventHandlers } from "$/base/utils/compose-event-handlers";
import { viewportSize, clientPoint, clientRect } from "$/base/utils/dom-geometry";
import {
  DEFAULT_SURFACE_VIEWPORT,
  sceneViewport,
  type SurfaceBounds,
} from "$/components/canvas-surface/geometry";
import {
  autoTooltipPlacement,
  tooltipPosition,
  type TooltipPlacementOption,
} from "$/components/tooltip/geometry";
import { wrapTooltipText } from "$/components/tooltip/text-layout";
import { subscribeTooltipDismissal } from "$/components/tooltip/tooltip-dismissal";
import {
  isTooltipFocusNavigation,
  subscribeTooltipFocusNavigation,
} from "$/components/tooltip/tooltip-focus";
import type {
  PositionedTooltipLayout,
  TooltipGroupState,
  TooltipTriggerProps,
  TooltipTriggerPropsGetter,
} from "$/components/tooltip/types";

interface TooltipTriggerOptions {
  text: string;
  delay?: number;
  maxWidth?: number;
  disabled?: boolean;
  placement?: TooltipPlacementOption;
  targetBounds?: SurfaceBounds;
  targetOffsetX?: number;
  measureText: (text: string) => number;
  group: TooltipGroupState | null;
}

const DEFAULT_TOOLTIP_DELAY = 300;
const DEFAULT_TOOLTIP_MAX_WIDTH = 320;
const TOUCH_TOOLTIP_DELAY = 500;
const TOUCH_MOVE_THRESHOLD = 8;
const TOUCH_FOCUS_SUPPRESSION = 600;
const TOOLTIP_WIDTH_PADDING = 20;
const TOOLTIP_HEIGHT_PADDING = 22;
const TOOLTIP_LINE_HEIGHT = 14;

/** Behavior lives on the interactive element; no wrapper or child-tree lookup is needed. */
export function useTooltipTrigger({
  text,
  delay = DEFAULT_TOOLTIP_DELAY,
  maxWidth = DEFAULT_TOOLTIP_MAX_WIDTH,
  disabled = false,
  placement = "top-right",
  targetOffsetX = 0,
  targetBounds,
  measureText,
  group,
}: TooltipTriggerOptions) {
  const id = useId();
  const anchor = useRef<HTMLElement | null>(null);
  const timer = useRef<ReturnType<typeof setTimeout>>();
  const releaseDismissal = useRef<(() => void) | null>(null);
  const touchContact = useRef<{ pointerId: number; x: number; y: number } | null>(null);
  const lastTouchPointerAt = useRef(0);
  const [layout, setLayout] = useState<PositionedTooltipLayout | null>(null);
  const close = useCallback(() => {
    clearTimeout(timer.current);
    timer.current = undefined;
    anchor.current = null;
    touchContact.current = null;
    releaseDismissal.current?.();
    releaseDismissal.current = null;
    setLayout(null);
  }, []);

  useEffect(() => subscribeTooltipFocusNavigation(window), []);
  useEffect(
    () => () => {
      clearTimeout(timer.current);
      releaseDismissal.current?.();
    },
    [],
  );
  useEffect(close, [
    close,
    delay,
    disabled,
    text,
    maxWidth,
    placement,
    targetOffsetX,
    targetBounds?.x,
    targetBounds?.y,
    targetBounds?.width,
    targetBounds?.height,
  ]);

  const schedule = (target: HTMLElement, wait = delay, ignoreWarmGroup = false) => {
    clearTimeout(timer.current);
    if (disabled || wait < 0 || !text) return;
    anchor.current = target;
    releaseDismissal.current ??= subscribeTooltipDismissal(
      target.ownerDocument.defaultView!,
      close,
    );
    timer.current = setTimeout(
      () => {
        timer.current = undefined;
        const currentTarget = anchor.current;
        if (!currentTarget?.isConnected) {
          close();
          return;
        }
        const scene = currentTarget.closest<HTMLElement>("[data-ui-scene]");
        const sceneRect = scene ? clientRect(scene) : undefined;
        const origin = { x: sceneRect?.left ?? 0, y: sceneRect?.top ?? 0 };
        const viewport = scene ? sceneViewport(scene) : DEFAULT_SURFACE_VIEWPORT;
        const sx = viewport.width / viewport.sceneWidth;
        const sy = viewport.height / viewport.sceneHeight;
        const rect = clientRect(currentTarget);
        const positionedTargetBounds = targetBounds
          ? { ...targetBounds }
          : {
              x: Math.round((rect.left - origin.x) / sx),
              y: Math.round((rect.top - origin.y) / sy),
              width: Math.round(rect.width / sx),
              height: Math.round(rect.height / sy),
            };
        positionedTargetBounds.x += targetOffsetX;
        const available = {
          width: sceneRect ? viewport.sceneWidth : viewportSize(window).width / sx,
          height: sceneRect ? viewport.sceneHeight : viewportSize(window).height / sy,
        };
        const workArea = {
          x: 0,
          y: 0,
          width: Math.floor(available.width),
          height: Math.floor(available.height),
        };
        const lines = wrapTooltipText(
          text,
          Math.max(1, Math.min(maxWidth, workArea.width) - TOOLTIP_WIDTH_PADDING),
          measureText,
        );
        const width = Math.min(
          workArea.width,
          Math.max(...lines.map((line) => measureText(line))) + TOOLTIP_WIDTH_PADDING,
        );
        const height = lines.length * TOOLTIP_LINE_HEIGHT + TOOLTIP_HEIGHT_PADDING;
        const resolvedPlacement =
          placement === "auto"
            ? autoTooltipPlacement(positionedTargetBounds, { width, height }, workArea)
            : placement;
        const positioned = tooltipPosition(
          positionedTargetBounds,
          { width, height },
          workArea,
          resolvedPlacement,
        );
        if (!positioned) {
          close();
          return;
        }
        setLayout({ ...positioned, lines, target: positionedTargetBounds, viewport, origin });
        if (group) group.warm = true;
      },
      !ignoreWarmGroup && group?.warm ? 0 : wait,
    );
  };

  const getTriggerProps: TooltipTriggerPropsGetter = <Props extends object = TooltipTriggerProps>(
    props: Props & TooltipTriggerProps = {} as Props & TooltipTriggerProps,
  ) => ({
    ...props,
    "data-tooltip-trigger": "",
    title: undefined,
    "aria-describedby":
      [
        ...new Set(
          [props?.["aria-describedby"], layout ? id : undefined]
            .flatMap((value) => value?.split(/\s+/) ?? [])
            .filter(Boolean),
        ),
      ].join(" ") || undefined,
    onPointerEnter: composeEventHandlers(props?.onPointerEnter, (event) => {
      if (event.pointerType !== "touch") schedule(event.currentTarget);
    }),
    onPointerLeave: composeEventHandlers(props?.onPointerLeave, close),
    onPointerDown: composeEventHandlers(props?.onPointerDown, (event) => {
      if (event.pointerType !== "touch") {
        lastTouchPointerAt.current = 0;
        close();
        return;
      }
      touchContact.current = {
        pointerId: event.pointerId,
        x: clientPoint(event).x,
        y: clientPoint(event).y,
      };
      lastTouchPointerAt.current = Date.now();
      schedule(event.currentTarget, Math.max(delay, TOUCH_TOOLTIP_DELAY), true);
    }),
    onPointerMove: composeEventHandlers(props?.onPointerMove, (event) => {
      const contact = touchContact.current;
      if (
        contact?.pointerId === event.pointerId &&
        Math.hypot(clientPoint(event).x - contact.x, clientPoint(event).y - contact.y) >=
          TOUCH_MOVE_THRESHOLD
      )
        close();
    }),
    onPointerUp: composeEventHandlers(props?.onPointerUp, (event) => {
      if (touchContact.current?.pointerId === event.pointerId) close();
    }),
    onPointerCancel: composeEventHandlers(props?.onPointerCancel, close),
    onFocus: composeEventHandlers(props?.onFocus, (event) => {
      if (!isTooltipFocusNavigation(event.currentTarget.ownerDocument.defaultView!)) return;
      if (touchContact.current || Date.now() - lastTouchPointerAt.current < TOUCH_FOCUS_SUPPRESSION)
        return;
      schedule(event.currentTarget);
    }),
    onBlur: composeEventHandlers(props?.onBlur, close),
  });

  return { id, layout, getTriggerProps, close };
}
