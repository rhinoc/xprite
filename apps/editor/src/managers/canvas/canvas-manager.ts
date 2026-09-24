import { useCallback, useMemo, useSyncExternalStore } from "react";

import { workingColorProfile } from "@xprite/editor-core/color";
export { cursorPreviewGeometry, cursorPreviewRaster } from "$/managers/canvas/cursor-preview";
export { rasterUploadLayout, canOffsetRaster } from "$/managers/canvas/raster-upload-layout";
import type { StoreApi } from "zustand/vanilla";

import { executeEditorCommand, stepAsepriteZoom } from "$/managers/canvas/canvas-presentation";
import type { SampledColor } from "$/managers/colors/color-sources";
import { useEditorManagerContext } from "$/managers/editor/editor-state-manager";
import type { EditorUiState } from "$/managers/editor/editor-ui-store";
import { useEditorSnapshot } from "$/managers/editor/use-editor-snapshot";
import { useCanvasInputController } from "$/managers/input/canvas-input-context";
import { CanvasBrushSizeDrag } from "$/managers/input/controllers/brush-size-drag";
import {
  CanvasHistoryGestureController,
  TouchHistoryAction,
} from "$/managers/input/controllers/history-gesture";
import { CanvasPointerController } from "$/managers/input/controllers/pointer-controller";
export { CanvasZoomGesture } from "$/managers/input/controllers/zoom-gesture";
import type { ModifierKeys } from "$/managers/input/policies/action-modifiers";
import {
  type CanvasQuickTool,
  resolveCanvasQuickTool,
  type CanvasQuickToolContext,
} from "$/managers/input/policies/quick-tool";
export type { CanvasQuickTool } from "$/managers/input/policies/quick-tool";
export { EditorToolId as CanvasToolId } from "@xprite/editor-core";
export { CanvasPointerTarget } from "$/managers/input/controllers/pointer-controller";
export { resolveCanvasPointerTarget } from "$/managers/input/policies/canvas-pointer-target";
export { CanvasPinchZoomController } from "$/managers/input/controllers/pinch-zoom";
import { StagedTouchIntent } from "$/managers/input/controllers/staged-touch";
import {
  createTouchContact,
  touchTapStart,
  updateTouchContact,
  type TouchContact,
} from "$/managers/input/controllers/touch-contact";
import { canvasAutoScroll } from "$/managers/input/policies/auto-scroll";
import { cursorNeedsWhite, usesBrushBoundaryCursor } from "$/managers/input/policies/cursor-policy";
export { resolvePointerActionModifiers } from "$/managers/input/policies/action-modifiers";
import { useEditorPlatformPorts } from "$/managers/platform/editor-platform-context";
import type { CanvasPointerSample, EditorFontPort } from "$/managers/ports/platform";
import { EditorPrimaryModifier } from "$/managers/ports/platform";
import type {
  ShortcutManager,
  ResolvedShortcutDragAction,
} from "$/managers/shortcuts/shortcut-manager";
import { editorTextFontOptions } from "$/managers/tools/text-font";
import {
  editorCanvasBounds,
  measuredEditorViewport,
  setMeasuredEditorViewport,
} from "$/managers/workspace/editor-layout";
import { useEditorRuntimeManagerContext } from "$/managers/workspace/editor-runtime-context";
import {
  projectTiledPixel,
  renderTimelineViewport,
  samplePixel,
  isSelectionTool,
  maskContains,
  SelectionMode,
  selectionModeForInput,
  type ShortcutInput,
  type Point,
  type PointerActionModifiers,
} from "@xprite/editor-core";

const noSubscribe = () => () => {};
const identities = new WeakMap<object, number>();
let nextIdentity = 1;

function identityOf(source: object | null) {
  if (!source) return null;
  let identity = identities.get(source);
  if (identity === undefined) {
    identity = nextIdentity++;
    identities.set(source, identity);
  }
  return identity;
}

type EditorCore = NonNullable<ReturnType<typeof useEditorManagerContext>["core"]>;

export interface CanvasShortcutDrag {
  actions: readonly ResolvedShortcutDragAction[];
  gesture: CanvasBrushSizeDrag;
}

const heldShortcutInput = (keys: ModifierKeys, space: boolean): ShortcutInput => ({
  key: "",
  ctrl: keys.ctrlKey,
  meta: keys.metaKey,
  alt: keys.altKey,
  shift: keys.shiftKey,
  space,
});

