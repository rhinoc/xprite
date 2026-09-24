import { useEditorManagerContext, useEditorFields } from "$/managers/editor/editor-state-manager";
import { editorSceneForTab } from "$/managers/editor/editor-ui-store";
import { useEditorSnapshot } from "$/managers/editor/use-editor-snapshot";
import {
  canConvertBackground,
  canExecuteEditorAction,
  canMergeDown,
  canOpenEffect,
  defaultPlaybackSettings,
  DocumentShowOption,
  DocumentViewTarget,
  EffectKind,
  FlipOrientation,
  layerEditable,
} from "@xprite/editor-core";
import type { SelectionModifier } from "@xprite/editor-core";
import type { PlaybackSettings } from "@xprite/editor-core";

export const MenuDocumentShowOption = Object.freeze({
  Grid: DocumentShowOption.Grid,
  PixelGrid: DocumentShowOption.PixelGrid,
  SelectionEdges: DocumentShowOption.SelectionEdges,
  Guides: DocumentShowOption.Guides,
  LayerEdges: DocumentShowOption.LayerEdges,
  Slices: DocumentShowOption.Slices,
  TileNumbers: DocumentShowOption.TileNumbers,
  BrushPreview: DocumentShowOption.BrushPreview,
});
export type MenuDocumentShowOption =
  (typeof MenuDocumentShowOption)[keyof typeof MenuDocumentShowOption];
export const MenuDocumentViewTarget = Object.freeze({
  Defaults: DocumentViewTarget.Defaults,
  Document: DocumentViewTarget.Document,
});
export type MenuDocumentViewTarget =
  (typeof MenuDocumentViewTarget)[keyof typeof MenuDocumentViewTarget];
export const MenuEffectKind = Object.freeze({
  ReplaceColor: EffectKind.ReplaceColor,
  HueSaturation: EffectKind.HueSaturation,
  BrightnessContrast: EffectKind.BrightnessContrast,
  Invert: EffectKind.Invert,
  Outline: EffectKind.Outline,
  MedianBlur: EffectKind.MedianBlur,
  ConvolutionMatrix: EffectKind.ConvolutionMatrix,
  ColorCurve: EffectKind.ColorCurve,
});
export type MenuEffectKind = (typeof MenuEffectKind)[keyof typeof MenuEffectKind];
export const MenuFlipOrientation = Object.freeze({
  Horizontal: FlipOrientation.Horizontal,
  Vertical: FlipOrientation.Vertical,
});
export type MenuFlipOrientation = (typeof MenuFlipOrientation)[keyof typeof MenuFlipOrientation];
export type MenuSelectionModifier = SelectionModifier;
type MenuViewOptions = {
  grid: boolean;
  pixelGrid: boolean;
  selectionEdges: boolean;
  guides: boolean;
  layerEdges: boolean;
  slices?: boolean;
  tileNumbers?: boolean;
  brushPreview: boolean;
};
interface MenuTimelineView {
  activeLayer: number;
  activeFrame: number;
  layers: readonly { id: string; kind?: string; flags: number }[];
  frames: readonly { cels: readonly unknown[] }[];
  range?: { frames: readonly number[] };
  colorDepth?: 8 | 16 | 32;
}
interface EditorMenuSnapshot {
  document: {
    selection?: { x: number; y: number; width: number; height: number } | null;
    layer: { visible: boolean; locked: boolean };
    timeline?: MenuTimelineView;
  } | null;
  view: MenuViewOptions & {
    snapToGrid?: boolean;
    tiledMode?: 0 | 1 | 2 | 3;
    onionSkin?: { active?: boolean };
    playback?: Partial<PlaybackSettings>;
  };
  defaultDocumentView: MenuViewOptions;
  settings: { symmetryEnabled?: boolean };
  canUndo: boolean;
  canRedo: boolean;
}

