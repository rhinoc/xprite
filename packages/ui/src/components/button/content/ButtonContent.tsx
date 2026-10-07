import type { ReactNode } from "react";

import type { ButtonSlots } from "$/components/button/types";

import styles from "$/components/button/content/content.module.css";

/** Content belongs to slots; the standard button owns its skin and interaction. */
export function ButtonContent({ children, slots }: { children: ReactNode; slots?: ButtonSlots }) {
  return (
    <>
      {slots?.leading != null && <span className={styles.leading}>{slots.leading}</span>}
      <span className={styles.content} data-slot="button-content">
        {slots?.content ?? children}
      </span>
      {slots?.trailing != null && <span className={styles.trailing}>{slots.trailing}</span>}
    </>
  );
}
