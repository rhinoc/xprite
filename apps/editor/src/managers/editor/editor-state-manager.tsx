import {
  createContext,
  useCallback,
  useContext,
  useEffect,
  useInsertionEffect,
  useLayoutEffect,
  useMemo,
  useRef,
  useState,
  useSyncExternalStore,
  type ReactNode,
} from "react";
import { useStore } from "zustand";
import type { StoreApi } from "zustand/vanilla";

import { createColorHoverStore } from "$/managers/colors/color-hover-store";
import { EditorStateSource, sameEditorFields } from "$/managers/editor/editor-state-source";
import {
  createEditorUiStore,
  type EditorTab,
  type EditorUiState,
} from "$/managers/editor/editor-ui-store";
import { useEditorSnapshot, EditorSnapshotScope } from "$/managers/editor/use-editor-snapshot";
import { useAsepriteInkSettings } from "$/managers/editor/use-ink-settings";
import { useEditorPlatformPorts } from "$/managers/platform/editor-platform-context";
import {
  createDynamicsPreferences,
  getDynamicsSettings,
  updateDynamicsSettings,
  shareDynamicsSettings,
  type DynamicsSettings,
} from "$/managers/preferences/dynamics-state";
import { defaultSelectionPreferences } from "$/managers/preferences/selection-preferences";
import type { SelectionPreferences } from "$/managers/preferences/selection-preferences";
import {
  readTimelineDockPosition,
  TIMELINE_DOCK_POSITION_STORAGE_KEY,
  type TimelineDockPosition,
} from "$/managers/preferences/timeline-dock-position";
import { defaultTimelineInteractionPreferences } from "$/managers/preferences/timeline-interaction-preferences";
import type { TimelineInteractionPreferences } from "$/managers/preferences/timeline-interaction-preferences";
import {
  normalizeTimelinePanelPreferences,
  readTimelinePanelPreferences,
  writeTimelinePanelDefaults,
  writeTimelinePanelPreferences,
  type TimelinePanelPreferences,
  type TimelinePanelPreferencesPatch,
} from "$/managers/preferences/timeline-panel-preferences";
import type { DocumentWorkspace } from "$/managers/workspace/document-workspace";
import { measuredEditorViewport } from "$/managers/workspace/editor-layout";
import { useOptionalEditorRuntimeManagerContext } from "$/managers/workspace/editor-runtime-context";
import {
  appendMissingPaletteColor,
  MAX_PALETTE_COLORS,
  getXpriteToolCapabilities,
  hexToRgba,
  operatePalette,
  rgbaToHex,
  SelectionMode,
  GradientDither,
  GradientType,
  EditorToolId,
  EyedropperChannel,
  EyedropperSample,
  FillReference,
  AsepriteInk,
  DEFAULT_DYNAMICS_SETTINGS,
  supportsPixelPerfect,
  type BrushImage,
  type EditorTool as CoreTool,
  type AsepriteBrushShape,
  type AsepriteBrushValue,
  type PaletteOperation,
  type RasterEditor,
  type Rgba,
} from "@xprite/editor-core";
import { UINT8_MAX } from "@xprite/editor-core";

const editorTools = [
  EditorToolId.Marquee,
  EditorToolId.Pencil,
  EditorToolId.Eraser,
  EditorToolId.Eyedropper,
  EditorToolId.Zoom,
  EditorToolId.Move,
  EditorToolId.Bucket,
  EditorToolId.Line,
  EditorToolId.Rectangle,
  EditorToolId.Contour,
  EditorToolId.Blur,
  EditorToolId.Text,
  EditorToolId.EllipticalMarquee,
  EditorToolId.Lasso,
  EditorToolId.PolygonalLasso,
  EditorToolId.MagicWand,
  EditorToolId.Spray,
  EditorToolId.Hand,
  EditorToolId.Slice,
  EditorToolId.Gradient,
  EditorToolId.Curve,
  EditorToolId.FilledRectangle,
  EditorToolId.Ellipse,
  EditorToolId.FilledEllipse,
  EditorToolId.Polygon,
  EditorToolId.Jumble,
] as const;
export type EditorTool = CoreTool;
const EMPTY_INK_SHADE: readonly Rgba[] = [];

function paletteHex(value: readonly number[]) {
  const [r, g, b, a = UINT8_MAX] = value;
  return `#${[r, g, b, ...(a < UINT8_MAX ? [a] : [])]
    .map((channel) => channel.toString(16).padStart(2, "0"))
    .join("")
    .toUpperCase()}`;
}

