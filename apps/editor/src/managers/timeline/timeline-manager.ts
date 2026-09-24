import { useCallback, useMemo, useSyncExternalStore } from "react";

import { useEditorManagerContext } from "$/managers/editor/editor-state-manager";
import { useEditorSnapshot } from "$/managers/editor/use-editor-snapshot";
import {
  useWheelInput,
  EditorWheelSurface,
  wheelScalarDelta,
} from "$/managers/input/use-wheel-input";
import { EditorWheelAction, type EditorWheelDecision } from "$/managers/ports/platform";
import type { PixelBuffer, TimelineRange } from "$/managers/timeline/timeline-presentation";
import { useOptionalEditorRuntimeManagerContext } from "$/managers/workspace/editor-runtime-context";
import { MAX_TIMELINE_LAYERS } from "@xprite/editor-core/timeline";

const subscribeEmptyClipboard = () => () => {};
const emptyClipboardVersion = () => 0;
const TIMELINE_MIN_ZOOM = 1;
const TIMELINE_MAX_ZOOM = 10;
const TIMELINE_PRECISE_ZOOM_DISTANCE = 60;

type EditorCore = NonNullable<ReturnType<typeof useEditorManagerContext>["core"]>;
export type TimelineSnapshot = ReturnType<EditorCore["getSnapshot"]>;
const identities = new WeakMap<object, number>();
let nextIdentity = 1;

function identityOf(core: object | null) {
  if (!core) return null;
  let id = identities.get(core);
  if (id === undefined) {
    id = nextIdentity++;
    identities.set(core, id);
  }
  return id;
}

function createTimelineCommands(core: EditorCore | null) {
  return {
    runRangeAction: (range: TimelineRange | null | undefined, action: () => void) => {
      if (!core) return;
      // A popup restores focus before invoking its action. Reapply its captured
      // command target without keeping another copy of canonical selection.
      if (range) core.timeline.setTimelineRange(range);
      action();
    },
    selectFrame: (...args: Parameters<EditorCore["timeline"]["selectFrame"]>) =>
      core?.timeline.selectFrame(...args),
    selectLayer: (...args: Parameters<EditorCore["timeline"]["selectLayer"]>) =>
      core?.timeline.selectLayer(...args),
    stepFrame: (...args: Parameters<EditorCore["timeline"]["stepFrame"]>) =>
      core?.timeline.stepFrame(...args),
    setTimelineRange: (...args: Parameters<EditorCore["timeline"]["setTimelineRange"]>) =>
      core?.timeline.setTimelineRange(...args),
    reorderLayer: (...args: Parameters<EditorCore["timeline"]["reorderLayer"]>) =>
      core?.timeline.reorderLayer(...args),
    transferTimelineRange: (...args: Parameters<EditorCore["timeline"]["transferTimelineRange"]>) =>
      core?.timeline.transferTimelineRange(...args),
    dropTimelineLayers: (...args: Parameters<EditorCore["timeline"]["dropTimelineLayers"]>) =>
      core?.timeline.dropTimelineLayers(...args),
    clearTimelineRange: (...args: Parameters<EditorCore["timeline"]["clearTimelineRange"]>) =>
      core?.timeline.clearTimelineRange(...args),
    duplicateCels: (...args: Parameters<EditorCore["timeline"]["duplicateCels"]>) =>
      core?.timeline.duplicateCels(...args),
    canAddLayer: () => {
      const timeline = core?.getSnapshot().document?.timeline;
      return !!timeline && timeline.layers.length < MAX_TIMELINE_LAYERS;
    },
    addLayer: () => core?.timeline.addLayer(),
    addGroup: () => core?.timeline.addGroup(),
    canAddTilemapLayer: () => Boolean(core?.tilemap?.addTilemapLayer),
    canConvertLayerTilemap: () => Boolean(core?.tilemap?.convertLayerTilemap),
    convertLayerTilemap: (background: boolean) => core?.tilemap?.convertLayerTilemap?.(background),
    convertLayerBackground: (background: boolean) =>
      core?.sprite?.convertLayerBackground?.(background),
    duplicateLayer: () => core?.timeline.duplicateLayer(),
    mergeDown: () => core?.timeline.mergeDown(),
    flattenLayers: (visibleOnly: boolean) => core?.timeline.flattenLayers(visibleOnly),
    unlinkCels: (...args: Parameters<EditorCore["timeline"]["unlinkCels"]>) =>
      core?.timeline.unlinkCels(...args),
    linkCels: (...args: Parameters<EditorCore["timeline"]["linkCels"]>) =>
      core?.timeline.linkCels(...args),
    addFrame: (...args: Parameters<EditorCore["timeline"]["addFrame"]>) =>
      core?.timeline.addFrame(...args),
    setLayerVisible: (...args: Parameters<EditorCore["timeline"]["setLayerVisible"]>) =>
      core?.timeline.setLayerVisible(...args),
    setLayerLocked: (...args: Parameters<EditorCore["timeline"]["setLayerLocked"]>) =>
      core?.timeline.setLayerLocked(...args),
    setLayerContinuous: (...args: Parameters<EditorCore["timeline"]["setLayerContinuous"]>) =>
      core?.timeline.setLayerContinuous(...args),
    setLayerCollapsed: (...args: Parameters<EditorCore["timeline"]["setLayerCollapsed"]>) =>
      core?.timeline.setLayerCollapsed(...args),
    setAllLayersVisible: (...args: Parameters<EditorCore["timeline"]["setAllLayersVisible"]>) =>
      core?.timeline.setAllLayersVisible(...args),
    setAllLayersLocked: (...args: Parameters<EditorCore["timeline"]["setAllLayersLocked"]>) =>
      core?.timeline.setAllLayersLocked(...args),
    setAllLayersContinuous: (
      ...args: Parameters<EditorCore["timeline"]["setAllLayersContinuous"]>
    ) => core?.timeline.setAllLayersContinuous(...args),
    setOnionSkin: (...args: Parameters<EditorCore["timeline"]["setOnionSkin"]>) =>
      core?.timeline.setOnionSkin(...args),
    setPlaybackOptions: (...args: Parameters<EditorCore["timeline"]["setPlaybackOptions"]>) =>
      core?.timeline.setPlaybackOptions(...args),
    setFrameDuration: (...args: Parameters<EditorCore["timeline"]["setFrameDuration"]>) =>
      core?.timeline.setFrameDuration(...args),
    reverseFrames: () => core?.timeline.reverseFrames(),
    setLoopSection: () => core?.timeline.setLoopSection(),
    setAnimationTag: (...args: Parameters<EditorCore["timeline"]["setAnimationTag"]>) =>
      core?.timeline.setAnimationTag(...args),
    setLayerProperties: (...args: Parameters<EditorCore["timeline"]["setLayerProperties"]>) =>
      core?.timeline.setLayerProperties(...args),
    addReferenceLayer: (pixels: PixelBuffer) => core?.sprite.addReferenceLayer(pixels),
  };
}

