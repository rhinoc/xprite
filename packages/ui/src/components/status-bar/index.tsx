import type { HTMLAttributes, ReactNode } from "react";

import { borderStyle, type Border } from "$/components/border";

import styles from "$/components/status-bar/status-bar.module.css";

export enum StatusBarBorderEdge {
  Top = "top",
  Bottom = "bottom",
}

export enum StatusBarDensity {
  Compact = "compact",
  Comfortable = "comfortable",
}

export interface StatusBarProps extends HTMLAttributes<HTMLDivElement> {
  leading?: ReactNode;
  trailing?: ReactNode;
  border?: Border<StatusBarBorderEdge>;
  density?: StatusBarDensity;
}

/** Passive status information and controls, styled by the containing theme. */
export function StatusBar({
  leading,
  trailing,
  children,
  className,
  border = true,
  density = StatusBarDensity.Compact,
  ...props
}: StatusBarProps) {
  const borderEdge = borderStyle(border, StatusBarBorderEdge.Top);
  return (
    <div
      {...props}
      className={[styles.root, className].filter(Boolean).join(" ")}
      data-slot="status-bar"
      data-border-edge={borderEdge ?? "none"}
      data-density={density}
    >
      <div className={styles.leading}>
        {leading}
        {children}
      </div>
      {trailing && <div className={styles.trailing}>{trailing}</div>}
    </div>
  );
}
