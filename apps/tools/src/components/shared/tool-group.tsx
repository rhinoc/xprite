import type { ReactNode } from "react";

import { ContentLayout, ContentPadding, Field, FieldLayout, Panel } from "@xprite/ui";

import styles from "$/components/shared/tool-flow.module.css";

const GROUP_GAP = 4;

/**
 * A group box of related controls in the adjust panel. Fields inside flow side by side and wrap
 * (`ToolField`), so the panel stays short and the result stays large.
 */
export function ToolGroup({ children, title }: { children: ReactNode; title: string }) {
  return (
    <Panel
      contentLayout={ContentLayout.Column}
      contentPadding={ContentPadding.Compact}
      contentGap={GROUP_GAP}
      className={styles.group}
      title={title}
    >
      <div className={styles.fieldRow}>{children}</div>
    </Panel>
  );
}

/** One labelled control in a group row: the label sits left of the control. */
export function ToolField({ label, children }: { label: string; children: ReactNode }) {
  return (
    <Field label={label} layout={FieldLayout.Inline} className={styles.inlineField}>
      {children}
    </Field>
  );
}