function createCanvasCommands(
  core: EditorCore,
  uiStore: StoreApi<EditorUiState>,
  fontPort?: EditorFontPort,
  primaryModifier = EditorPrimaryModifier.Control,
  shortcuts?: ShortcutManager,
) {
  const setQuickTool = (tool: CanvasQuickTool | null) => {
    core.drawing.settings.setQuickTool(tool);
    uiStore.getState().setQuickTool(tool);
    if (!tool) uiStore.getState().setAutoSelectLayerModifier(false);
  };
  return {
    getDrawingDiagnostics() {
      try {
        const state = core.getSnapshot();
        const gesture = core.drawing.runtime.gestures.getGestureState();
        const layer = state.document?.layer;
        const point = state.pointer;
        const local =
          layer && point
            ? { x: Math.floor(point.x - layer.x), y: Math.floor(point.y - layer.y) }
            : null;
        return {
          gesture: gesture
            ? {
                tool: gesture.tool,
                painted: gesture.painted,
                wrotePixels: !!gesture.wrotePixels,
                coverageSize: gesture.coverage.size,
                firstPoint: gesture.points[0],
                lastPoint: gesture.points[gesture.points.length - 1],
              }
            : null,
          pointer: point,
          layerRaster: layer
            ? { x: layer.x, y: layer.y, width: layer.pixels.width, height: layer.pixels.height }
            : null,
          pointerColor:
            layer &&
            local &&
            local.x >= 0 &&
            local.y >= 0 &&
            local.x < layer.pixels.width &&
            local.y < layer.pixels.height
              ? samplePixel(layer.pixels, local)
              : null,
        };
      } catch (error) {
        // Diagnostic observations must not interrupt the pointer or paint path.
        return { error: error instanceof Error ? error.message : String(error) };
      }
    },
    sampleCompositeColor(at: { x: number; y: number }): SampledColor | null {
      const snapshot = core.getSnapshot();
      const document = snapshot.document;
      if (!document) return null;
      const point = projectTiledPixel(at.x, at.y, {
        mode: snapshot.view.tiledMode ?? 0,
        width: document.width,
        height: document.height,
        origin: { x: 0, y: 0 },
      });
      const timeline = document.timeline;
      const color = timeline
        ? samplePixel(
            renderTimelineViewport(timeline, {
              x: point.x,
              y: point.y,
              width: 1,
              height: 1,
              zoom: 1,
            }),
            { x: 0, y: 0 },
          )
        : samplePixel(core.canvas.composite(), point);
      return { color, profile: workingColorProfile(timeline) };
    },
    setQuickTool,
    updateQuickTool(
      keys: ModifierKeys,
      actions: PointerActionModifiers,
      context: CanvasQuickToolContext,
    ) {
      const tool = resolveCanvasQuickTool(
        core.getSnapshot(),
        keys,
        actions,
        primaryModifier,
        context,
        uiStore.getState().quickTool,
        shortcuts,
      );
      setQuickTool(tool);
      if (!context.pointerActive)
        uiStore.getState().setAutoSelectLayerModifier(!!actions.autoSelectLayer && context.inside);
      return tool;
    },
    beginShortcutDrag(
      keys: ModifierKeys,
      space: boolean,
      origin: Point,
    ): CanvasShortcutDrag | null {
      const state = core.getSnapshot();
      if (
        !state.document ||
        state.preview ||
        state.inlineText ||
        state.floatingPaste ||
        state.selectionTransform ||
        isSelectionTool(state.settings.tool)
      )
        return null;
      const actions = shortcuts?.resolveDragActions(heldShortcutInput(keys, space)) ?? [];
      return actions.length
        ? {
            actions,
            gesture: new CanvasBrushSizeDrag(
              origin,
              state.settings.brush.size,
              actions.map((action) => action.vector),
            ),
          }
        : null;
    },
    updateShortcutDrag(drag: CanvasShortcutDrag, point: Point) {
      const size = drag.gesture.move(point);
      const settings = core.drawing.settings.getSettings();
      if (settings.brush.size !== size)
        core.drawing.settings.setSettings({ brush: { ...settings.brush, size } });
    },
    isShortcutDragPressed(drag: CanvasShortcutDrag, keys: ModifierKeys, space: boolean) {
      return drag.actions.every((action) =>
        shortcuts?.isDragActionPressed(action, heldShortcutInput(keys, space)),
      );
    },
    previewComposite: (...args: Parameters<typeof core.canvas.previewComposite>) =>
      core.canvas.previewComposite(...args),
    previewRaster: (allowOffsetRaster = true) => core.canvas.previewRaster(allowOffsetRaster),
    setView: (...args: Parameters<typeof core.canvas.setView>) => core.canvas.setView(...args),
    zoomTo: (...args: Parameters<typeof core.canvas.zoomTo>) => core.canvas.zoomTo(...args),
    colorAt: (...args: Parameters<typeof core.drawing.eyedropper.colorAt>) =>
      core.drawing.eyedropper.colorAt(...args),
    pickTouchColor(at: { x: number; y: number }) {
      const document = core.getSnapshot().document;
      if (!document || at.x < 0 || at.y < 0 || at.x >= document.width || at.y >= document.height)
        return null;
      const pixel = { x: Math.floor(at.x), y: Math.floor(at.y) };
      const color = core.drawing.eyedropper.colorAt(pixel);
      if (!color) return null;
      core.drawing.settings.setSettings({ foreground: color });
      return { pixel, color };
    },
    updateDrawingSettings: (...args: Parameters<typeof core.drawing.settings.setSettings>) =>
      core.drawing.settings.setSettings(...args),
    cancelInlineText: () => core.drawing.text.cancelInlineText(),
    commitInlineText: () => core.drawing.text.commitInlineText(),
    updateInlineText: (patch: Parameters<typeof core.drawing.text.updateInlineText>[0]) => {
      const snapshot = core.getSnapshot(),
        settings = snapshot.settings,
        text = patch.text ?? snapshot.inlineText?.text ?? settings.text;
      if (fontPort) {
        try {
          const options = editorTextFontOptions(settings);
          const font = fontPort.rasterize(snapshot.view.appearance, text, options);
          core.drawing.settings.setSettings({
            font,
            text,
            textFontSize: options.size,
            textScale: 1,
          });
        } catch {
          /* Keep the current editable draft if browser font rasterization fails. */
        }
      }
      return core.drawing.text.updateInlineText(patch);
    },
    cancelGesture: () => core.cancelGesture(),
    canOpenSliceContextMenu(): boolean {
      const gesture = core.sprite.slices.getGestureState();
      return !gesture || (gesture.mode === "move" && !gesture.moved);
    },
    cancelPointerGesture: () => core.cancelPointerGesture(),
    clearPointer: () => core.clearPointer(),
    finishInterruptedGesture: () => core.finishInterruptedGesture(),
    undo: () => core.history.undo(),
    redo: () => core.history.redo(),
    traverseTouchHistory(action: TouchHistoryAction): boolean {
      const state = core.getSnapshot();
      // Gestures over the canvas must preserve editable drafts. Explicit
      // history commands retain their existing cancellation semantics.
      if (state.floatingPaste || state.inlineText || state.selectionTransform || state.preview)
        return false;
      if (action === TouchHistoryAction.Undo) {
        if (!state.canUndo) return false;
        core.history.undo();
      } else {
        if (!state.canRedo) return false;
        core.history.redo();
      }
      return true;
    },
    pointerDown: (input: Parameters<typeof core.pointerDown>[0]) =>
      core.pointerDown({ ...input, timelineRangeVisible: uiStore.getState().timelineVisible }),
    resolvePointerTool: (...args: Parameters<typeof core.resolvePointerTool>) =>
      core.resolvePointerTool(...args),
    pointerMove: (...args: Parameters<typeof core.pointerMove>) => core.pointerMove(...args),
    pointerUp: (...args: Parameters<typeof core.pointerUp>) => core.pointerUp(...args),
    finishNavigationTap: (input: Parameters<typeof core.pointerDown>[0]) => {
      const state = core.getSnapshot();
      const selection = state.document?.selection;
      const tool = core.resolvePointerTool(input) ?? state.settings.tool;
      const mode = selectionModeForInput(
        state.settings.selectionMode ?? SelectionMode.Replace,
        input,
      );
      if (
        !selection ||
        input.space ||
        state.preview ||
        state.inlineText ||
        state.floatingPaste ||
        !isSelectionTool(tool) ||
        tool === "magic_wand" ||
        tool === "polygonal_lasso" ||
        (mode !== SelectionMode.Replace && mode !== SelectionMode.Intersect) ||
        maskContains(selection, { x: Math.floor(input.x), y: Math.floor(input.y) })
      )
        return false;
      // Use the selection click path so transform commits and mask history
      // match drawing mode, while a navigation drag never starts an edit.
      core.pointerDown(input);
      core.pointerUp(input);
      return !core.getSnapshot().document?.selection;
    },
    beginSelectionTransform: (...args: Parameters<typeof core.selection.beginTransform>) =>
      core.selection.beginTransform(...args),
    previewSelection: (...args: Parameters<typeof core.selection.preview>) =>
      core.selection.preview(...args),
    deleteSelectedSlices: () => core.sprite.slices.deleteSelectedSlices(),
    deleteSlices: (...args: Parameters<typeof core.sprite.slices.deleteSlices>) =>
      core.sprite.slices.deleteSlices(...args),
    duplicateSlices: (...args: Parameters<typeof core.sprite.slices.duplicateSlices>) =>
      core.sprite.slices.duplicateSlices(...args),
    editSliceProperties: (...args: Parameters<typeof core.sprite.slices.editSliceProperties>) =>
      core.sprite.slices.editSliceProperties(...args),
    editSlicesProperties: (...args: Parameters<typeof core.sprite.slices.editSlicesProperties>) =>
      core.sprite.slices.editSlicesProperties(...args),
    selectSlice: (...args: Parameters<typeof core.sprite.slices.selectSlice>) =>
      core.sprite.slices.selectSlice(...args),
    selectFrame: (...args: Parameters<typeof core.timeline.selectFrame>) =>
      core.timeline.selectFrame(...args),
    setPlaying: (...args: Parameters<typeof core.timeline.setPlaying>) =>
      core.timeline.setPlaying(...args),
    executeCommand: (
      command: Parameters<typeof executeEditorCommand>[1],
      context: Parameters<typeof executeEditorCommand>[2],
    ) => executeEditorCommand(core, command, context),
  };
}

