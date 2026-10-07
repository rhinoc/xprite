import * as React from "react";

import { useTheme } from "$/base/theme/theme-context";
import { cn } from "$/base/utils/cn";
import {
  surfaceAttributes,
  surfaceStyle,
  type SurfaceContentProps,
} from "$/components/surface/content";

export {
  ContentAlign,
  ContentLayout,
  ContentPadding,
  SurfaceTone,
} from "$/components/surface/content";
import { PanelGroupFrame } from "$/components/panel/group-frame";
import {
  useWindowDisclosure,
  type WindowDisclosureProps,
} from "$/components/window-workspace/disclosure";

import "$/components/window-workspace/workspace.module.css";
import styles from "$/components/panel/panel.module.css";
import windowStyles from "$/components/panel/window.module.css";

export enum PanelVariant {
  Standard = "standard",
  Window = "window",
  Group = "group",
}

export { PanelGroupBorder } from "$/components/panel/types";
import type { PanelGroupBorder } from "$/components/panel/types";

export enum PanelWindowKind {
  Document = "document",
  Utility = "utility",
  Dialog = "dialog",
  Note = "note",
  About = "about",
}

export enum PanelWindowChrome {
  Standard = "standard",
  Emphasized = "emphasized",
}

export interface PanelProps
  extends
    Omit<React.HTMLAttributes<HTMLElement>, "title">,
    SurfaceContentProps,
    WindowDisclosureProps {
  title?: React.ReactNode;
  groupBorder?: PanelGroupBorder;
  variant?: PanelVariant;
  windowChrome?: PanelWindowChrome;
  /** The chrome of a Window panel, chosen for its purpose. */
  windowKind?: PanelWindowKind;
  extra?: React.ReactNode;
  /** Status content along the bottom edge of the Window variant. */
  footer?: React.ReactNode;
  children?: React.ReactNode;
}

export function Panel({
  title,
  extra,
  footer,
  children,
  className,
  variant = PanelVariant.Standard,
  windowChrome,
  groupBorder,
  tone,
  contentLayout,
  contentPadding,
  contentGap,
  contentAlign,
  style,
  windowKind = PanelWindowKind.Document,
  collapsible = windowKind === PanelWindowKind.Document || windowKind === PanelWindowKind.Utility,
  defaultCollapsed,
  collapsed,
  onCollapsedChange,
  ...props
}: PanelProps) {
  const { definition } = useTheme();
  const disclosure = useWindowDisclosure({ defaultCollapsed, collapsed, onCollapsedChange });
  const WindowRoot = collapsible ? "details" : "section";
  const WindowHeader = collapsible ? "summary" : "div";
  const surface = { tone, contentLayout, contentPadding, contentGap, contentAlign };
  const attributes = surfaceAttributes(surface);
  const mergedStyle = surfaceStyle(surface, style);
  if (variant === PanelVariant.Window)
    return (
      <WindowRoot
        aria-label={typeof title === "string" ? title : undefined}
        {...props}
        {...attributes}
        style={mergedStyle}
        className={cn(windowStyles.window, className)}
        data-slot="panel"
        data-ui-panel-variant="window"
        data-ui-panel-window-chrome={windowChrome}
        data-ui-window-kind={windowKind}
        data-ui-desktop-window
        {...(collapsible ? { open: !disclosure.collapsed, onToggle: disclosure.toggle } : {})}
      >
        <WindowHeader
          className={windowStyles.header}
          data-slot="panel-header"
          onClick={collapsible ? disclosure.click : undefined}
          onDoubleClick={collapsible ? disclosure.doubleClick : undefined}
          onKeyDown={collapsible ? disclosure.keyDown : undefined}
        >
          <span className={windowStyles.title} data-slot="panel-title">
            {title}
          </span>
          {extra && (
            <span className={windowStyles.extra} data-slot="panel-extra">
              {extra}
            </span>
          )}
        </WindowHeader>
        <div className={windowStyles.body} data-slot="panel-body" data-ui-surface-content>
          {children}
        </div>
        {footer && <div data-slot="panel-footer">{footer}</div>}
      </WindowRoot>
    );
  const cutout = definition.controlParts?.panel?.header === "cutout";
  if (cutout || variant === PanelVariant.Group)
    return (
      <PanelGroupFrame
        {...props}
        {...surface}
        style={style}
        title={title}
        extra={extra}
        className={className}
        rootSlot={variant === PanelVariant.Group ? "group-box" : "panel"}
        bodySlot={variant === PanelVariant.Group ? "group-box-body" : "panel-body"}
        groupBorder={groupBorder}
        insetContent={variant === PanelVariant.Group}
      >
        {children}
      </PanelGroupFrame>
    );
  return (
    <section
      className={cn(styles.root, className)}
      data-slot="panel"
      {...props}
      {...attributes}
      style={mergedStyle}
    >
      {(title || extra) && (
        <div className={styles.header} data-slot="panel-header">
          <span>{title}</span>
          <span className={styles.extra} data-slot="panel-extra">
            {extra}
          </span>
        </div>
      )}
      <div className={styles.body} data-slot="panel-body" data-ui-surface-content>
        {children}
      </div>
    </section>
  );
}
