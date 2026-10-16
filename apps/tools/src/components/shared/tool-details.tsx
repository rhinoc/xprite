import { Text, TextTone, TextVariant } from "@xprite/ui";

import styles from "$/components/shared/tool-flow.module.css";

/** Result facts for a details tab: label on the left, value on the right. */
export function ToolDetails({
  rows,
}: {
  rows: readonly (readonly [label: string, value: string])[];
}) {
  return (
    <dl className={styles.details}>
      {rows.map(([label, value]) => (
        <div key={label} className={styles.detailRow}>
          <dt>
            <Text variant={TextVariant.Reading} tone={TextTone.Muted}>
              {label}
            </Text>
          </dt>
          <dd>
            <Text variant={TextVariant.Reading}>{value}</Text>
          </dd>
        </div>
      ))}
    </dl>
  );
}
