import {
  AsepriteInk,
  EditorToolId,
  RightClickMode,
  type EditorTool,
  type ToolSettings,
} from "$/drawing/tool-settings";

const RIGHT_CLICK_OVERRIDE_TOOLS: readonly EditorTool[] = [
  EditorToolId.Pencil,
  EditorToolId.Spray,
  EditorToolId.Bucket,
  EditorToolId.Line,
  EditorToolId.Rectangle,
  EditorToolId.FilledRectangle,
  EditorToolId.Ellipse,
  EditorToolId.FilledEllipse,
  EditorToolId.Curve,
  EditorToolId.Polygon,
  EditorToolId.Gradient,
  EditorToolId.Contour,
  EditorToolId.Blur,
  EditorToolId.Jumble,
  EditorToolId.Text,
];

/** Right-click overrides paint/effect tools; selection, navigation and shading keep their actions. */
export function resolveRightClickTool(settings: ToolSettings): EditorTool | null {
  if (
    !RIGHT_CLICK_OVERRIDE_TOOLS.includes(settings.tool) ||
    (settings.ink === AsepriteInk.Shading && (settings.shade?.length ?? 0) >= 2)
  )
    return null;
  switch (settings.rightClickMode) {
    case RightClickMode.PickForeground:
      return "eyedropper";
    case RightClickMode.Erase:
      return "eraser";
    case RightClickMode.Scroll:
      return "hand";
    case RightClickMode.RectangularMarquee:
      return "marquee";
    case RightClickMode.Lasso:
      return "lasso";
    case RightClickMode.SelectLayerAndMove:
      return "move";
    default:
      return null;
  }
}