/** Shared editor behavior, independent of document artwork and page layout. */
function usePreviewEditorState(
  activeTool: EditorTool | undefined,
  uiStore: StoreApi<EditorUiState>,
  activePalette?: readonly (readonly number[])[],
  activeInk?: AsepriteInk,
  activeCore?: RasterEditor | null,
  activeShade?: readonly Rgba[],
) {
  const [previewTool, setPreviewTool] = useState<EditorTool>("pencil");
  const setTool = (next: EditorTool) => {
    uiStore.getState().rememberToolChange(tool, next);
    uiStore.getState().setQuickTool(null);
    setPreviewTool(next);
  };
  const tool = activeTool ?? previewTool;
  const tilesetEditable = useStore(uiStore, (state) => state.tilesetEditable);
  const setTilesetEditable = useStore(uiStore, (state) => state.setTilesetEditable);
  const previousTool = useStore(uiStore, (state) => state.previousTool);
  const workingColorTarget = useStore(uiStore, (state) => state.workingColorTarget);
  const setWorkingColorTarget = useStore(uiStore, (state) => state.setWorkingColorTarget);
  const observedTool = useRef(tool);
  useEffect(() => {
    uiStore.getState().rememberToolChange(observedTool.current, tool);
    observedTool.current = tool;
  }, [tool, uiStore]);
  const [tolerance, setTolerance] = useState(0);
  const [sprayWidth, setSprayWidthState] = useState(16);
  const [spraySpeed, setSpraySpeedState] = useState(32);
  const setSprayWidth = (value: number) =>
    setSprayWidthState(Math.max(1, Math.min(32, Math.round(value))));
  const setSpraySpeed = (value: number) =>
    setSpraySpeedState(Math.max(1, Math.min(100, Math.round(value))));
  const [contiguous, setContiguous] = useState(true);
  const [fillReference, setFillReference] = useState<FillReference>(FillReference.ActiveLayer);
  const [selectionMode, setSelectionMode] = useState<SelectionMode>(SelectionMode.Replace);
  const [gradientType, setGradientType] = useState<GradientType>(GradientType.Linear);
  const [gradientDither, setGradientDither] = useState<GradientDither>(GradientDither.None);
  const [autoSelectLayer, setAutoSelectLayer] = useState(false);
  const [eyedropperChannel, setEyedropperChannel] = useState<EyedropperChannel>(
    EyedropperChannel.ColorAlpha,
  );
  const [eyedropperSample, setEyedropperSample] = useState<EyedropperSample>(
    EyedropperSample.AllLayers,
  );
  const inkSettings = useAsepriteInkSettings(tool, editorTools);
  const [dynamicsPreferences, setDynamicsPreferences] = useState(createDynamicsPreferences);
  const dynamics = getDynamicsSettings(dynamicsPreferences, tool);
  const setDynamics = (value: DynamicsSettings) =>
    setDynamicsPreferences((previous) => updateDynamicsSettings(previous, tool, value));
  const setSharedDynamics = (shared: boolean) =>
    setDynamicsPreferences((previous) => shareDynamicsSettings(previous, tool, shared));
  const [foreground, setForeground] = useState("#FFFFFF");
  const [background, setBackground] = useState("#000000");
  const [backgroundIndex, setBackgroundIndex] = useState<number | null>(null);
  const [paletteSelection, setPaletteSelectionState] = useState<number[]>([]);
  const paletteSelectionRef = useRef(paletteSelection);
  const getPaletteSelection = useCallback(() => paletteSelectionRef.current, []);
  const setPaletteSelection: typeof setPaletteSelectionState = useCallback((value) => {
    const next = typeof value === "function" ? value(paletteSelectionRef.current) : value;
    paletteSelectionRef.current = next;
    setPaletteSelectionState(next);
  }, []);
  const [paletteAscending, setPaletteAscending] = useState(true);
  const [paletteEditable, setPaletteEditableState] = useState(false);
  const setPaletteEditable = (value: boolean | ((previous: boolean) => boolean)) => {
    const editable = typeof value === "function" ? value(paletteEditable) : value;
    setPaletteEditableState(editable);
    if (!editable) setPaletteSelection([]);
  };
  const [paletteColors, setPaletteColors] = useState<readonly (readonly number[])[]>([]);
  const [paletteIndex, setPaletteIndex] = useState<number | null>(null);
  const [visible, setVisible] = useState(true);
  const [locked, setLocked] = useState(false);
  const [frame, setFrame] = useState(1);
  const [frameCount, setFrameCount] = useState(1);
  const frameCountRef = useRef(1);
  const [playing, setPlaying] = useState(false);
  const timelineVisible = useStore(uiStore, (state) => state.timelineVisible);
  const setTimelineVisible = useStore(uiStore, (state) => state.setTimelineVisible);
  const previewVisible = useStore(uiStore, (state) => state.previewVisible);
  const setPreviewVisible = useStore(uiStore, (state) => state.setPreviewVisible);
  const [zoom, setZoom] = useState(100);
  const tab = useStore(uiStore, (state) => state.tab);
  const setTab = useStore(uiStore, (state) => state.setTab);
  const openTabs = useStore(uiStore, (state) => state.openTabs);
  const openTab = useStore(uiStore, (state) => state.openTab);
  const closeTab = (closing: EditorTab) => {
    uiStore.getState().closeTab(closing);
    if (closing === "document") setPlaying(false);
  };
  const [brushSizes, setBrushSizes] = useState<Partial<Record<EditorTool, number>>>({});
  const [brushShapes, setBrushShapes] = useState<Partial<Record<EditorTool, AsepriteBrushShape>>>(
    {},
  );
  const [brushAngles, setBrushAngles] = useState<Partial<Record<EditorTool, number>>>({});
  const brushShape = brushShapes[tool] ?? "circle";
  const brushAngle = brushAngles[tool] ?? 0;
  const [brushImages, setBrushImages] = useState<Partial<Record<EditorTool, BrushImage>>>({});
  const brushImage = brushImages[tool];
  const setBrushImage = (image: BrushImage | undefined) =>
    setBrushImages((previous) => ({ ...previous, [tool]: image }));
  const setBrushShape = (shape: AsepriteBrushShape) => {
    setBrushShapes((previous) => ({ ...previous, [tool]: shape }));
    if (shape !== "image") setBrushImage(undefined);
  };
  const setBrushAngle = (angle: number) =>
    setBrushAngles((previous) => ({
      ...previous,
      [tool]: Math.max(-180, Math.min(180, Math.round(angle))),
    }));
  const brushSize = brushSizes[tool] ?? getXpriteToolCapabilities(tool).settings.defaultBrushSize;
  const setBrushSize = (value: number | ((current: number) => number)) =>
    setBrushSizes((previous) => {
      const current = previous[tool] ?? getXpriteToolCapabilities(tool).settings.defaultBrushSize;
      return {
        ...previous,
        [tool]: Math.max(1, Math.min(64, typeof value === "function" ? value(current) : value)),
      };
    });
  const [previewInkShade, setInkShadeState] = useState<readonly Rgba[]>([]);
  const inkShade = activeCore ? (activeShade ?? EMPTY_INK_SHADE) : previewInkShade;
  const explicitShade = useRef(false);
  const previousPaletteSelection = useRef(paletteSelection);
  const applyInkShade = useCallback(
    (value: readonly Rgba[]) => {
      if (activeCore)
        activeCore.drawing.settings.setSettings({
          shade: value,
          shadeIndices: value.map(
            (color) => (color as typeof color & { paletteIndex?: number }).paletteIndex ?? -1,
          ),
        });
      else setInkShadeState(value);
    },
    [activeCore],
  );
  const setInkShade = (value: readonly Rgba[]) => {
    explicitShade.current = true;
    applyInkShade(value);
  };
  const previousShadeVisible = useRef(false);
  // Functional palette is owned by core; the local bank belongs only to gallery/mockup.
  const shadePalette = activePalette ?? paletteColors;
  const previousShadePalette = useRef(shadePalette);
  useEffect(() => {
    const paletteChanged = previousPaletteSelection.current !== paletteSelection;
    const paletteColorsChanged = previousShadePalette.current !== shadePalette;
    previousPaletteSelection.current = paletteSelection;
    previousShadePalette.current = shadePalette;
    if (explicitShade.current && !paletteChanged) return;
    explicitShade.current = false;
    const shadeVisible =
      (activeInk ?? inkSettings.ink) === AsepriteInk.Shading &&
      getXpriteToolCapabilities(tool).settings.hasInk;
    if (
      shadeVisible &&
      (paletteChanged ||
        paletteColorsChanged ||
        (!previousShadeVisible.current && paletteSelection.length >= 2))
    ) {
      applyInkShade(
        [...paletteSelection]
          .sort((a, b) => a - b)
          .filter((index) => shadePalette[index])
          .map((index) => {
            const [r, g, b, a = UINT8_MAX] = shadePalette[index];
            return Object.assign([r, g, b, a] as Rgba, { paletteIndex: index });
          }),
      );
    }
    previousShadeVisible.current = shadeVisible;
  }, [activeInk, inkSettings.ink, tool, paletteSelection, shadePalette, applyInkShade]);
  const [pixelPerfectTools, setPixelPerfectTools] = useState<Partial<Record<EditorTool, boolean>>>(
    {},
  );
  const pixelPerfect = pixelPerfectTools[tool] ?? supportsPixelPerfect({ tool });
  const setPixelPerfect = (value: boolean | ((current: boolean) => boolean)) =>
    setPixelPerfectTools((previous) => ({
      ...previous,
      [tool]:
        typeof value === "function"
          ? value(previous[tool] ?? supportsPixelPerfect({ tool }))
          : value,
    }));
  const notice = useStore(uiStore, (state) => state.notice);
  const setNotice = useStore(uiStore, (state) => state.setNotice);
  const [colorHover] = useState(createColorHoverStore);
  const addFrame = () => {
    const count = Math.min(128, frameCountRef.current + 1);
    frameCountRef.current = count;
    setFrameCount(count);
    setFrame(count);
  };
  useEffect(() => {
    if (!playing) return;
    const timer = window.setInterval(() => setFrame((n) => (n % frameCount) + 1), 180);
    return () => window.clearInterval(timer);
  }, [playing, frameCount]);
  const applyPaletteOperation = (
    operation: PaletteOperation,
    indices: readonly number[] = getPaletteSelection(),
  ) => {
    const next = operatePalette(paletteColors, operation, paletteAscending, indices);
    setPaletteColors(next);
    if (paletteIndex !== null && next[paletteIndex]) setForeground(paletteHex(next[paletteIndex]));
    if (backgroundIndex !== null && next[backgroundIndex])
      setBackground(paletteHex(next[backgroundIndex]));
  };
  const stepPaletteColor = (target: "foreground" | "background", step: number) => {
    if (!paletteColors.length) return;
    const color = target === "foreground" ? foreground : background;
    const selected = target === "foreground" ? paletteIndex : backgroundIndex;
    const matching = paletteColors.findIndex(
      (value) => paletteHex(value).toLowerCase() === color.toLowerCase(),
    );
    const index = Math.max(
      0,
      Math.min(paletteColors.length - 1, (selected ?? Math.max(0, matching)) + step),
    );
    if (target === "foreground") {
      setPaletteIndex(index);
      setForeground(paletteHex(paletteColors[index]));
    } else {
      setBackgroundIndex(index);
      setBackground(paletteHex(paletteColors[index]));
    }
  };
  const addPaletteColor = (target: "foreground" | "background") => {
    const color = target === "foreground" ? foreground : background;
    const result = appendMissingPaletteColor(paletteColors, hexToRgba(color));
    if (!result.added) return;
    setPaletteColors(result.palette);
    if (paletteEditable) {
      setForeground(color);
      setPaletteIndex(result.index);
      if (target === "background") setBackgroundIndex(result.index);
    }
  };
  return {
    selectionMode,
    setSelectionMode,
    gradientType,
    setGradientType,
    gradientDither,
    setGradientDither,
    tolerance,
    setTolerance,
    sprayWidth,
    setSprayWidth,
    spraySpeed,
    setSpraySpeed,
    contiguous,
    setContiguous,
    fillReference,
    setFillReference,
    autoSelectLayer,
    setAutoSelectLayer,
    eyedropperChannel,
    setEyedropperChannel,
    eyedropperSample,
    setEyedropperSample,
    tool,
    setTool,
    previousTool,
    workingColorTarget,
    setWorkingColorTarget,
    tilesetEditable,
    setTilesetEditable,
    ink: inkSettings.ink,
    setInk: inkSettings.setInk,
    inkOpacity: inkSettings.opacity,
    setInkOpacity: inkSettings.setOpacity,
    shareInk: inkSettings.shared,
    setShareInk: inkSettings.setShared,
    inkShade,
    setInkShade,
    dynamics,
    setDynamics,
    sharedDynamics: dynamicsPreferences.shared,
    setSharedDynamics,
    resetToolPreferences: () => {
      inkSettings.reset();
      setDynamicsPreferences(createDynamicsPreferences());
      setInkShade([]);
      setBrushSizes({});
      setBrushShapes({});
      setBrushAngles({});
      setBrushImages({});
      setPixelPerfectTools({});
      setGradientType(GradientType.Linear);
      setGradientDither(GradientDither.None);
    },
    foreground,
    setForeground,
    background,
    setBackground,
    backgroundIndex,
    setBackgroundIndex,
    setPaletteColors,
    stepPaletteColor,
    addPaletteColor,
    paletteColors,
    paletteSelection,
    getPaletteSelection,
    setPaletteSelection,
    paletteAscending,
    setPaletteAscending,
    paletteEditable,
    setPaletteEditable,
    applyPaletteOperation,
    paletteIndex,
    setPaletteIndex,
    visible,
    setVisible,
    locked,
    setLocked,
    frame,
    setFrame,
    frameCount,
    playing,
    setPlaying,
    timelineVisible,
    setTimelineVisible,
    previewVisible,
    setPreviewVisible,
    zoom,
    setZoom,
    tab,
    setTab,
    openTabs,
    openTab,
    closeTab,
    brushSize,
    setBrushSize,
    brushShape,
    brushAngle,
    brushImage,
    setBrushShape,
    setBrushAngle,
    setBrush: (brush: AsepriteBrushValue) => {
      setBrushShape(brush.shape);
      setBrushSize(brush.size);
      setBrushAngle(brush.angle);
      setBrushImage(brush.shape === "image" ? brush.image : undefined);
    },
    createBrushImageFromSelection: () => null,
    pixelPerfect,
    setPixelPerfect,
    notice,
    setNotice,
    colorHover,
    addFrame,
  };
}
const supportedTools = new Set<string>(editorTools);
function useEditorState(
  core: RasterEditor | null,
  uiStore: StoreApi<EditorUiState>,
  workspace: DocumentWorkspace | undefined,
) {
  const preferenceStorage = useEditorPlatformPorts()?.preferences;
  const state = useEditorSnapshot(core, false, EditorSnapshotScope.Chrome);
  const quickTool = useStore(uiStore, (value) => value.quickTool);
  const autoSelectLayerModifier = useStore(uiStore, (value) => value.autoSelectLayerModifier);
  const preview = usePreviewEditorState(
    state?.settings.tool as EditorTool | undefined,
    uiStore,
    state?.palette,
    state?.settings.ink,
    core,
    state?.settings.shade,
  );
  const [timelinePosition, setTimelinePositionState] = useState<TimelineDockPosition>(() =>
    readTimelineDockPosition(preferenceStorage),
  );
  const documentPreferenceId =
    workspace?.getDocumentPreferenceId() ??
    (state?.document ? `preview:${state.document.id}` : undefined);
  const [localTimelinePanelPreferences, setTimelinePanelPreferencesState] =
    useState<TimelinePanelPreferences>(() =>
      readTimelinePanelPreferences(documentPreferenceId, preferenceStorage),
    );
  const [localTimelinePanelDefaults, setTimelinePanelDefaultsState] =
    useState<TimelinePanelPreferences>(() =>
      readTimelinePanelPreferences(undefined, preferenceStorage),
    );
  const timelinePanelPreferences = useSyncExternalStore(
    workspace?.subscribe ?? (() => () => {}),
    workspace?.getTimelinePanelPreferences ?? (() => localTimelinePanelPreferences),
    workspace?.getTimelinePanelPreferences ?? (() => localTimelinePanelPreferences),
  );
  const timelinePanelDefaults = useSyncExternalStore(
    workspace?.subscribe ?? (() => () => {}),
    workspace?.getTimelinePanelDefaults ?? (() => localTimelinePanelDefaults),
    workspace?.getTimelinePanelDefaults ?? (() => localTimelinePanelDefaults),
  );
  const setTimelinePosition = (position: TimelineDockPosition) => {
    setTimelinePositionState(position);
    try {
      preferenceStorage?.setItem(TIMELINE_DOCK_POSITION_STORAGE_KEY, position);
    } catch {
      /* Keep the in-session dock position. */
    }
  };
  const setTimelinePanelPreferences = (patch: TimelinePanelPreferencesPatch) => {
    if (workspace) {
      workspace.setTimelinePanelPreferences(patch);
      return;
    }
    setTimelinePanelPreferencesState((current) => {
      const next = normalizeTimelinePanelPreferences({ ...current, ...patch });
      writeTimelinePanelPreferences(documentPreferenceId, next, preferenceStorage);
      return next;
    });
  };
  const setTimelinePanelPreferencesAsDefaults = () => {
    if (workspace) {
      workspace.setTimelinePanelDefaults(timelinePanelPreferences);
      return;
    }
    writeTimelinePanelDefaults(timelinePanelPreferences, preferenceStorage);
    setTimelinePanelDefaultsState(timelinePanelPreferences);
  };
  const setDefaultTimelineFirstFrame = (firstFrame: number) => {
    if (workspace) {
      workspace.setTimelinePanelDefaults({ ...timelinePanelDefaults, firstFrame });
      return;
    }
    setTimelinePanelDefaultsState((current) => {
      const next = normalizeTimelinePanelPreferences({ ...current, firstFrame });
      writeTimelinePanelDefaults(next, preferenceStorage);
      return next;
    });
  };
  const selectionPreferences: SelectionPreferences = workspace?.getSelectionPreferences() ?? {
    ...defaultSelectionPreferences,
    autoOpaque: state?.settings.selectionAutoOpaque ?? defaultSelectionPreferences.autoOpaque,
    moveEdges: state?.settings.selectionMoveEdges ?? defaultSelectionPreferences.moveEdges,
    multicelWhenLayersOrFrames:
      state?.settings.selectionMulticelWhenLayersOrFrames ??
      defaultSelectionPreferences.multicelWhenLayersOrFrames,
    modifiersDisableHandles:
      state?.settings.selectionModifiersDisableHandles ??
      defaultSelectionPreferences.modifiersDisableHandles,
    moveOnAddMode:
      state?.settings.selectionMoveOnAddMode ?? defaultSelectionPreferences.moveOnAddMode,
    keepSelectionAfterClear:
      state?.settings.selectionKeepAfterClear ??
      defaultSelectionPreferences.keepSelectionAfterClear,
    autoShowSelectionEdges:
      state?.settings.selectionAutoShowEdges ?? defaultSelectionPreferences.autoShowSelectionEdges,
    doubleClickSelectTile:
      state?.settings.selectionDoubleClickSelectTile ??
      defaultSelectionPreferences.doubleClickSelectTile,
  };
  const timelineInteractionPreferences: TimelineInteractionPreferences =
    workspace?.getTimelineInteractionPreferences() ?? defaultTimelineInteractionPreferences;
  const previousTimelineCounts = useRef<{
    core: RasterEditor;
    documentId: number | undefined;
    frames: number;
    layers: number;
  } | null>(null);
  useEffect(() => {
    const document = state?.document;
    const timeline = document?.timeline;
    if (!core || !document || !timeline) {
      previousTimelineCounts.current = null;
      return;
    }
    const previous = previousTimelineCounts.current;
    if (
      previous?.core === core &&
      previous.documentId === document.id &&
      timelineInteractionPreferences.autoShowTimeline &&
      (timeline.frames.length > previous.frames || timeline.layers.length > previous.layers)
    )
      preview.setTimelineVisible(true);
    previousTimelineCounts.current = {
      core,
      documentId: document.id,
      frames: timeline.frames.length,
      layers: timeline.layers.length,
    };
  }, [
    core,
    state?.document?.id,
    state?.document?.timeline?.frames.length,
    state?.document?.timeline?.layers.length,
    timelineInteractionPreferences.autoShowTimeline,
    preview.setTimelineVisible,
  ]);
  const setSelectionPreferences = (preferences: SelectionPreferences) =>
    workspace?.setSelectionPreferences(preferences);
  const setTimelineInteractionPreferences = (preferences: TimelineInteractionPreferences) =>
    workspace?.setTimelineInteractionPreferences(preferences);
  useEffect(() => {
    if (workspace) return;
    const next = readTimelinePanelPreferences(documentPreferenceId, preferenceStorage);
    setTimelinePanelPreferencesState(next);
    if (core && state?.document) core.timeline.setOnionSkin(next.onionSkin);
  }, [core, state?.document?.id, documentPreferenceId, preferenceStorage, workspace]);
  const common = {
    quickTool,
    autoSelectLayerModifier,
    functional: Boolean(core),
    paletteCapacityAvailable: (state?.palette ?? preview.paletteColors).length < MAX_PALETTE_COLORS,
    setSampledColor: (
      target: "foreground" | "background",
      value: string,
      paletteIndex?: number | null,
    ) => {
      const color = hexToRgba(value);
      const snapshot = core?.getSnapshot();
      const palette = snapshot?.palette ?? preview.paletteColors;
      const hex = rgbaToHex(color);
      const match = palette.findIndex((entry) => rgbaToHex(entry) === hex);
      const index =
        paletteIndex === null
          ? null
          : paletteIndex !== undefined &&
              palette[paletteIndex] &&
              rgbaToHex(palette[paletteIndex]) === hex
            ? paletteIndex
            : match < 0
              ? null
              : match;
      if (core) {
        const indexKey = target === "foreground" ? "foregroundIndex" : "backgroundIndex";
        if (
          snapshot &&
          rgbaToHex(snapshot.settings[target]) === hex &&
          snapshot.settings[indexKey] === index
        )
          return;
        core.drawing.settings.setSettings({
          [target]: color,
          [indexKey]: index,
        });
      } else if (target === "foreground") {
        preview.setPaletteIndex(index);
        preview.setForeground(value);
      } else {
        preview.setBackgroundIndex(index);
        preview.setBackground(value);
      }
    },
    resetToolPreferences: () => {
      if (workspace) workspace.resetToolPreferences();
      else core?.drawing.settings.resetToolPreferences();
      preview.resetToolPreferences();
    },
    timelinePosition,
    setTimelinePosition,
    timelinePanelPreferences,
    setTimelinePanelPreferences,
    setTimelinePanelPreferencesAsDefaults,
    timelinePanelDefaults,
    setDefaultTimelineFirstFrame,
    selectionPreferences,
    setSelectionPreferences,
    timelineInteractionPreferences,
    setTimelineInteractionPreferences,
    pixelPerfectSupported: !core || supportsPixelPerfect(core.getSnapshot().settings),
  };
  if (!core || !state) return { ...preview, ...common };
  const settings = state.settings;
  const colorIndex = (color: Rgba, previous: number | null) => {
    const hex = rgbaToHex(color);
    if (previous !== null && state.palette[previous] && rgbaToHex(state.palette[previous]) === hex)
      return previous;
    const index = state.palette.findIndex((value) => rgbaToHex(value) === hex);
    return index < 0 ? null : index;
  };
  const valueOf = <T,>(value: T | ((old: T) => T), old: T): T =>
    typeof value === "function" ? (value as (old: T) => T)(old) : value;
  const changeWorkingColor = (target: "foreground" | "background", value: string) => {
    const color = hexToRgba(value);
    const snapshot = core.getSnapshot();
    const index =
      target === "foreground"
        ? (snapshot.settings.foregroundIndex ?? preview.paletteIndex)
        : (snapshot.settings.backgroundIndex ?? preview.backgroundIndex);
    if (
      preview.paletteEditable &&
      index !== null &&
      index !== undefined &&
      index >= 0 &&
      index < snapshot.palette.length
    ) {
      const palette = snapshot.palette.map((entry, at) => (at === index ? color : entry));
      core.color.setPalette(palette);
    }
    core.drawing.settings.setSettings({ [target]: color });
  };
  const setForeground: typeof preview.setForeground = (value) =>
    changeWorkingColor(
      "foreground",
      valueOf(value, rgbaToHex(core.getSnapshot().settings.foreground)),
    );
  const setBackground: typeof preview.setBackground = (value) =>
    changeWorkingColor(
      "background",
      valueOf(value, rgbaToHex(core.getSnapshot().settings.background)),
    );
  const setPaletteColors: typeof preview.setPaletteColors = (value) =>
    core.color.setPalette(
      valueOf(value, core.getSnapshot().palette).map(
        (c) => [c[0], c[1], c[2], c[3] ?? UINT8_MAX] as Rgba,
      ),
    );
  const setTool: typeof preview.setTool = (value) => {
    uiStore.getState().setQuickTool(null);
    const current = core.getSnapshot().settings;
    const next = valueOf(value, current.tool);
    if (!supportedTools.has(next)) return;
    uiStore.getState().rememberToolChange(current.tool, next);
    core.drawing.settings.setSettings({ tool: next as CoreTool });
  };
  const setBrushSize: typeof preview.setBrushSize = (value) => {
    const brush = core.getSnapshot().settings.brush;
    core.drawing.settings.setSettings({
      brush: {
        ...brush,
        size: valueOf(value, brush.size),
      },
    });
  };
  return {
    ...preview,
    ...common,
    selectionMode: settings.selectionMode ?? SelectionMode.Replace,
    setSelectionMode: (selectionMode: SelectionMode) =>
      core.drawing.settings.setSettings({ selectionMode }),
    gradientType: settings.gradientType ?? GradientType.Linear,
    setGradientType: (gradientType: GradientType) =>
      core.drawing.settings.setSettings({ gradientType }),
    gradientDither: settings.gradientDither ?? GradientDither.None,
    setGradientDither: (gradientDither: GradientDither) =>
      core.drawing.settings.setSettings({ gradientDither }),
    tool: settings.tool as EditorTool,
    setTool,
    paletteIndex: colorIndex(settings.foreground, settings.foregroundIndex ?? preview.paletteIndex),
    setPaletteIndex: (value: Parameters<typeof preview.setPaletteIndex>[0]) => {
      const snapshot = core.getSnapshot();
      const index = valueOf(value, snapshot.settings.foregroundIndex ?? preview.paletteIndex);
      preview.setPaletteIndex(index);
      core.drawing.settings.setSettings({
        foregroundIndex: index,
        ...(index !== null && snapshot.palette[index]
          ? { foreground: snapshot.palette[index] }
          : {}),
      });
    },
    backgroundIndex: colorIndex(
      settings.background,
      settings.backgroundIndex ?? preview.backgroundIndex,
    ),
    setBackgroundIndex: (value: Parameters<typeof preview.setBackgroundIndex>[0]) => {
      const snapshot = core.getSnapshot();
      const index = valueOf(value, snapshot.settings.backgroundIndex ?? preview.backgroundIndex);
      preview.setBackgroundIndex(index);
      core.drawing.settings.setSettings({
        backgroundIndex: index,
        ...(index !== null && snapshot.palette[index]
          ? { background: snapshot.palette[index] }
          : {}),
      });
    },
    foreground: rgbaToHex(settings.foreground),
    setForeground,
    background: rgbaToHex(settings.background),
    setBackground,
    paletteColors: state.palette,
    setPaletteColors,
    applyPaletteOperation: (
      operation: PaletteOperation,
      indices: readonly number[] = preview.getPaletteSelection(),
    ) => core.color.applyPaletteOperation(operation, preview.paletteAscending, indices),
    stepPaletteColor: (target: "foreground" | "background", step: number) => {
      const index = core.color.stepPaletteColor(target, step);
      if (index !== null) {
        if (target === "foreground") preview.setPaletteIndex(index);
        else preview.setBackgroundIndex(index);
      }
    },
    addPaletteColor: (target: "foreground" | "background") => {
      const result = core.color.addPaletteColor(target, preview.paletteEditable);
      if (result.foregroundIndex !== undefined) preview.setPaletteIndex(result.foregroundIndex);
      if (result.backgroundIndex !== undefined) preview.setBackgroundIndex(result.backgroundIndex);
    },
    visible: state.document?.layer.visible ?? true,
    setVisible: ((value) =>
      core.timeline.setLayerVisible(
        valueOf(value, core.getSnapshot().document?.layer.visible ?? true),
      )) as typeof preview.setVisible,
    locked: state.document?.layer.locked ?? false,
    setLocked: ((value) =>
      core.timeline.setLayerLocked(
        valueOf(value, core.getSnapshot().document?.layer.locked ?? false),
      )) as typeof preview.setLocked,
    zoom: state.view.zoom * 100,
    setZoom: ((value) =>
      core.canvas.zoomTo(
        valueOf(value, core.getSnapshot().view.zoom * 100) / 100,
        measuredEditorViewport(core, preview.timelineVisible),
      )) as typeof preview.setZoom,
    pixelPerfect: settings.pixelPerfect,
    setPixelPerfect: ((value) => {
      const current = core.getSnapshot().settings;
      if (supportsPixelPerfect(current))
        core.drawing.settings.setSettings({
          pixelPerfect: valueOf(value, current.pixelPerfect),
        });
    }) as typeof preview.setPixelPerfect,
    brushSize: settings.brush.size,
    setBrushSize,
    brushShape: settings.brush.shape,
    brushAngle: settings.brush.angle,
    brushImage: settings.brush.image,
    setBrushShape: (shape: AsepriteBrushShape) => {
      const brush = core.getSnapshot().settings.brush;
      core.drawing.settings.setSettings({
        brush: { ...brush, shape, image: shape === "image" ? brush.image : undefined },
      });
    },
    setBrushAngle: (angle: number) =>
      core.drawing.settings.setSettings({
        brush: { ...core.getSnapshot().settings.brush, angle },
      }),
    setBrush: (brush: AsepriteBrushValue) => {
      const current = core.getSnapshot().settings.brush;
      core.drawing.settings.setSettings({
        brush: {
          ...current,
          ...brush,
          image:
            brush.shape === "image"
              ? (brush.image ?? (current.shape === "image" ? current.image : undefined))
              : undefined,
        },
      });
    },
    createBrushImageFromSelection: () => core.clipboard.createBrushImageFromSelection(),
    autoSelectLayer: settings.autoSelectLayer,
    setAutoSelectLayer: (autoSelectLayer: boolean) =>
      core.drawing.settings.setSettings({ autoSelectLayer }),
    eyedropperChannel: settings.eyedropperChannel,
    setEyedropperChannel: (eyedropperChannel: EyedropperChannel) =>
      core.drawing.settings.setSettings({ eyedropperChannel }),
    eyedropperSample: settings.eyedropperSample,
    setEyedropperSample: (eyedropperSample: EyedropperSample) =>
      core.drawing.settings.setSettings({ eyedropperSample }),
    tolerance: settings.tolerance,
    setTolerance: (tolerance: number) => core.drawing.settings.setSettings({ tolerance }),
    sprayWidth: settings.sprayWidth,
    setSprayWidth: (sprayWidth: number) => core.drawing.settings.setSettings({ sprayWidth }),
    spraySpeed: settings.spraySpeed,
    setSpraySpeed: (spraySpeed: number) => core.drawing.settings.setSettings({ spraySpeed }),
    contiguous: settings.contiguous,
    setContiguous: (contiguous: boolean) => core.drawing.settings.setSettings({ contiguous }),
    fillReference: settings.fillReference ?? FillReference.ActiveLayer,
    setFillReference: (fillReference: FillReference) =>
      core.drawing.settings.setSettings({ fillReference }),
    ink: settings.ink ?? AsepriteInk.Simple,
    setInk: (ink: AsepriteInk) => core.drawing.settings.setSettings({ ink }),
    inkOpacity: settings.opacity,
    setInkOpacity: (opacity: number) => core.drawing.settings.setSettings({ opacity }),
    shareInk: settings.shareInk ?? false,
    setShareInk: (shareInk: boolean) => core.drawing.settings.setSettings({ shareInk }),
    dynamics: settings.dynamics ?? { ...DEFAULT_DYNAMICS_SETTINGS },
    setDynamics: (dynamics: DynamicsSettings) => core.drawing.settings.setSettings({ dynamics }),
    sharedDynamics: settings.shareDynamics ?? true,
    setSharedDynamics: (shareDynamics: boolean) =>
      core.drawing.settings.setSettings({ shareDynamics }),
    setTimelineVisible: ((value) => {
      preview.setTimelineVisible(valueOf(value, preview.timelineVisible));
    }) as typeof preview.setTimelineVisible,
    frame: (state.document?.timeline?.activeFrame ?? 0) + 1,
    frameCount: state.document?.timeline?.frames.length ?? 1,
    setFrame: ((value) =>
      core.timeline.selectFrame(
        valueOf(value, (core.getSnapshot().document?.timeline?.activeFrame ?? 0) + 1) - 1,
      )) as typeof preview.setFrame,
    addFrame: () => core.timeline.addFrame(true),
    playing: state.playing,
    setPlaying: ((value) =>
      core.timeline.setPlaying(
        valueOf(value, core.getSnapshot().playing),
      )) as typeof preview.setPlaying,
  };
}
type EditorState = ReturnType<typeof useEditorState>;
const EditorContext = createContext<EditorStateSource<EditorState> | null>(null);
const EditorManagerContext = createContext<{
  core: RasterEditor | null;
  uiStore: StoreApi<EditorUiState>;
} | null>(null);