export function useEditorMenuModel() {
  const { core } = useEditorManagerContext();
  const editor = useEditorFields([
    "setTimelineInteractionPreferences",
    "tab",
    "timelineInteractionPreferences",
  ]);
  const source = useEditorSnapshot(core);
  const sourceDocument = source?.document;
  const sourceTimeline = sourceDocument?.timeline;
  const view: EditorMenuSnapshot["view"] = {
    grid: source?.view.grid ?? false,
    pixelGrid: source?.view.pixelGrid ?? false,
    selectionEdges: source?.view.selectionEdges ?? false,
    guides: source?.view.guides ?? false,
    layerEdges: source?.view.layerEdges ?? false,
    slices: source?.view.slices,
    tileNumbers: source?.view.tileNumbers,
    brushPreview: source?.view.brushPreview ?? false,
    snapToGrid: source?.view.snapToGrid,
    tiledMode: source?.view.tiledMode,
    onionSkin: source?.view.onionSkin,
    playback: source?.view.playback,
  };
  const defaultDocumentView: MenuViewOptions = {
    grid: source?.defaultDocumentView.grid ?? false,
    pixelGrid: source?.defaultDocumentView.pixelGrid ?? false,
    selectionEdges: source?.defaultDocumentView.selectionEdges ?? false,
    guides: source?.defaultDocumentView.guides ?? false,
    layerEdges: source?.defaultDocumentView.layerEdges ?? false,
    slices: source?.defaultDocumentView.slices,
    tileNumbers: source?.defaultDocumentView.tileNumbers,
    brushPreview: source?.defaultDocumentView.brushPreview ?? false,
  };
  const snapshot: EditorMenuSnapshot = {
    document: sourceDocument
      ? {
          selection: sourceDocument.selection,
          layer: {
            visible: sourceDocument.layer.visible,
            locked: sourceDocument.layer.locked,
          },
          timeline: sourceTimeline
            ? {
                activeLayer: sourceTimeline.activeLayer,
                activeFrame: sourceTimeline.activeFrame,
                layers: sourceTimeline.layers.map((layer) => ({
                  id: layer.id,
                  kind: layer.kind,
                  flags: layer.flags,
                })),
                frames: sourceTimeline.frames.map((frame) => ({ cels: frame.cels })),
                range: sourceTimeline.range ? { frames: sourceTimeline.range.frames } : undefined,
                colorDepth: sourceTimeline.colorDepth,
              }
            : undefined,
        }
      : null,
    view,
    defaultDocumentView,
    settings: { symmetryEnabled: source?.settings.symmetryEnabled },
    canUndo: source?.canUndo ?? false,
    canRedo: source?.canRedo ?? false,
  };
  const timeline = sourceTimeline;
  const commands = {
    selection: {
      fillSelection: () => core?.selection.fillSelection(),
      strokeSelection: () => core?.selection.strokeSelection(),
      selectCelContent: () => core?.selection.selectCelContent(),
      canSelectCelContent: () => !!core?.selection.canSelectCelContent(),
      reselect: () => core?.selection.reselect(),
      canReselect: () => !!core?.selection.canReselect(),
      canColorRange: () => !!core?.selection.canColorRange(),
      selectAll: () => core?.selection.selectAll(),
      invert: () => core?.selection.invert(),
      clearSelectionPixels: () =>
        core?.selection.clearSelectionPixels(source?.settings.selectionKeepAfterClear ?? false),
      deselect: () => core?.selection.deselect(),
      flipSelection: (orientation: MenuFlipOrientation) =>
        core?.selection.flipSelection(orientation),
      rotateSelection: (angle: number) => core?.selection.rotateSelection(angle),
      canRotateSelection: () => !!core?.selection.canRotateSelection(),
      shiftSelectionContents: (x: number, y: number) =>
        core?.selection.shiftSelectionContents(x, y),
      canShiftSelectionContents: () => !!core?.selection.canShiftSelectionContents(),
    },
    imageEditing: {
      cropSprite: () => core?.imageEditing.cropSprite(),
      trimSprite: () => core?.imageEditing.trimSprite(),
      flipCanvas: (orientation: MenuFlipOrientation) => core?.imageEditing.flipCanvas(orientation),
      rotateCanvas: (angle: 90 | -90 | 180) => core?.imageEditing.rotateCanvas(angle),
      convertColorMode: (depth: 8 | 16 | 32, options?: unknown) =>
        core?.imageEditing.convertColorMode(depth, options as never),
    },
    timeline: {
      duplicateLayer: () => core?.timeline.duplicateLayer(),
      mergeDown: () => core?.timeline.mergeDown(),
      flattenLayers: (visibleOnly: boolean) => core?.timeline.flattenLayers(visibleOnly),
      setLayerCollapsed: (collapsed: boolean) => core?.timeline.setLayerCollapsed(collapsed),
      toggleActiveGroup: () => {
        const layer = timeline?.layers[timeline.activeLayer];
        if (layer) core?.timeline.setLayerCollapsed(!(layer.flags & 32));
      },
      deleteLayer: () => core?.timeline.deleteLayer(),
      addLayer: () => core?.timeline.addLayer(),
      addFrame: (duplicate: boolean) => core?.timeline.addFrame(duplicate),
      deleteFrame: () => core?.timeline.deleteFrame(),
      stepFrame: (delta: -1 | 1, withinTag = false) => core?.timeline.stepFrame(delta, withinTag),
      setLayerVisible: (visible: boolean) => core?.timeline.setLayerVisible(visible),
      setLayerLocked: (locked: boolean) => core?.timeline.setLayerLocked(locked),
      reverseFrames: () => core?.timeline.reverseFrames(),
      duplicateCels: (linked: boolean) => core?.timeline.duplicateCels(linked),
      setPlaybackOptions: (settings: Partial<PlaybackSettings>) => {
        core?.timeline.setPlaybackOptions(settings);
        if (settings.rewindOnStop !== undefined)
          editor.setTimelineInteractionPreferences({
            ...editor.timelineInteractionPreferences,
            rewindOnStop: settings.rewindOnStop,
          });
      },
      goToTagBoundary: (last: boolean) => core?.timeline.goToTagBoundary(last),
      setLoopSection: () => core?.timeline.setLoopSection(),
      setOnionSkin: (settings: { active: boolean }) => core?.timeline.setOnionSkin(settings),
      addGroup: () => core?.timeline.addGroup(),
    },
    history: { undo: () => core?.history.undo(), redo: () => core?.history.redo() },
    canvas: {
      setGridBounds: (bounds: { x: number; y: number; width: number; height: number }) =>
        core?.canvas.setGridBounds(bounds),
      setDocumentViewOptions: (options: Record<string, unknown>) =>
        core?.canvas.setDocumentViewOptions(options as never),
      toggleDocumentViewOption: (option: MenuDocumentShowOption, target: MenuDocumentViewTarget) =>
        core?.canvas.toggleDocumentViewOption(option, target),
    },
    drawing: {
      setSymmetryEnabled: (enabled: boolean) =>
        core?.drawing.settings.setSettings({ symmetryEnabled: enabled }),
    },
    tilemap: {
      convertLayerTilemap: (convert: boolean) => core?.tilemap.convertLayerTilemap(convert),
    },
    sprite: {
      convertLayerBackground: (background: boolean) =>
        core?.sprite.convertLayerBackground(background),
    },
    clipboard: {
      newLayerViaSelection: (cut: boolean) => core?.clipboard.newLayerViaSelection(cut),
    },
  };
  const playback = { ...defaultPlaybackSettings, ...source?.view.playback };
  return {
    snapshot,
    commands,
    playback,
    activeGroupCollapsed: !!(
      timeline?.layers[timeline.activeLayer]?.flags &&
      timeline.layers[timeline.activeLayer].flags & 32
    ),
    can: (action: string) =>
      !!core &&
      !!source &&
      canExecuteEditorAction(action as never, source, editorSceneForTab(editor.tab)),
    canOpenEffect: () => !!core && canOpenEffect(core.getSnapshot().document),
    canMergeDown: () => !!timeline && canMergeDown(timeline),
    canConvertBackground: (background: boolean) =>
      !!timeline && canConvertBackground(timeline, background),
    canEditLayer: (index: number) => !!timeline && layerEditable(timeline, index),
  };
}
