import {
  cloneElement,
  createContext,
  useContext,
  useEffect,
  useRef,
  type HTMLAttributes,
  type ReactElement,
  type ReactNode,
} from "react";
import { createPortal } from "react-dom";

import { composeEventHandlers } from "$/base/utils/compose-event-handlers";
import { surfaceLayout, type SurfaceBounds } from "$/components/canvas-surface/geometry";
import type { TooltipPlacementOption } from "$/components/tooltip/geometry";
import { useTooltipDelay } from "$/components/tooltip/tooltip-provider";
import type {
  PositionedTooltipLayout,
  TooltipGroupState,
  TooltipTriggerProps,
  TooltipTriggerContent,
} from "$/components/tooltip/types";
import { useTooltipTrigger } from "$/components/tooltip/use-tooltip-trigger";

import styles from "$/components/tooltip/tooltip.module.css";

export interface PositionedTooltipProps {
  children: TooltipTriggerContent;
  /** Already localized content. */
  text: string;
  delay?: number;
  maxWidth?: number;
  disabled?: boolean;
  placement?: TooltipPlacementOption;
  /** Optional target rectangle in scene coordinates, or viewport coordinates without a scene. */
  targetBounds?: SurfaceBounds;
  targetOffsetX?: number;
  measureText: (text: string) => number;
  render: (layout: PositionedTooltipLayout) => ReactNode;
}

const TooltipGroupContext = createContext<TooltipGroupState | null>(null);

/** Reuse the existing group container for its shared pointer-leave boundary. */
export function TooltipGroup({
  children,
  retainWarm = false,
}: {
  children: ReactElement;
  retainWarm?: boolean;
}) {
  const state = useRef({ warm: false });
  const child = children as ReactElement<HTMLAttributes<HTMLElement>>;
  return (
    <TooltipGroupContext.Provider value={state.current}>
      {cloneElement(child, {
        onPointerLeave: composeEventHandlers(child.props.onPointerLeave, () => {
          if (!retainWarm) state.current.warm = false;
        }),
      })}
    </TooltipGroupContext.Provider>
  );
}

/** Tooltip behavior is composed onto the child; only visible popup content adds DOM. */
export function PositionedTooltip({ children, render, ...options }: PositionedTooltipProps) {
  const defaultDelay = useTooltipDelay();
  const { id, layout, getTriggerProps, close } = useTooltipTrigger({
    ...options,
    delay: options.delay ?? defaultDelay,
    group: useContext(TooltipGroupContext),
  });
  const displayBounds = layout ? surfaceLayout(layout.bounds, layout.viewport) : null;
  const trigger =
    typeof children === "function"
      ? children(getTriggerProps)
      : cloneElement(
          children as ReactElement<TooltipTriggerProps>,
          getTriggerProps(children.props),
        );
  const triggerBounds = (trigger.props as { bounds?: SurfaceBounds }).bounds;
  useEffect(close, [
    close,
    trigger.key,
    trigger.type,
    triggerBounds?.x,
    triggerBounds?.y,
    triggerBounds?.width,
    triggerBounds?.height,
  ]);
  return (
    <>
      {trigger}
      {layout &&
        displayBounds &&
        createPortal(
          <div
            role="tooltip"
            id={id}
            aria-label={options.text}
            className={styles.surface}
            style={{
              left: layout.origin.x + displayBounds.left,
              top: layout.origin.y + displayBounds.top,
              width: displayBounds.width,
              height: displayBounds.height,
            }}
          >
            {render(layout)}
          </div>,
          document.body,
        )}
    </>
  );
}
