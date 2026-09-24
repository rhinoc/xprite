import * as React from "react";

import { cn } from "$/base/utils/cn";

import styles from "$/components/panel/panel.module.css";

export interface PanelProps extends Omit<React.HTMLAttributes<HTMLElement>, "title"> {
  title?: React.ReactNode;
  extra?: React.ReactNode;
  children?: React.ReactNode;
}

export function Panel({ title, extra, children, className, ...props }: PanelProps) {
  return (
    <section className={cn(styles.root, className)} data-slot="panel" {...props}>
      {(title || extra) && (
        <div className={styles.header} data-slot="panel-header">
          <span>{title}</span>
          <span className={styles.extra} data-slot="panel-extra">
            {extra}
          </span>
        </div>
      )}
      <div className={styles.body} data-slot="panel-body">
        {children}
      </div>
    </section>
  );
}
