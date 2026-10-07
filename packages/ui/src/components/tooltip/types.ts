import type { HTMLAttributes, ReactElement } from "react";

import type { SurfaceBounds, SurfaceViewport } from "$/components/canvas-surface/geometry";
import type { TooltipPlacement } from "$/components/tooltip/geometry";

export interface PositionedTooltipLayout {
  bounds: SurfaceBounds;
  lines: readonly string[];
  viewport: SurfaceViewport;
  origin: { x: number; y: number };
  placement: TooltipPlacement;
  target: SurfaceBounds;
}

export interface TooltipTextMetrics {
  inset: number;
  lineHeight: number;
  widthPadding: number;
  heightPadding: number;
  pointerSize?: number;
  pointerInsets?: Readonly<
    Record<string, { left: number; top: number; right: number; bottom: number }>
  >;
}

export type TooltipTriggerProps = Pick<
  HTMLAttributes<HTMLElement>,
  | "title"
  | "aria-describedby"
  | "onPointerEnter"
  | "onPointerLeave"
  | "onPointerDown"
  | "onPointerMove"
  | "onPointerUp"
  | "onPointerCancel"
  | "onFocus"
  | "onBlur"
> & { "data-tooltip-trigger"?: string };

/** Pass existing handlers through this getter so tooltip behavior is composed with them. */
export type TooltipTriggerPropsGetter = <Props extends object = TooltipTriggerProps>(
  props?: Props & TooltipTriggerProps,
) => Omit<Props, keyof TooltipTriggerProps> & TooltipTriggerProps;

/** Custom triggers must forward event and ARIA props to their interactive element. */
export type TooltipTriggerContent =
  | ReactElement
  | ((getTriggerProps: TooltipTriggerPropsGetter) => ReactElement);

export interface TooltipGroupState {
  warm: boolean;
}
