import { tUi, useUiLanguage } from "$/i18n";
import { Panel, Text, TextVariant } from "@xprite/ui";

import styles from "$/components/minitool/startup/startup.module.css";

interface MiniToolStartupProps {
  message?: string;
}

/** This screen is imported only by the embedded minitool entry point. */
export function MiniToolStartup({ message }: MiniToolStartupProps) {
  useUiLanguage();
  const failed = message !== undefined;
  return (
    <div className={styles.screen} role={failed ? "alert" : "status"} aria-live="polite">
      <Panel
        className={styles.panel}
        title={
          <Text variant={TextVariant.Inline} scale={2} color="light">
            {tUi(failed ? "ui.minitool.startup.failed" : "ui.minitool.startup.opening")}
          </Text>
        }
      >
        {message && (
          <Text variant={TextVariant.Inline} scale={2} color="light" wrap>
            {message}
          </Text>
        )}
      </Panel>
    </div>
  );
}