export function useEditor() {
  const source = useContext(EditorContext);
  if (!source) throw new Error("Editor primitives must be rendered inside EditorProvider");
  return useSyncExternalStore(source.subscribe, source.getSnapshot, source.getSnapshot);
}

function useEditorSelector<T>(
  selector: (state: EditorState) => T,
  equal: (a: T, b: T) => boolean = Object.is,
) {
  const source = useContext(EditorContext);
  if (!source) throw new Error("Editor selectors require EditorProvider");
  const cache = useRef<{ source: EditorStateSource<EditorState>; value: T } | null>(null);
  const get = useCallback(() => {
    const value = selector(source.getSnapshot());
    if (cache.current?.source === source && equal(cache.current.value, value))
      return cache.current.value;
    cache.current = { source, value };
    return value;
  }, [source, selector, equal]);
  return useSyncExternalStore(source.subscribe, get, get);
}

export function useEditorFields<const K extends readonly (keyof EditorState)[]>(keys: K) {
  return useEditorSelector(
    (state) =>
      Object.fromEntries(keys.map((key) => [key, state[key]])) as Pick<EditorState, K[number]>,
    sameEditorFields,
  );
}

/** Internal core access for manager modules. Components should use `useEditor()` instead. */
export function useEditorManagerContext() {
  const manager = useContext(EditorManagerContext);
  if (!manager) throw new Error("Editor manager hooks require EditorProvider");
  return manager;
}

