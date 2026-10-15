import type { ReactNode } from "react";

import { useToolWindowShade } from "$/components/shared/window-shade";
import { useToolTranslation } from "$/managers/locale/tool-language";
import {
  ContentLayout,
  ContentPadding,
  Panel,
  PanelVariant,
  SurfaceTone,
  Text,
  TextVariant,
} from "@xprite/ui";

import styles from "$/components/shared/tool-flow.module.css";

const ADJUST_GAP = 8;

/**
 * The shared adjust slot: a floating palette on desktop and a bottom drawer on phones. It is a
 * normal tool window, so the existing WindowShade rolls it up. `ready=false` shows the quiet
 * placeholder until the tool has a result.
 */
export function ToolAdjustSlot({
  ready,
  drawerOpen,
  children,
}: {
  ready: boolean;
  drawerOpen: boolean;
  children?: ReactNode;
}) {
  const shade = useToolWindowShade("adjust");
  const t = useToolTranslation();
  return (
    <div
      className={styles.adjust}
      data-tool-adjust=""
      data-drawer={drawerOpen && ready ? "open" : "closed"}
    >
      <Panel
        {...shade}
        variant={PanelVariant.Utility}
        emphasized
        scrollable
        tone={SurfaceTone.Accent}
        contentLayout={ContentLayout.Column}
        contentPadding={ContentPadding.Compact}
        contentGap={ADJUST_GAP}
        title={t("Adjust")}
      >
        {ready ? (
          children
        ) : (
          <Text variant={TextVariant.Reading} wrap className={styles.adjustPlaceholder}>
            {t("Open a file to adjust")}
          </Text>
        )}
      </Panel>
    </div>
  );
}
