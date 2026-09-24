import { tUi } from "$/i18n";
import { useUserGuide, resolveUserGuideImage } from "$/managers/shell/user-guide";
import { MarkdownView, ScrollArea, useUi } from "@xprite/ui";
import { UiPart } from "@xprite/ui/assets";

import styles from "$/components/workspace/user-guide-view/user-guide-view.module.css";

export function UserGuideView({ hidden = false }: { hidden?: boolean }) {
  const markdown = useUserGuide();
  const { style } = useUi();
  return (
    <div className={styles.root} hidden={hidden} style={{ background: style.colors.workspace }}>
      <div className={styles.frame}>
        <ScrollArea
          className={styles.scroller}
          style={{ background: style.colors.textbox_face }}
          scrollX={false}
          viewportProps={{
            tabIndex: 0,
            "aria-label": tUi("ui.user.guide"),
          }}
        >
          <MarkdownView
            markdown={markdown}
            resolveImage={resolveUserGuideImage}
            aria-label={tUi("ui.user.guide")}
          />
        </ScrollArea>
        <UiPart part="editor_normal" scale={2} drawCenter={false} className={styles.border} />
      </div>
    </div>
  );
}
