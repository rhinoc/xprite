import { useEffect, useSyncExternalStore } from "react";

import { FileToolShell } from "$/components/shared/file-tool-shell";
import { ToolHelp } from "$/components/shared/tool-help";
import { ViewerPreview } from "$/components/viewer/viewer-preview";
import { useToolTranslation } from "$/managers/locale/tool-language";
import { VIEWER_TOOL } from "$/managers/tools/tool-catalog";
import {
  ViewerStatus,
  ViewerExportFormat,
  type ViewerManager,
} from "$/managers/viewer/viewer-manager";
import { VIEWER_EXPORT_HELP, ViewerHelpSection } from "@xprite/growth-content/tools";

export function ViewerPage({ manager }: { manager: ViewerManager }) {
  const t = useToolTranslation();

  const snapshot = useSyncExternalStore(
    manager.subscribe,
    manager.getSnapshot,
    manager.getSnapshot,
  );
  const busy = snapshot.status === ViewerStatus.Loading;
  const ready = snapshot.pixels !== null;
  useEffect(() => {
    if (!snapshot.playing) return;
    let handle = 0;
    let previous: number | null = null;
    const tick = (now: number) => {
      if (previous !== null) manager.advance(now - previous);
      previous = now;
      handle = requestAnimationFrame(tick);
    };
    handle = requestAnimationFrame(tick);
    return () => cancelAnimationFrame(handle);
  }, [snapshot.playing, manager]);
  return (
    <FileToolShell
      tool={VIEWER_TOOL}
      help={<ToolHelp id={ViewerHelpSection.Overview} content={VIEWER_EXPORT_HELP} />}
      filename={snapshot.name}
      busy={busy}
      ready={ready}
      error={snapshot.error}
      onOpen={(file) => manager.open(file)}
      onExample={() => manager.openExample()}
      onReset={() => manager.clear()}
      flow={{
        exportDisabled: !ready || snapshot.exporting || snapshot.openingEditor,
        editMore: { run: () => void manager.openEditor(), disabled: snapshot.openingEditor },
        exportFormats: [
          {
            id: "gif",
            label: t("Export animation (.gif)"),
            disabled: !snapshot.animated,
            run: () => void manager.exportFile(ViewerExportFormat.Gif),
          },
          {
            id: "png",
            label: t("Export current frame (.png)"),
            run: () => void manager.exportFile(ViewerExportFormat.Png),
          },
        ],
      }}
    >
      {ready && <ViewerPreview key={snapshot.name} manager={manager} snapshot={snapshot} />}
    </FileToolShell>
  );
}
