import { useRef } from "react";

import { TileFields } from "$/components/palette/tilemap-colorbar";
import {
  useEditorLayoutSettings,
  DEFAULT_COLORBAR_SELECTOR_HEIGHT,
} from "$/components/shared/editor-layout-context";
import { useElementSize } from "$/components/shared/use-size";
import { useEditorActions } from "$/components/shell/editor-actions";
import { ColorFields } from "$/components/tools/color-controls";
import { tUi } from "$/i18n";
import { useWorkingColorControls } from "$/managers/colors/working-color-controls";
import { useWorkingColorDrag } from "$/managers/colors/working-color-drag";
import { usePaletteColorbarModel } from "$/managers/palette/colorbar-model";
import { UI_SCALE_X, UI_SCALE_Y, surfaceLayout } from "@xprite/ui/canvas";

import "$/components/palette/editor-colorbar/editor-colorbar.module.css";

export function EditorColorbar() {
  const editor = usePaletteColorbarModel();
  const colorDrag = useWorkingColorDrag();
  const working = useWorkingColorControls();
  const actions = useEditorActions();
  const { colorbarWidth, colorbarSplitPosition } = useEditorLayoutSettings();
  const colorbarRoot = useRef<HTMLElement>(null);
  const colorbarSize = useElementSize(colorbarRoot);
  const colorbarHeight = colorbarSize.height
    ? colorbarSize.height / UI_SCALE_Y
    : DEFAULT_COLORBAR_SELECTOR_HEIGHT;
  const measuredWidth = colorbarSize.width || colorbarWidth;
  const bounds = {
    x: 4,
    y: 0,
    width: Math.max(24, (measuredWidth - 4) / UI_SCALE_X),
    height: colorbarHeight,
  };
  const tilemapActive = editor.tilemapActive;
  const showTileFields = editor.showTileFields;
  const selectorBounds = tilemapActive ? { ...bounds, height: bounds.height + 4 } : bounds;
  return (
    <aside
      ref={colorbarRoot}
      className="xse-colorbar"
      style={{ flex: `${100 - colorbarSplitPosition} 1 0px` }}
    >
      <ColorFields
        colorDrag={colorDrag}
        target={working.target}
        onTargetChange={working.setTarget}
        foreground={editor.foreground}
        background={editor.background}
        onHoverColor={(target) => editor.colorHover.set(target ? { hex: editor[target] } : null)}
        onHoverSampleColor={(sample) => editor.colorHover.set(sample)}
        palette={editor.paletteColors}
        canAddColor={editor.paletteCapacityAvailable && (!editor.functional || editor.hasDocument)}
        onAddColor={editor.addPaletteColor}
        onColorChange={editor.changeSelectorColor}
        onForegroundClick={() => actions?.color("foreground")}
        onBackgroundClick={() =>
          actions
            ? actions.color("background")
            : editor.setNotice(tUi("ui.background.color.3", { value1: editor.background }))
        }
        bounds={selectorBounds}
        style={{
          position: "absolute",
          left: surfaceLayout(bounds).left,
          top: tilemapActive ? -4 : 0,
        }}
      />
      {showTileFields && <TileFields bounds={bounds} style={{ zIndex: 3 }} />}
    </aside>
  );
}
/** The source tileset view can occupy its own compact dock tab. */
