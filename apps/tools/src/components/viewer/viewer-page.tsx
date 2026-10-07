import { useEffect, useSyncExternalStore } from "react";

import { FileToolShell } from "$/components/shared/file-tool-shell";
import { ViewerPreview } from "$/components/viewer/viewer-preview";
import { VIEWER_TOOL } from "$/managers/tools/tool-catalog";
import {
  ViewerStatus,
  ViewerExportFormat,
  type ViewerManager,
} from "$/managers/viewer/viewer-manager";

export function ViewerPage({ manager }: { manager: ViewerManager }) {
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
      filename={snapshot.name}
      busy={busy}
      ready={ready}
      error={snapshot.error}
      onOpen={(file) => manager.open(file)}
      onExample={() => manager.openExample()}
      fileItems={[
        {
          label: "Edit in Xprite",
          disabled: !ready || busy || snapshot.openingEditor,
          onSelect: () => void manager.openEditor(),
        },
        {
          label: "Export animation (.gif)",
          disabled: !ready || busy || snapshot.exporting || !snapshot.animated,
          onSelect: () => void manager.exportFile(ViewerExportFormat.Gif),
        },
        {
          label: "Export current frame (.png)",
          disabled: !ready || busy || snapshot.exporting,
          onSelect: () => void manager.exportFile(ViewerExportFormat.Png),
        },
      ]}
    >
      {ready && <ViewerPreview key={snapshot.name} manager={manager} snapshot={snapshot} />}
    </FileToolShell>
  );
}
