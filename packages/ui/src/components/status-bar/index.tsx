import type { HTMLAttributes, ReactNode } from "react";

import styles from "$/components/status-bar/status-bar.module.css";

export enum StatusBarPlacement {
  Footer = "footer",
  Header = "header",
  Inline = "inline",
}

export interface StatusBarProps extends HTMLAttributes<HTMLDivElement> {
  leading?: ReactNode;
  trailing?: ReactNode;
  placement?: StatusBarPlacement;
}

/** Passive status information and controls, styled by the containing theme. */
export function StatusBar({
  leading,
  trailing,
  children,
  className,
  placement = StatusBarPlacement.Footer,
  ...props
}: StatusBarProps) {
  return (
    <div
      {...props}
      className={[styles.root, className].filter(Boolean).join(" ")}
      data-slot="status-bar"
      data-placement={placement}
    >
      <div className={styles.leading}>
        {leading}
        {children}
      </div>
      {trailing && <div className={styles.trailing}>{trailing}</div>}
    </div>
  );
}