export {
  canvasAutoScroll,
  cursorNeedsWhite,
  usesBrushBoundaryCursor,
  stepAsepriteZoom,
  CanvasPointerController,
  CanvasHistoryGestureController,
  StagedTouchIntent,
  createTouchContact,
  touchTapStart,
  updateTouchContact,
  useCanvasInputController,
};
export type { CanvasPointerSample, TouchContact };

/** Canvas-facing editor selectors and commands; the core instance stays inside managers. */
export function useCanvasManager(includePan = true) {
  const { core, uiStore } = useEditorManagerContext();
  const { workspace } = useEditorRuntimeManagerContext();
  const platform = useEditorPlatformPorts();
  const input = platform?.canvasInput ?? null;
  const snapshot = useEditorSnapshot(core, includePan);
  const displayPreferences = useSyncExternalStore(
    workspace.subscribe,
    workspace.getCanvasDisplayPreferences,
    workspace.getCanvasDisplayPreferences,
  );
  const cursorPreferences = useSyncExternalStore(
    workspace.subscribe,
    workspace.getCursorPreferences,
    workspace.getCursorPreferences,
  );
  const commands = useMemo(
    () =>
      core
        ? createCanvasCommands(
            core,
            uiStore,
            platform?.font,
            platform?.input.primaryModifier,
            workspace.shortcuts,
          )
        : null,
    [core, uiStore, platform?.font, platform?.input.primaryModifier, workspace],
  );
  const referenceCache = useMemo(
    () => platform?.canvasRendering.createReferenceCache() ?? null,
    [platform?.canvasRendering],
  );
  const subscribe = useCallback(
    (listener: () => void) => core?.subscribe(listener) ?? (() => {}),
    [core],
  );
  const getSnapshot = useCallback(() => {
    if (!core) throw new Error("Canvas snapshot requested without an active editor");
    return { ...core.getSnapshot(), settings: core.drawing.settings.getInputSettings() };
  }, [core]);
  const drawReferenceViewport = useCallback(
    (
      context: CanvasRenderingContext2D,
      origin: { x: number; y: number },
      viewport: { width: number; height: number },
      backingScale: number,
    ) => {
      if (!core || !referenceCache) return false;
      return referenceCache.draw(
        context,
        core.getSnapshot(),
        (clip) => core.canvas.previewViewport(clip),
        origin,
        viewport,
        backingScale,
      );
    },
    [core, referenceCache],
  );
  const clearReferenceViewport = useCallback(() => referenceCache?.clear(), [referenceCache]);
  const measureViewport = useCallback(
    (bounds: { width: number; height: number }) => {
      if (!core) return false;
      setMeasuredEditorViewport(core, bounds);
      return workspace.initializeDocumentViewport(
        core,
        measuredEditorViewport(core, uiStore.getState().timelineVisible),
      );
    },
    [core, uiStore, workspace],
  );
  return {
    active: core !== null,
    identity: identityOf(core),
    snapshot,
    displayPreferences,
    cursorPreferences,
    getSnapshot,
    subscribe,
    commands,
    input,
    drawReferenceViewport,
    clearReferenceViewport,
    measureViewport,
    editorCanvasBounds,
  };
}

/** Small React selectors for the text editor and selected slice controls. */
export function useCanvasOverlayState() {
  const { core } = useEditorManagerContext();
  const subscribe = core?.subscribe.bind(core) ?? noSubscribe;
  const getInlineText = () => core?.getSnapshot().inlineText ?? null;
  const getSelectedSliceIds = () => core?.getSnapshot().selectedSliceIds ?? [];
  const inlineText = useSyncExternalStore(subscribe, getInlineText, getInlineText);
  const selectedSliceIds = useSyncExternalStore(
    subscribe,
    getSelectedSliceIds,
    getSelectedSliceIds,
  );
  return {
    inlineText,
    selectedSliceIds,
    snapshot: core?.getSnapshot() ?? null,
  };
}
