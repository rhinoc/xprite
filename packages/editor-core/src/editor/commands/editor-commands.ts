import type { Point } from "$/base/primitives";
import { DocumentViewTarget } from "$/canvas/document-view-preferences";
import { DocumentShowOption } from "$/canvas/types";
import { fitScreenZoom, stepZoom } from "$/canvas/view";
import { AsepriteInk } from "$/drawing/tool-settings";
import type { EditorCommand } from "$/editor/commands/types";
import type { RasterEditor } from "$/editor/RasterEditor";
import type { EditorSnapshot } from "$/editor/types";
import { canOpenEffect } from "$/image-editing/effects";
import { FlipOrientation } from "$/image-editing/transform";
import { isSelectionTool } from "$/selection/operations";
import { TilemapDisplayMode } from "$/tilemap/types";
export type EditorScene = "home" | "document";
export type EditorAction =
  | EditorCommand["type"]
  | "insert-text"
  | "layer-visibility"
  | "layer-lock";
export interface EditorCommandContext {
  scene: EditorScene;
  viewport: { width: number; height: number };
  /** Logical editor position of the pointer; DOM conversion belongs to the adapter. */
  zoomAnchor?: Point;
}
/** Source command predicates use active UI context, not a retained image on Home. */
export function canExecuteEditorAction(
  action: EditorAction,
  state: EditorSnapshot,
  scene: EditorScene,
): boolean {
  const active = scene === "document" && !!state.document;
  switch (action) {
    case "new-tilemap-layer":
      return active && !!state.document?.timeline;
    case "toggle-tiles-mode":
    case "tileset-mode":
      return (
        active &&
        state.document?.timeline?.layers[state.document.timeline.activeLayer]?.kind === "tilemap"
      );
    case "transform-tile":
      return (
        active &&
        state.settings.tilemapMode === TilemapDisplayMode.Tiles &&
        state.document?.timeline?.layers[state.document.timeline.activeLayer]?.kind === "tilemap"
      );
    case "save-as":
      return active;
    case "keyboard-shortcuts":
    case "new":
    case "open":
    case "preferences":
    case "paste-new-sprite":
    case "new-sprite-from-selection":
    case "reopen-closed-file":
    case "close-all":
    case "tool":
    case "brush-grow":
    case "brush-shrink":
    case "palette-previous":
    case "palette-next":
    case "toggle-grid":
    case "toggle-timeline":
      return true;
    case "toggle-timeline-thumbnails":
      return active;
    case "toggle-pixel-grid":
      return true;
    case "new-layer-via-copy":
    case "new-layer-via-cut":
      return active && !!state.document?.selection;
    case "reverse-frames":
      return (
        active &&
        !!state.document?.timeline?.range &&
        state.document.timeline.range.frames.length >= 2
      );
    case "effect-hue-saturation":
    case "effect-replace-color":
    case "effect-outline":
      return active && canOpenEffect(state.document);
    case "undo":
      return active && (state.canUndo || !!state.floatingPaste || !!state.inlineText);
    case "redo":
      return active && (state.canRedo || !!state.inlineText);
    case "deselect":
      return active && !!state.document?.selection;
    case "nudge-selection":
      return (
        active &&
        !!state.document?.selection &&
        !!state.document.layer.visible &&
        !state.document.layer.locked
      );
    case "finish-edit":
    case "discard-edit":
      return (
        active &&
        (!!state.inlineText ||
          !!state.floatingPaste ||
          !!state.selectionTransform ||
          (!!state.preview && ["curve", "polygon", "polygonal_lasso"].includes(state.preview.tool)))
      );
    case "move-selection":
      return active && (!!state.document?.selection || !!state.document?.timeline);
    case "clear":
      if (state.settings.tool === "slice") return active && !!state.selectedSliceIds?.length;
      return active && !!state.document?.layer.visible && !state.document.layer.locked;
    case "insert-text":
      return active && !state.document?.layer.locked && !!state.settings.font;
    default:
      return active;
  }
}
export type EditorCommandResult =
  | { kind: "unavailable" }
  | { kind: "handled"; paletteIndex?: number }
  | {
      kind: "request";
      action:
        | "new"
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
        | "keyboard-shortcuts"
        | "preferences"
        | "save"
        | "save-as"
        | "export"
        | "export-sheet"
        | "import-sheet"
        | "repeat-export"
        | "effect-hue-saturation"
        | "effect-replace-color"
        | "effect-outline"
        | "toggle-preview"
        | "toggle-timeline"
        | "toggle-timeline-thumbnails"
        | "play-preview"
        | "insert-text"
        | "layer-properties"
        | "new-tilemap-layer"
        | "frame-properties";
    };
