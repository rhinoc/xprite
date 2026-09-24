import type { EditorSnapshot, EditorTool } from "@xprite/editor-core";

const SELECTION_TOOLS: readonly EditorTool[] = [
  "marquee",
  "elliptical_marquee",
  "lasso",
  "polygonal_lasso",
  "magic_wand",
];
const SHAPE_TOOLS: readonly EditorTool[] = [
  "marquee",
  "elliptical_marquee",
  "line",
  "gradient",
  "rectangle",
  "filled_rectangle",
  "ellipse",
  "filled_ellipse",
  "curve",
  "polygon",
];
const FREEHAND_TOOLS: readonly EditorTool[] = [
  "pencil",
  "eraser",
  "spray",
  "contour",
  "blur",
  "jumble",
];

/** Command contexts and held editing modifiers have different native scopes. */
export function shortcutContexts(state: EditorSnapshot) {
  const transforming = !!(state.floatingPaste || state.selectionTransform);
  const tool = state.settings.tool;
  const actions: string[] = [];
  if (transforming)
    actions.push(
      "Transform Selection",
      "Selection Transform",
      "Translating Selection",
      "Scaling Selection",
      "Canvas Size",
      "Line / Gradient",
    );
  if (SELECTION_TOOLS.includes(tool)) actions.push("Selection");
  if (state.preview && SHAPE_TOOLS.includes(state.preview.tool)) actions.push("Shape");
  if (FREEHAND_TOOLS.includes(tool)) actions.push("Freehand");
  if (tool === "line" || tool === "gradient") actions.push("Line / Gradient");
  if (tool === "move") actions.push("Move");
  return { command: transforming ? "Transformation" : "Normal", actions };
}
