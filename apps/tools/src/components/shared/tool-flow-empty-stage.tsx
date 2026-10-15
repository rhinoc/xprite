import { ToolStageFooter } from "$/components/shared/tool-action-bar";
import { useToolTranslation } from "$/managers/locale/tool-language";
import type { PublicTool } from "$/managers/tools/tool-catalog";
import {
  Button,
  ContentLayout,
  ContentPadding,
  ControlFlow,
  FontRole,
  Panel,
  PanelVariant,
  Text,
  TextVariant,
} from "@xprite/ui";

import styles from "$/components/shared/tool-flow.module.css";
import frameStyles from "$/components/shared/tool-frame.module.css";

/** Empty state of a flow tool: the stage window itself is the drop zone. */
export function ToolFlowEmptyStage({
  tool,
  busy,
  onChooseFile,
  onExample,
}: {
  tool: PublicTool;
  busy: boolean;
  onChooseFile(): void;
  onExample(): Promise<void>;
}) {
  const t = useToolTranslation();
  return (
    <div className={`${frameStyles.emptyStage} ${styles.stage}`} data-tool-drop-stage="">
      <Panel
        collapsible={false}
        variant={PanelVariant.Document}
        emphasized
        className={styles.stagePanel}
        title={t(tool.label)}
        contentLayout={ContentLayout.Fill}
        contentPadding={ContentPadding.Compact}
        data-ui-window-priority="primary"
        data-ui-window-active="true"
      >
        <div className={styles.stageBody}>
          <div className={styles.dropZone}>
            <Text variant={TextVariant.Reading} wrap className={styles.dropHint}>
              {t(busy ? "Opening…" : tool.dropLabel)}
            </Text>
            <ControlFlow className={styles.dropActions}>
              <Button
                text={t(tool.openLabel)}
                font={FontRole.Primary}
                disabled={busy}
                onClick={onChooseFile}
              />
              <Button
                text={t("Open example")}
                font={FontRole.Primary}
                disabled={busy}
                onClick={() => void onExample()}
              />
            </ControlFlow>
          </div>
          <ToolStageFooter />
        </div>
      </Panel>
    </div>
  );
}
