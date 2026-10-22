import * as React from "react";

import { useTheme } from "$/base/theme/theme-context";
import { cn } from "$/base/utils/cn";
import { borderStyle as resolveBorderStyle } from "$/components/border";
import { surfaceAttributes, surfaceStyle } from "$/components/surface/content";

export {
  ContentAlign,
  ContentLayout,
  ContentPadding,
  SurfaceTone,
} from "$/components/surface/content";
import { PanelFrame } from "$/components/panel/frame";
import { PanelGroupFrame } from "$/components/panel/group-frame";
import { PanelNoteSurface } from "$/components/panel/note-surface";
import {
  PanelBorderStyle,
  PanelVariant,
  type PanelProps,
  type PanelWindowProps,
} from "$/components/panel/types";
export { PanelVariant } from "$/components/panel/types";
export type { PanelProps } from "$/components/panel/types";
export { PanelFrame, PanelFrameLayout } from "$/components/panel/frame";
export type { PanelFrameProps, FlowPanelFrameProps } from "$/components/panel/frame";
export { ScenePanelSkin, OverlayContentLayout } from "$/components/panel/scene-frame";
export type { ScenePanelFrameProps } from "$/components/panel/scene-frame";
import { useWindowDisclosure } from "$/components/window-workspace/disclosure";

import "$/components/window-workspace/workspace.module.css";
import styles from "$/components/panel/panel.module.css";

export {
  PanelBorderStyle,
  PanelTitleAlignment,
  PanelDismissBehavior,
  PanelNoteColor,
} from "$/components/panel/types";

function PanelWindow({
  collapsible,
  defaultCollapsed,
  collapsed,
  onCollapsedChange,
  ...frame
}: PanelWindowProps) {
  const disclosure = useWindowDisclosure({ defaultCollapsed, collapsed, onCollapsedChange });
  const canCollapse = collapsible ?? frame.variant !== PanelVariant.Dialog;
  return (
    <PanelFrame
      {...frame}
      as={canCollapse ? "details" : "section"}
      {...(canCollapse ? { open: !disclosure.collapsed, onToggle: disclosure.toggle } : {})}
      headerProps={
        canCollapse
          ? {
              onClick: disclosure.click,
              onDoubleClick: disclosure.doubleClick,
              onKeyDown: disclosure.keyDown,
              onPointerDown: disclosure.pointerDown,
              onPointerUp: disclosure.pointerUp,
              "aria-expanded": !disclosure.collapsed,
            }
          : undefined
      }
    />
  );
}

export function Panel(allProps: PanelProps) {
  const { definition } = useTheme();
  const titleId = React.useId();
  if (allProps.variant === PanelVariant.Note || allProps.variant === PanelVariant.NoteWindow) {
    const { variant, ...props } = allProps;
    return <PanelNoteSurface {...props} windowed={variant === PanelVariant.NoteWindow} />;
  }
  if (
    allProps.variant === PanelVariant.Document ||
    allProps.variant === PanelVariant.Utility ||
    allProps.variant === PanelVariant.Dialog
  )
    return <PanelWindow {...allProps} />;
  const {
    variant: _variant,
    title,
    extra,
    border,
    children,
    className,
    tone,
    contentLayout,
    contentPadding,
    contentGap,
    contentAlign,
    style,
    ...props
  } = allProps;
  const resolvedBorder = resolveBorderStyle(border ?? true, PanelBorderStyle.Single);
  const surface = { tone, contentLayout, contentPadding, contentGap, contentAlign };
  if (definition.controlParts?.panel?.header === "cutout")
    return (
      <PanelGroupFrame
        {...props}
        {...surface}
        title={title}
        extra={extra}
        border={border}
        className={className}
        style={style}
      >
        {children}
      </PanelGroupFrame>
    );
  return (
    <section
      className={cn(styles.root, className)}
      data-slot="panel"
      data-group-box-variant={resolvedBorder ?? "none"}
      {...props}
      role={props.role ?? "group"}
      aria-labelledby={
        props["aria-labelledby"] ?? (props["aria-label"] || !title ? undefined : titleId)
      }
      {...surfaceAttributes(surface)}
      style={surfaceStyle(surface, style)}
    >
      {(title || extra) && (
        <div className={styles.header} data-slot="panel-header">
          <span id={titleId}>{title}</span>
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
