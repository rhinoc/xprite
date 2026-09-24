const EDITOR_SCENE_SCALE = 1;
const VIEWPORT_FRAME_INSET = 6;
const CANVAS_HORIZONTAL_RESERVE_WITH_SCROLLBARS = 24;
const CANVAS_VERTICAL_RESERVE_WITH_SCROLLBARS = 24;
const CANVAS_RESERVE_WITHOUT_SCROLLBARS = VIEWPORT_FRAME_INSET * 2;
const MIN_CANVAS_EXTENT = 2;
const MEASURED_VIEWPORT_TO_CORE_SCALE = 2;
const SHORT_EDITOR_HEIGHT = 500;

export function isShortEditorHeight(height: number) {
  return height < SHORT_EDITOR_HEIGHT;
}
/** Before the viewport mounts there is no work area to measure. */
function editorViewportSize(_timelineVisible: boolean) {
  return { width: 0, height: 0 };
}

/** Fixed bitmap control scale with independently resizable desktop docks. */
export function editorSceneLayout(width = 0, height = 0) {
  const sceneWidth = Math.round(width / EDITOR_SCENE_SCALE);
  const sceneHeight = Math.round(height / EDITOR_SCENE_SCALE);
  return { width, height, sceneWidth, sceneHeight };
}

/** Frame-local viewport: source border and mini scrollbar insets. */
export function editorCanvasBounds(pane: { width: number; height: number }, showScrollbars = true) {
  const horizontalReserve = showScrollbars
      ? CANVAS_HORIZONTAL_RESERVE_WITH_SCROLLBARS
      : CANVAS_RESERVE_WITHOUT_SCROLLBARS,
    verticalReserve = showScrollbars
      ? CANVAS_VERTICAL_RESERVE_WITH_SCROLLBARS
      : CANVAS_RESERVE_WITHOUT_SCROLLBARS;
  return {
    x: VIEWPORT_FRAME_INSET,
    y: VIEWPORT_FRAME_INSET,
    width: Math.max(
      MIN_CANVAS_EXTENT,
      Math.round(pane.width / EDITOR_SCENE_SCALE) - horizontalReserve,
    ),
    height: Math.max(
      MIN_CANVAS_EXTENT,
      Math.round(pane.height / EDITOR_SCENE_SCALE) - verticalReserve,
    ),
  };
}

// Model adapters live above EditorSurface, so share each editor's measured
// viewport without querying an unrelated gallery or document's DOM node.
const measuredViewports = new WeakMap<object, { width: number; height: number }>();
export function setMeasuredEditorViewport(
  editor: object,
  bounds: { width: number; height: number },
) {
  measuredViewports.set(editor, {
    width: bounds.width / MEASURED_VIEWPORT_TO_CORE_SCALE,
    height: bounds.height / MEASURED_VIEWPORT_TO_CORE_SCALE,
  });
}
export function measuredEditorViewport(editor: object, timelineVisible: boolean) {
  return measuredViewports.get(editor) ?? editorViewportSize(timelineVisible);
}
