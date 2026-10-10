import type { DetailsHTMLAttributes, ReactNode } from "react";

import { cn } from "$/base/utils/cn";

import styles from "$/components/disclosure/disclosure.module.css";

export interface DisclosureProps extends Omit<DetailsHTMLAttributes<HTMLDetailsElement>, "title"> {
  title: ReactNode;
  children: ReactNode;
}

/** Native disclosure keeps keyboard interaction and static-page behavior available. */
export function Disclosure({ title, children, className, ...props }: DisclosureProps) {
  return (
    <details {...props} className={cn(styles.root, className)} data-slot="disclosure">
      <summary className={styles.summary} data-slot="disclosure-summary">
        {title}
      </summary>
      <div className={styles.content} data-slot="disclosure-content">
        {children}
      </div>
    </details>
  );
}
