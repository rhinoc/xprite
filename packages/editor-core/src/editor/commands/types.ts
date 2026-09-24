import type { EditorTool } from "$/drawing/tool-settings";
import type { TilesetMode } from "$/tilemap/types";

export type EditorCommand =
  | { type: "nudge-selection"; dx: number; dy: number }
  | { type: "tileset-mode"; mode: TilesetMode }
  | { type: "transform-tile"; transform: "flip-x" | "flip-y" | "flip-d" | "rotate-cw" }
  | { type: "tool"; tool: EditorTool; tools?: readonly EditorTool[] }
  | { type: "zoom-to"; zoom: number }
  | {
      type: "move-selection";
      dx: number;
      dy: number;
      boundsOnly: boolean;
      byGrid: boolean;
    }
  | {
      type:
        | "undo"
        | "redo"
        | "new"
        | "preferences"
        | "open"
        | "close"
        | "close-all"
        | "reopen-closed-file"
        | "copy"
        | "copy-merged"
        | "cut"
        | "paste"
        | "paste-new-layer"
        | "paste-new-sprite"
        | "new-sprite-from-selection"
        | "new-layer-via-copy"
        | "new-layer-via-cut"
        | "keyboard-shortcuts"
        | "save"
        | "save-as"
        | "export"
        | "export-sheet"
        | "import-sheet"
        | "repeat-export"
        | "effect-hue-saturation"
        | "effect-replace-color"
        | "effect-outline"
        | "toggle-onion"
        | "toggle-preview"
        | "toggle-timeline"
        | "toggle-timeline-thumbnails"
        | "play-preview"
        | "reverse-frames"
        | "snap-grid"
        | "deselect"
        | "reselect"
        | "select-all"
        | "invert-selection"
        | "flip-selection-horizontal"
        | "flip-selection-vertical"
        | "flip-canvas-horizontal"
        | "flip-canvas-vertical"
        | "fit-screen"
        | "scroll-center"
        | "clear"
        | "cancel"
        | "commit"
        | "finish-edit"
        | "discard-edit"
        | "new-frame"
        | "duplicate-cels"
        | "duplicate-linked-cels"
        | "empty-frame"
        | "delete-frame"
        | "first-frame"
        | "last-frame"
        | "previous-tag-frame"
        | "next-tag-frame"
        | "new-layer"
        | "new-tilemap-layer"
        | "toggle-tiles-mode"
        | "layer-properties"
        | "frame-properties"
        | "toggle-layer-visibility"
        | "zoom-in"
        | "zoom-out"
        | "palette-previous"
        | "palette-next"
        | "brush-grow"
        | "brush-shrink"
        | "swap-colors"
        | "toggle-grid"
        | "toggle-pixel-grid";
    };