/** Shared non-UI execution. File/dialog requests are routed to the session/adapter. */
export function executeEditorCommand(
  core: RasterEditor,
  command: EditorCommand,
  context: EditorCommandContext,
): EditorCommandResult {
  const state = core.getSnapshot();
  if (!canExecuteEditorAction(command.type, state, context.scene)) return { kind: "unavailable" };
  // Presentation commands must not commit drafts or stop playback.
  if (command.type === "toggle-timeline" || command.type === "toggle-timeline-thumbnails")
    return { kind: "request", action: command.type };
  // WritingTextState drops its preview before ordinary commands. Undo, redo,
  // and Cancel discard it instead, while Commit applies it explicitly.
  if (
    state.inlineText &&
    command.type !== "undo" &&
    command.type !== "redo" &&
    command.type !== "cancel" &&
    command.type !== "commit" &&
    command.type !== "finish-edit" &&
    command.type !== "discard-edit" &&
    !core.drawing.text.commitInlineText()
  )
    return { kind: "unavailable" };
  if (state.playing && !["commit", "zoom-in", "zoom-out", "zoom-to"].includes(command.type))
    core.timeline.setPlaying(false);
  switch (command.type) {
    case "new":
    case "open":
    case "preferences":
    case "close":
    case "close-all":
    case "copy":
    case "copy-merged":
    case "cut":
    case "paste":
    case "paste-new-layer":
    case "paste-new-sprite":
    case "new-sprite-from-selection":
    case "keyboard-shortcuts":
    case "reopen-closed-file":
    case "save":
    case "save-as":
    case "export":
    case "export-sheet":
    case "import-sheet":
    case "repeat-export":
    case "effect-hue-saturation":
    case "effect-replace-color":
    case "effect-outline":
    case "toggle-preview":
    case "play-preview":
    case "layer-properties":
    case "new-tilemap-layer":
    case "frame-properties":
      return { kind: "request", action: command.type };
    case "toggle-onion":
      core.timeline.setOnionSkin({ active: !state.view.onionSkin?.active });
      break;
    case "toggle-tiles-mode":
      core.tilemap.setTilemapMode(
        state.settings.tilemapMode === TilemapDisplayMode.Tiles
          ? TilemapDisplayMode.Pixels
          : TilemapDisplayMode.Tiles,
      );
      break;
    case "tileset-mode":
      core.tilemap.setTilesetMode(command.mode);
      break;
    case "transform-tile": {
      const tile = state.settings.selectedTile ?? 0,
        flags = tile & 0xe0000000,
        index = tile & 0x1fffffff;
      const transformed =
        command.transform === "flip-x"
          ? tile ^ 0x80000000
          : command.transform === "flip-y"
            ? tile ^ 0x40000000
            : command.transform === "flip-d"
              ? tile ^ 0x20000000
              : (index |
                  (flags & 0x80000000 ? 0x40000000 : 0) |
                  (flags & 0x40000000 ? 0 : 0x80000000) |
                  (flags & 0x20000000 ? 0 : 0x20000000)) >>>
                0;
      core.tilemap.setSelectedTile(transformed >>> 0);
      break;
    }
    case "snap-grid":
      core.canvas.setDocumentViewOptions({ snapToGrid: !state.view.snapToGrid });
      break;
    case "reverse-frames":
      core.timeline.reverseFrames();
      break;
    case "tool":
      core.drawing.settings.selectShortcut(command.tools ?? [command.tool]);
      break;
    case "undo":
      core.history.undo();
      break;
    case "redo":
      core.history.redo();
      break;
    case "reselect":
      if (!core.selection.canReselect()) return { kind: "unavailable" };
      core.selection.reselect();
      break;
    case "deselect":
      core.selection.deselect();
      break;
    case "select-all":
      core.selection.selectAll();
      break;
    case "invert-selection":
      core.selection.invert();
      break;
    case "flip-selection-horizontal":
    case "flip-selection-vertical":
      if (!state.document?.selection) return { kind: "unavailable" };
      core.selection.flipSelection(
        command.type === "flip-selection-horizontal"
          ? FlipOrientation.Horizontal
          : FlipOrientation.Vertical,
      );
      break;
    case "flip-canvas-horizontal":
    case "flip-canvas-vertical":
      core.imageEditing.flipCanvas(
        command.type === "flip-canvas-horizontal"
          ? FlipOrientation.Horizontal
          : FlipOrientation.Vertical,
      );
      break;
    case "scroll-center":
      core.canvas.setView({ pan: { x: 0, y: 0 } });
      break;
    case "fit-screen":
      core.canvas.setView({
        zoom: fitScreenZoom(state.view.zoom, context.viewport, state.document!),
        pan: { x: 0, y: 0 },
      });
      break;
    case "clear":
      core.selection.clearSelectionPixels(state.settings.selectionKeepAfterClear ?? false);
      break;
    case "move-selection":
      if (!(state.document?.selection && isSelectionTool(state.settings.tool))) {
        const t = state.document?.timeline;
        if (!t || command.boundsOnly || command.byGrid) return { kind: "unavailable" };
        if (command.dx) core.timeline.stepFrame(command.dx > 0 ? 1 : -1);
        else core.timeline.stepLayer(command.dy < 0 ? 1 : -1);
        break;
      }
      if (!command.boundsOnly && (!state.document?.layer.visible || state.document.layer.locked))
        return { kind: "unavailable" };
      core.selection.nudgeSelection(
        command.dx * (command.byGrid ? state.view.gridWidth : 1),
        command.dy * (command.byGrid ? state.view.gridHeight : 1),
        command.boundsOnly,
      );
      break;
    case "nudge-selection":
      // The explicit action never falls through to timeline frame/layer navigation.
      if (!core.selection.nudgeSelection(command.dx, command.dy)) return { kind: "unavailable" };
      break;
    case "finish-edit":
      if (state.inlineText) {
        if (!core.drawing.text.commitInlineText()) return { kind: "unavailable" };
      } else if (state.floatingPaste) {
        if (!core.clipboard.commitFloatingPaste()) return { kind: "unavailable" };
      } else if (!core.drawing.runtime.gestures.finishStagedGesture()) {
        return { kind: "unavailable" };
      }
      break;
    case "discard-edit":
      if (state.inlineText) core.drawing.text.cancelInlineText();
      else if (state.floatingPaste) core.clipboard.cancelFloatingPaste();
      else core.cancelGesture();
      break;
    case "cancel":
      if (state.playing) {
        core.timeline.setPlaying(false);
        break;
      }
      if (state.inlineText) {
        core.drawing.text.cancelInlineText();
        break;
      }
      // MovingPixelsState drops pending pixels before the Cancel command;
      // DocView::onCancel then deselects. Undo/cancel-drag is a separate action.
      if (state.floatingPaste) {
        if (core.clipboard.commitFloatingPaste()) core.selection.deselect();
        break;
      }
      core.cancelGesture();
      // Plain Cancel routes through DocView::onCancel -> DeselectMask.
      // Text and an unfinished drawing loop keep their restoration semantics.
      if (!state.inlineText && !state.floatingPaste && !state.preview && state.document?.selection)
        core.selection.deselect();
      break;
    case "commit":
      if (state.inlineText) core.drawing.text.commitInlineText();
      else if (state.floatingPaste) core.clipboard.commitFloatingPaste();
      else core.timeline.setPlaying(!state.playing);
      break;
    case "new-layer":
      core.timeline.addLayer();
      break;
    case "new-layer-via-copy":
      if (!core.clipboard.newLayerViaSelection(false)) return { kind: "unavailable" };
      break;
    case "new-layer-via-cut":
      if (!core.clipboard.newLayerViaSelection(true)) return { kind: "unavailable" };
      break;
    case "previous-tag-frame":
      core.timeline.stepFrame(-1, true);
      break;
    case "next-tag-frame":
      core.timeline.stepFrame(1, true);
      break;
    case "new-frame":
      core.timeline.addFrame(true);
      break;
    case "duplicate-cels":
      core.timeline.duplicateCels(false);
      break;
    case "duplicate-linked-cels":
      core.timeline.duplicateCels(true);
      break;
    case "empty-frame":
      core.timeline.addFrame(false);
      break;
    case "delete-frame":
      core.timeline.deleteFrame();
      break;
    case "first-frame":
      core.timeline.selectFrame(0);
      break;
    case "last-frame":
      core.timeline.selectFrame((state.document?.timeline?.frames.length ?? 1) - 1);
      break;
    case "toggle-layer-visibility":
      core.timeline.setLayerVisible(!state.document?.layer.visible);
      break;
    case "zoom-in":
    case "zoom-out":
    case "zoom-to":
      core.canvas.zoomTo(
        command.type === "zoom-to"
          ? command.zoom
          : stepZoom(state.view.zoom, command.type === "zoom-in" ? 1 : -1),
        context.viewport,
        state.view.zoomFromCenterWithKeys ? undefined : context.zoomAnchor,
      );
      break;
    case "brush-grow":
    case "brush-shrink":
      core.drawing.settings.setSettings({
        brush: {
          ...state.settings.brush,
          size: state.settings.brush.size + (command.type === "brush-grow" ? 1 : -1),
        },
      });
      break;
    case "swap-colors":
      core.drawing.settings.setSettings({
        ...(state.settings.ink === AsepriteInk.Shading
          ? {
              shade: state.settings.shade?.slice().reverse(),
              shadeIndices: state.settings.shadeIndices?.slice().reverse(),
            }
          : {}),
        ...(state.settings.tilemapMode === TilemapDisplayMode.Tiles
          ? {
              selectedTile: state.settings.backgroundTile,
              backgroundTile: state.settings.selectedTile,
            }
          : {
              foreground: state.settings.background,
              background: state.settings.foreground,
              foregroundIndex: state.settings.backgroundIndex,
              backgroundIndex: state.settings.foregroundIndex,
            }),
      });
      break;
    case "toggle-grid":
      core.canvas.toggleDocumentViewOption(
        DocumentShowOption.Grid,
        context.scene === "home" ? DocumentViewTarget.Defaults : DocumentViewTarget.Document,
      );
      break;
    case "toggle-pixel-grid":
      core.canvas.toggleDocumentViewOption(
        DocumentShowOption.PixelGrid,
        context.scene === "home" ? DocumentViewTarget.Defaults : DocumentViewTarget.Document,
      );
      break;
    case "palette-previous":
    case "palette-next": {
      const index = core.color.stepPaletteColor(
        "foreground",
        command.type === "palette-next" ? 1 : -1,
      );
      return {
        kind: "handled",
        ...(index === null ? {} : { paletteIndex: index }),
      };
    }
    default:
      return { kind: "unavailable" };
  }
  return { kind: "handled" };
}
