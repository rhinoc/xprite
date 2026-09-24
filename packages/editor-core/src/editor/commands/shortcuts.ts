import type { EditorTool } from "$/drawing/tool-settings";
import type { EditorCommand } from "$/editor/commands/types";
import { TilesetMode } from "$/tilemap/types";
export interface ShortcutInput {
  key: string;
  ctrl?: boolean;
  meta?: boolean;
  shift?: boolean;
  alt?: boolean;
  editingText?: boolean;
  repeat?: boolean;
  space?: boolean;
}
export function resolveShortcut(input: ShortcutInput): EditorCommand | null {
  if (input.editingText) return null;
  const k = input.key.toLowerCase(),
    mod = input.ctrl || input.meta;
  if (input.space && !mod && !input.alt && !input.shift) {
    if (k === "n") return { type: "new-tilemap-layer" };
    if (k === "tab") return { type: "toggle-tiles-mode" };
    if (k === "1") return { type: "tileset-mode", mode: TilesetMode.Manual };
    if (k === "2") return { type: "tileset-mode", mode: TilesetMode.Auto };
    if (k === "3") return { type: "tileset-mode", mode: TilesetMode.Stack };
    if (k === "h" || k === "x") return { type: "transform-tile", transform: "flip-x" };
    if (k === "v" || k === "y") return { type: "transform-tile", transform: "flip-y" };
    if (k === "d") return { type: "transform-tile", transform: "flip-d" };
    if (k === "r") return { type: "transform-tile", transform: "rotate-cw" };
    return null;
  }
  if (k === "enter" && !mod && !input.alt && !input.shift) return { type: "commit" };
  if (k === "escape") return { type: "cancel" };
  if (mod) {
    if (input.alt && input.shift && k === "k") return { type: "keyboard-shortcuts" };
    if (input.alt && !input.shift && k === "n") return { type: "new-sprite-from-selection" };
    if (!input.alt && !input.shift && k === "j") return { type: "new-layer-via-copy" };
    if (!input.alt && input.shift && k === "j") return { type: "new-layer-via-cut" };
    if (!input.alt && input.shift && k === "t") return { type: "reopen-closed-file" };
    if (!input.alt && !input.shift && k === "e") return { type: "export-sheet" };
    if (!input.alt && !input.shift && k === "i") return { type: "import-sheet" };
    if (!input.alt && !input.shift && k === "u") return { type: "effect-hue-saturation" };
    if (!input.alt && input.shift && k === "x") return { type: "repeat-export" };
    if (!input.alt && input.shift && k === "d") return { type: "reselect" };
    if (!input.alt && k === "c") return { type: input.shift ? "copy-merged" : "copy" };
    if (!input.alt && !input.shift && k === "x") return { type: "cut" };
    if (!input.alt && !input.shift && k === "v") return { type: "paste" };
    if (!input.alt && input.shift && k === "w") return { type: "close-all" };
    // Aseprite modified commands are distinct actions, not aliases of the base
    // key (Shift+D reselects, Shift+apostrophe toggles pixel grid).
    if (!input.alt && input.shift && (k === "'" || k === '"')) return { type: "toggle-pixel-grid" };
    if (!input.alt && (k === "+" || k === "=")) return { type: "zoom-in" };
    if (!input.alt && !input.shift && k === "-") return { type: "zoom-out" };
    if (!input.alt && input.shift && k === "i") return { type: "invert-selection" };
    if (!input.alt && !input.shift && k === "0") return { type: "fit-screen" };
    if (k === "s") {
      if (input.alt) return input.shift ? { type: "export" } : null;
      return { type: input.shift ? "save-as" : "save" };
    }
    if (input.alt || (input.shift && k !== "z" && k !== "s")) return null;
    if (k === "z") return { type: input.shift ? "redo" : "undo" };
    if (k === "y" || k === "r") return { type: "redo" };
    if (k === "k" || (k === "," && input.meta)) return { type: "preferences" };
    if (k === "n") return { type: "new" };
    if (k === "o") return { type: "open" };
    if (k === "w") return { type: "close" };
    if (k === "d") return { type: "deselect" };
    if (k === "a") return { type: "select-all" };
    if (k === "'") return { type: "toggle-grid" };
    return null;
  }
  const arrows: Record<string, [number, number]> = {
    arrowleft: [-1, 0],
    arrowright: [1, 0],
    arrowup: [0, -1],
    arrowdown: [0, 1],
  };
  if (arrows[k])
    return {
      type: "move-selection",
      dx: arrows[k][0],
      dy: arrows[k][1],
      boundsOnly: !!input.alt,
      byGrid: !!input.shift,
    };
  if (!input.alt && !input.shift && (k === "delete" || k === "backspace")) return { type: "clear" };
  if (input.alt) {
    if (input.shift) return null;
    if (k === "i") return { type: "reverse-frames" };
    return k === "n"
      ? { type: "new-frame" }
      : k === "b"
        ? { type: "empty-frame" }
        : k === "c"
          ? { type: "delete-frame" }
          : k === "d"
            ? { type: "duplicate-cels" }
            : k === "m"
              ? { type: "duplicate-linked-cels" }
              : null;
  }
  if (!input.shift && k === "f3") return { type: "toggle-onion" };
  if (input.shift && !input.alt && (k === "h" || k === "v"))
    return { type: k === "h" ? "flip-selection-horizontal" : "flip-selection-vertical" };
  if (!input.shift && k === "f7") return { type: "toggle-preview" };
  if (input.shift && k === "enter") return { type: "play-preview" };
  if (input.shift && k === "s") return { type: "snap-grid" };
  if (!input.shift && k === "tab") return { type: "toggle-timeline" };
  if (!input.shift && k === "f6") return { type: "toggle-timeline-thumbnails" };
  if (input.shift && k === "r") return { type: "effect-replace-color" };
  if (input.shift && k === "o") return { type: "effect-outline" };
  if (input.shift && k === "z") return { type: "scroll-center" };
  if (input.shift && k === "n") return { type: "new-layer" };
  if ((input.shift && k === "p") || (!input.shift && k === "f2"))
    return { type: "layer-properties" };
  if (input.shift && k === "x") return { type: "toggle-layer-visibility" };
  if (!input.shift && k === "p") return { type: "frame-properties" };
  if (!input.shift && k === ",") return { type: "previous-tag-frame" };
  if (!input.shift && k === ".") return { type: "next-tag-frame" };
  if (!input.shift && k === "home") return { type: "first-frame" };
  if (!input.shift && k === "end") return { type: "last-frame" };
  const toolGroups: Record<string, readonly EditorTool[]> = {
    m: ["marquee"],
    "shift+m": ["elliptical_marquee"],
    q: ["lasso"],
    "shift+q": ["polygonal_lasso"],
    w: ["magic_wand"],
    b: ["pencil"],
    "shift+b": ["spray"],
    e: ["eraser"],
    i: ["eyedropper"],
    z: ["zoom"],
    h: ["hand"],
    v: ["move"],
    "shift+c": ["slice"],
    g: ["bucket"],
    "shift+g": ["gradient"],
    l: ["line"],
    "shift+l": ["curve"],
    u: ["rectangle", "filled_rectangle"],
    "shift+u": ["ellipse", "filled_ellipse"],
    d: ["contour"],
    "shift+d": ["polygon"],
    r: ["blur", "jumble"],
    t: ["text"],
  };
  const tools = toolGroups[(input.shift ? "shift+" : "") + k];
  if (tools)
    return tools.length > 1
      ? { type: "tool", tool: tools[0], tools }
      : { type: "tool", tool: tools[0] };
  const zoom: Record<string, number> = {
    "`": 0.5,
    "~": 0.5,
    "1": 1,
    "2": 2,
    "3": 4,
    "4": 8,
    "5": 16,
    "6": 32,
  };
  if (zoom[k] !== undefined && (!input.shift || k === "~"))
    return { type: "zoom-to", zoom: zoom[k] };
  const cmd: Record<string, EditorCommand["type"]> = {
    "+": "brush-grow",
    "=": "brush-grow",
    "-": "brush-shrink",
    "[": "palette-previous",
    "]": "palette-next",
    x: "swap-colors",
    "9": "palette-previous",
    "0": "palette-next",
  };
  if (input.shift && k !== "+" && k !== "=") return null;
  return cmd[k] ? ({ type: cmd[k] } as EditorCommand) : null;
}
