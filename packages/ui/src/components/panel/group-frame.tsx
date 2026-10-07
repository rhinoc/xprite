import { useId } from "react";

import { cn } from "$/base/utils/cn";
import type { PanelGroupProps } from "$/components/panel/types";
import { PanelGroupBorder } from "$/components/panel/types";
import { surfaceAttributes, surfaceStyle } from "$/components/surface/content";

import styles from "$/components/panel/group.module.css";

interface PanelGroupFrameProps extends PanelGroupProps {
  /** Existing containers can retain their body slot and authored content spacing. */
  bodySlot?: string;
  insetContent?: boolean;
  rootSlot?: string;
}

/** Shared frame rendering for group boxes and theme-selected panel frames. */
export function PanelGroupFrame({
  title,
  extra,
  groupBorder = PanelGroupBorder.Single,
  children,
  bodySlot = "group-box-body",
  rootSlot = "group-box",
  insetContent = true,
  className,
  role = "group",
  tone,
  contentLayout,
  contentPadding,
  contentGap,
  contentAlign,
  style,
  ...props
}: PanelGroupFrameProps) {
  const titleId = useId();
  const hasTitle = title !== undefined && title !== null && title !== false && title !== "";
  const hasExtra = extra !== undefined && extra !== null && extra !== false;
  return (
    <section
      {...props}
      {...surfaceAttributes({ tone, contentLayout, contentPadding, contentAlign })}
      style={surfaceStyle({ contentPadding, contentGap }, style)}
      role={role}
      aria-labelledby={
        props["aria-labelledby"] ?? (props["aria-label"] || !hasTitle ? undefined : titleId)
      }
      className={cn(styles.root, className)}
      data-slot={rootSlot}
      data-group-box-variant={groupBorder}
      data-group-box-header={hasTitle || hasExtra || undefined}
      data-group-box-inset={insetContent || undefined}
    >
      {(hasTitle || hasExtra) && (
        <div className={styles.header} data-slot="group-box-header">
          {hasTitle && (
            <span
              id={titleId}
              className={styles.title}
              data-plain-title={typeof title === "string" || typeof title === "number" || undefined}
              data-slot="group-box-title"
            >
              {title}
            </span>
          )}
          {hasExtra && (
            <span className={styles.extra} data-slot="group-box-extra">
              {extra}
            </span>
          )}
        </div>
      )}
      <div className={styles.body} data-slot={bodySlot} data-ui-surface-content>
        {children}
      </div>
    </section>
  );
}
