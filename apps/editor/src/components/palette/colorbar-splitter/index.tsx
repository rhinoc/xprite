import "$/components/palette/colorbar-splitter/colorbar-splitter.module.css";
import { type PointerEvent } from "react";

import {
  useEditorLayout,
  MAX_COLORBAR_WIDTH,
  MIN_COLORBAR_WIDTH,
} from "$/components/shared/editor-layout-context";
import { tUi, useUiLanguage } from "$/i18n";
import { usePaletteCursorStyle } from "$/managers/palette/interaction-cursors";
import { EditorCursorName } from "$/managers/ports/platform";
import { useCanvasScale } from "@xprite/ui";
import {
  PointerDragAxis,
  PointerResizeGesture,
  usePointerGesture,
  stylusPointerInputProps,
} from "@xprite/ui/utils";

export function ColorbarResizeHandle() {
  useUiLanguage();
  const cursorStyle = usePaletteCursorStyle();
  const { colorbarWidth, setColorbarWidth } = useEditorLayout();
  const scale = useCanvasScale();
  type Resize = { width: number; gesture: PointerResizeGesture };
  const resize = (event: PointerEvent<HTMLElement>, current: Resize) => {
    const width = current.gesture.valueAt(event);
    if (width !== null)
      setColorbarWidth(Math.min(MAX_COLORBAR_WIDTH, Math.max(MIN_COLORBAR_WIDTH, width)));
  };
  const drag = usePointerGesture<Resize>({
    onMove: resize,
    onCommit: resize,
    onCancel: (current) => setColorbarWidth(current.width),
  });
  return (
    <button
      type="button"
      {...stylusPointerInputProps()}
      role="separator"
      aria-label={tUi("ui.resize.color.area")}
      aria-orientation="vertical"
      aria-valuemin={MIN_COLORBAR_WIDTH}
      aria-valuemax={MAX_COLORBAR_WIDTH}
      aria-valuenow={Math.round(colorbarWidth)}
      aria-valuetext={tUi("ui.color.area.width.count.pixels", { count: Math.round(colorbarWidth) })}
      title={tUi("ui.drag.to.resize.color.area")}
      className="xse-colorbar-resize-handle"
      onPointerDown={(event) => {
        if (event.button !== 0) return;
        event.preventDefault();
        event.stopPropagation();
        event.currentTarget.focus();
        drag.start(event, () => ({
          width: colorbarWidth,
          gesture: new PointerResizeGesture(event, {
            axis: PointerDragAxis.Horizontal,
            initialValue: colorbarWidth,
            pixelsPerUnit: scale,
          }),
        }));
      }}
      onPointerMove={drag.move}
      onPointerUp={drag.finish}
      onPointerCancel={drag.cancel}
      onLostPointerCapture={drag.cancel}
      onKeyDown={(event) => {
        const step = event.shiftKey ? 24 : 8;
        if (event.key === "ArrowLeft" || event.key === "ArrowRight") {
          event.preventDefault();
          setColorbarWidth((width) =>
            Math.min(
              MAX_COLORBAR_WIDTH,
              Math.max(MIN_COLORBAR_WIDTH, width + (event.key === "ArrowRight" ? step : -step)),
            ),
          );
        } else if (event.key === "Home") {
          event.preventDefault();
          setColorbarWidth(MIN_COLORBAR_WIDTH);
        } else if (event.key === "End") {
          event.preventDefault();
          setColorbarWidth(MAX_COLORBAR_WIDTH);
        }
      }}
      style={{
        position: "absolute",
        zIndex: 12,
        left: colorbarWidth - 3,
        top: 0,
        bottom: 0,
        width: 6,
        border: 0,
        padding: 0,
        background: "transparent",
        touchAction: "none",
        cursor: cursorStyle(EditorCursorName.HorizontalResize, "ew-resize"),
      }}
    />
  );
}
