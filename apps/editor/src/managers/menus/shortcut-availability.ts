import type { EditorTool } from "@xprite/editor-core";
import { resolveShortcut } from "@xprite/editor-core";

const toolIds: Record<string, EditorTool> = {
  rectangular_marquee: "marquee",
  elliptical_marquee: "elliptical_marquee",
  lasso: "lasso",
  polygonal_lasso: "polygonal_lasso",
  magic_wand: "magic_wand",
  pencil: "pencil",
  spray: "spray",
  eraser: "eraser",
  eyedropper: "eyedropper",
  move: "move",
  hand: "hand",
  slice: "slice",
  zoom: "zoom",
  paint_bucket: "bucket",
  gradient: "gradient",
  line: "line",
  curve: "curve",
  rectangle: "rectangle",
  filled_rectangle: "filled_rectangle",
  ellipse: "ellipse",
  filled_ellipse: "filled_ellipse",
  contour: "contour",
  polygon: "polygon",
  blur: "blur",
  jumble: "jumble",
  text: "text",
};

const commandActions: Record<string, string> = {
  NewFile: "new",
  OpenFile: "open",
  CloseFile: "close",
  CloseAllFiles: "close-all",
  ReopenClosedFile: "reopen-closed-file",
  SaveFile: "save",
  SaveFileAs: "save-as",
  SaveFileCopyAs: "export",
  ImportSpriteSheet: "import-sheet",
  ExportSpriteSheet: "export-sheet",
  RepeatLastExport: "repeat-export",
  Options: "preferences",
  KeyboardShortcuts: "keyboard-shortcuts",
  NewSpriteFromSelection: "new-sprite-from-selection",
  Undo: "undo",
  Redo: "redo",
  Cut: "cut",
  Copy: "copy",
  CopyMerged: "copy-merged",
  Paste: "paste",
  PasteNewLayer: "paste-new-layer",
  Clear: "clear",
  Cancel: "cancel",
  PlayAnimation: "commit",
  PlayPreviewAnimation: "play-preview",
  TogglePreview: "toggle-preview",
  ShowOnionSkin: "toggle-onion",
  FrameProperties: "frame-properties",
  LayerProperties: "layer-properties",
  LayerVisibility: "toggle-layer-visibility",
  RemoveFrame: "delete-frame",
  ReverseFrames: "reverse-frames",
  NewTilemapLayer: "new-tilemap-layer",
  ToggleTilesMode: "toggle-tiles-mode",
  MaskAll: "select-all",
  DeselectMask: "deselect",
  ReselectMask: "reselect",
  InvertMask: "invert-selection",
  ShowGrid: "toggle-grid",
  ShowPixelGrid: "toggle-pixel-grid",
  SwitchColors: "swap-colors",
  GotoPreviousFrame: "move-selection",
  GotoNextFrame: "move-selection",
  GotoPreviousLayer: "move-selection",
  GotoNextLayer: "move-selection",
  NewLayer: "new-layer",
  NewFrame: "new-frame",
  GotoFirstFrame: "first-frame",
  GotoLastFrame: "last-frame",
  HueSaturation: "effect-hue-saturation",
  ReplaceColor: "effect-replace-color",
  Outline: "effect-outline",
  SnapToGrid: "snap-grid",
  FitScreen: "fit-screen",
  ScrollCenter: "scroll-center",
  Timeline: "toggle-timeline",
  ToggleTimelineThumbnails: "toggle-timeline-thumbnails",
  ChangeBrush: "brush-grow",
};

export function browserCommandAction(command: string, params?: Record<string, string>) {
  if (command === "NewLayer") {
    if (params?.tilemap === "true") return "new-tilemap-layer";
    if (params?.viaCopy === "true") return "new-layer-via-copy";
    if (params?.viaCut === "true") return "new-layer-via-cut";
    if (params?.fromClipboard === "true") return "paste-new-layer";
    if (!params?.before && !params?.group) return "new-layer";
    return null;
  }
  if (command === "NewFrame") {
    if (params?.content === "empty") return "empty-frame";
    if (params?.content === "cellinked") return "duplicate-linked-cels";
    if (params?.content === "celcopies") return "duplicate-cels";
    return "new-frame";
  }
  if (command === "ChangeBrush")
    return params?.change === "increment-size"
      ? "brush-grow"
      : params?.change === "decrement-size"
        ? "brush-shrink"
        : null;
  if (command === "ChangeColor")
    return params?.change === "decrement-index"
      ? "palette-previous"
      : params?.change === "increment-index"
        ? "palette-next"
        : null;
  if (command === "Zoom")
    return params?.action === "in" ? "zoom-in" : params?.action === "out" ? "zoom-out" : null;
  if (command === "Flip")
    return params?.target === "mask"
      ? params?.orientation === "horizontal"
        ? "flip-selection-horizontal"
        : "flip-selection-vertical"
      : params?.orientation === "horizontal"
        ? "flip-canvas-horizontal"
        : "flip-canvas-vertical";
  return commandActions[command] ?? null;
}

export function isCallableShortcut(
  shortcut: string,
  commandId?: string,
  toolId?: string,
  params?: Record<string, string>,
) {
  const tokens = shortcut
    .split("+")
    .map((token) => token.trim())
    .filter(Boolean);
  if (!tokens.length) return false;
  const keyToken = tokens.pop()!.toLowerCase();
  const input: {
    key: string;
    ctrl?: boolean;
    meta?: boolean;
    shift?: boolean;
    alt?: boolean;
    space?: boolean;
  } = { key: keyToken };
  for (const token of tokens.map((value) => value.toLowerCase())) {
    if (token === "ctrl" || token === "control") input.ctrl = true;
    else if (token === "cmd" || token === "meta" || token === "super") input.meta = true;
    else if (token === "alt" || token === "opt" || token === "option") input.alt = true;
    else if (token === "shift") input.shift = true;
    else if (token === "space") input.space = true;
    else return false;
  }
  if (keyToken === "space") input.key = " ";
  if (keyToken === "del") input.key = "delete";
  if (keyToken === "esc") input.key = "escape";
  const resolved = resolveShortcut(input);
  if (!resolved) return false;
  if (toolId) {
    const browserTool = toolIds[toolId];
    if (!browserTool || resolved.type !== "tool") return false;
    return resolved.tool === browserTool || !!resolved.tools?.includes(browserTool);
  }
  const expected = commandId ? browserCommandAction(commandId, params) : null;
  return !!expected && resolved.type === expected;
}
