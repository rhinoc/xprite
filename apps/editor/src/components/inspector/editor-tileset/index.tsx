import { useRef } from "react";

import { InlineTileset, TilemapModeBar } from "$/components/palette/tilemap-colorbar";
import { useElementSize } from "$/components/shared/use-size";
import { tUi } from "$/i18n";
import { useTilesetInspectorView } from "$/managers/inspector/tileset-view";
import { Text, TextVariant } from "@xprite/ui";
import { UI_SCALE_X, UI_SCALE_Y } from "@xprite/ui/canvas";

import "$/components/inspector/editor-tileset/editor-tileset.module.css";

export function EditorTileset() {
  const { hasTileset } = useTilesetInspectorView();
  const root = useRef<HTMLElement>(null);
  const size = useElementSize(root);
  const bounds = {
    x: 4,
    y: 38,
    width: Math.max(24, size.width / UI_SCALE_X - 8),
    height: Math.max(36, size.height / UI_SCALE_Y - 42),
  };
  return (
    <aside ref={root} className="xse-tileset" style={{ position: "relative", overflow: "hidden" }}>
      {hasTileset ? (
        <>
          <TilemapModeBar
            width={size.width / UI_SCALE_X}
            showBoth={true}
            canToggleBoth={false}
            onShowBothChange={() => {}}
          />
          <InlineTileset bounds={bounds} />
        </>
      ) : (
        <div className="xse-workspace-panel-empty">
          <Text variant={TextVariant.Inline}>{tUi("ui.select.a.tilemap.layer")}</Text>
        </div>
      )}
    </aside>
  );
}
