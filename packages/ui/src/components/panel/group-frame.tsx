import { useId } from "react";

import { cn } from "$/base/utils/cn";
import { borderStyle as resolveBorderStyle } from "$/components/border";
import type { PanelGroupProps } from "$/components/panel/types";
import { PanelBorderStyle } from "$/components/panel/types";
import { surfaceAttributes, surfaceStyle } from "$/components/surface/content";

import styles from "$/components/panel/group.module.css";

/** Captioned panel frame selected by the active theme. */
export function PanelGroupFrame({
  title,
  extra,
  border = true,
  children,
  className,
  role = "group",
  tone,
  contentLayout,
  contentPadding,
  contentGap,
  contentAlign,
  style,
  ...props
}: PanelGroupProps) {
  const titleId = useId();
  const resolvedBorder = resolveBorderStyle(border, PanelBorderStyle.Single);
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
      data-slot="panel"
      data-group-box-variant={resolvedBorder ?? "none"}
      data-group-box-header={hasTitle || hasExtra || undefined}
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
      <div className={styles.body} data-slot="panel-body" data-ui-surface-content>
        {children}
      </div>
    </section>
  );
}
