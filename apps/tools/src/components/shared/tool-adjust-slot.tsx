import type { ReactNode } from "react";

import { useToolWindowShade } from "$/components/shared/window-shade";
import { useToolTranslation } from "$/managers/locale/tool-language";
import { ContentLayout, Panel, PanelVariant, SurfaceTone } from "@xprite/ui";

import styles from "$/components/shared/tool-flow.module.css";

/** Body padding inside the Adjust window (tighter than ContentPadding.Compact's 8px). */
const ADJUST_PADDING = 4;
const ADJUST_GAP = 2;

/**
 * Shared adjust panel stacked above the Export bar (same layout on desktop and phone). It is a
 * normal tool window, so WindowShade still rolls it up. Rendered only once the tool has a result.
 * Padding stays tight so the stage/result keeps vertical space.
 */
export function ToolAdjustSlot({ children }: { children?: ReactNode }) {
  const shade = useToolWindowShade("adjust", { collapseOnPhone: true });
  const t = useToolTranslation();
  return (
    <div className={styles.adjust} data-tool-adjust="">
      <Panel
        {...shade}
        variant={PanelVariant.Utility}
        emphasized
        scrollable
        tone={SurfaceTone.Accent}
        contentLayout={ContentLayout.Column}
        contentPadding={ADJUST_PADDING}
        contentGap={ADJUST_GAP}
        title={t("Adjust")}
      >
        <div className={styles.adjustFields}>{children}</div>
      </Panel>
    </div>
  );
}
