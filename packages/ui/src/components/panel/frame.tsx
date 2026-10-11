import * as React from "react";

import type { FontRole } from "$/base/theme/theme-types";
import { cn } from "$/base/utils/cn";
import { ScenePanelFrame, type ScenePanelFrameProps } from "$/components/panel/scene-frame";
import {
  PanelVariant,
  type PanelTitleAlignment,
  type PanelWindowProps,
} from "$/components/panel/types";
import { ScrollArea } from "$/components/scrollbar";
import { surfaceAttributes, surfaceStyle } from "$/components/surface/content";
import type { WindowDisclosureProps } from "$/components/window-workspace/disclosure";

import windowStyles from "$/components/panel/window.module.css";

export enum PanelFrameLayout {
  Flow = "flow",
  Scene = "scene",
}

export interface FlowPanelFrameProps extends Omit<PanelWindowProps, keyof WindowDisclosureProps> {
  layout?: PanelFrameLayout.Flow;
  as?: "section" | "details";
  open?: boolean;
  headerProps?: React.HTMLAttributes<HTMLElement>;
  titleAlign?: PanelTitleAlignment;
  titleFont?: FontRole;
}

export type PanelFrameProps =
  | FlowPanelFrameProps
  | (ScenePanelFrameProps & { layout: PanelFrameLayout.Scene });

/** Window presentation only. Hosts supply placement, semantics and interaction handlers. */
export function PanelFrame(props: PanelFrameProps) {
  if (props.layout === PanelFrameLayout.Scene) {
    const { layout: _layout, ...frame } = props;
    return <ScenePanelFrame {...frame} />;
  }
  const { layout: _layout, ...frame } = props;
  return <FlowPanelFrame {...frame} />;
}

function FlowPanelFrame({
  variant,
  title,
  titleAlign,
  titleFont,
  extra,
  footer,
  children,
  className,
  emphasized = false,
  scrollable = false,
  tone,
  contentLayout,
  contentPadding,
  contentGap,
  contentAlign,
  style,
  as: WindowRoot = "section",
  headerProps,
  ...props
}: FlowPanelFrameProps) {
  const WindowHeader = WindowRoot === "details" ? "summary" : "div";
  const surface = { tone, contentLayout, contentPadding, contentGap, contentAlign };
  return (
    <WindowRoot
      aria-label={typeof title === "string" ? title : undefined}
      {...props}
      {...surfaceAttributes(surface)}
      style={surfaceStyle(surface, style)}
      className={cn(windowStyles.window, className)}
      data-slot="panel"
      data-ui-panel-variant="window"
      data-ui-panel-emphasized={emphasized || undefined}
      data-ui-window-kind={variant}
      data-ui-panel-title-align={variant === PanelVariant.Dialog ? titleAlign : undefined}
      data-ui-panel-title-font={variant === PanelVariant.Dialog ? titleFont : undefined}
      data-ui-desktop-window
    >
      <WindowHeader className={windowStyles.header} data-slot="panel-header" {...headerProps}>
        <span className={windowStyles.title} data-slot="panel-title">
          {title}
        </span>
        {extra && (
          <span className={windowStyles.extra} data-slot="panel-extra">
            {extra}
          </span>
        )}
      </WindowHeader>
      <div
        className={cn(windowStyles.body, scrollable && windowStyles.scrollableBody)}
        data-slot="panel-body"
        data-ui-surface-content={scrollable ? undefined : true}
      >
        {scrollable ? (
          <ScrollArea
            className={windowStyles.scrollRegion}
            scrollX={false}
            aria-label={props["aria-label"] ?? (typeof title === "string" ? title : undefined)}
            viewportProps={{ tabIndex: 0, "data-ui-scroll-region-focus": "true" }}
          >
            <div
              {...surfaceAttributes(surface)}
              style={surfaceStyle(surface)}
              className={windowStyles.scrollSurface}
            >
              <div data-ui-surface-content>{children}</div>
            </div>
          </ScrollArea>
        ) : (
          children
        )}
      </div>
      {footer && <div data-slot="panel-footer">{footer}</div>}
    </WindowRoot>
  );
}