export function EditorProvider({
  children,
  core = null,
  initialTab = "document",
  uiStore: suppliedUiStore,
}: {
  children: ReactNode;
  core?: RasterEditor | null;
  initialTab?: EditorTab;
  uiStore?: StoreApi<EditorUiState>;
}) {
  const [uiStore] = useState(() => suppliedUiStore ?? createEditorUiStore(initialTab));
  const runtime = useOptionalEditorRuntimeManagerContext();
  const state = useEditorState(core, uiStore, runtime?.workspace);
  const committedState = useRef(state);
  const handlers = useRef(new Map<keyof EditorState, (...args: unknown[]) => unknown>());
  const stableState = { ...state };
  for (const key of Object.keys(state) as (keyof EditorState)[]) {
    if (typeof state[key] !== "function") continue;
    let handler = handlers.current.get(key);
    if (!handler) {
      handler = (...args: unknown[]) =>
        (committedState.current[key] as (...values: unknown[]) => unknown)(...args);
      handlers.current.set(key, handler);
    }
    Object.assign(stableState, { [key]: handler });
  }
  const [source] = useState(() => new EditorStateSource(stableState));
  // Commit callbacks before child layout effects can invoke them. Notify
  // selector subscribers in a layout effect before the browser paints.
  useInsertionEffect(() => {
    committedState.current = state;
    source.setSnapshot(stableState);
  });
  useLayoutEffect(() => source.publish());
  const manager = useMemo(() => ({ core, uiStore }), [core, uiStore]);
  return (
    <EditorManagerContext.Provider value={manager}>
      <EditorContext.Provider value={source}>{children}</EditorContext.Provider>
    </EditorManagerContext.Provider>
  );
}