/** Timeline selectors and use-case commands; editor-core remains inside the manager. */
export function useTimelineManager(includePan = false) {
  const { core } = useEditorManagerContext();
  const runtime = useOptionalEditorRuntimeManagerContext();
  const clipboard = runtime?.workspace.clipboard;
  useSyncExternalStore(
    clipboard?.subscribe ?? subscribeEmptyClipboard,
    clipboard?.getVersion ?? emptyClipboardVersion,
    clipboard?.getVersion ?? emptyClipboardVersion,
  );
  const { resolve } = useWheelInput();
  const resolveWheelInput = useCallback(
    (event: WheelEvent) => resolve(event, EditorWheelSurface.Timeline),
    [resolve],
  );
  const wheelZoom = useCallback((input: EditorWheelDecision, currentZoom: number) => {
    const delta = wheelScalarDelta(input, { x: input.x, y: input.y });
    const amount = input.precise
      ? Math.max(-1, Math.min(1, delta / TIMELINE_PRECISE_ZOOM_DISTANCE))
      : Math.sign(delta);
    return Math.max(
      TIMELINE_MIN_ZOOM,
      Math.min(
        TIMELINE_MAX_ZOOM,
        input.precise ? currentZoom - amount : Math.round(currentZoom - amount),
      ),
    );
  }, []);
  const snapshot = useEditorSnapshot(core, includePan);
  const commands = useMemo(() => createTimelineCommands(core), [core]);
  const getSnapshot = useCallback(() => core?.getSnapshot() ?? null, [core]);
  const dismissCopiedRange = useCallback(() => clipboard?.dismissTimelineCopyRange(), [clipboard]);
  return {
    active: core !== null,
    identity: identityOf(core),
    snapshot,
    copiedRange: clipboard?.getTimelineCopyRange(core),
    dismissCopiedRange,
    wheelZoom,
    resolveWheelInput,
    getSnapshot,
    runRangeAction: commands.runRangeAction,
    commands,
  };
}

export { EditorWheelAction as TimelineWheelAction };
