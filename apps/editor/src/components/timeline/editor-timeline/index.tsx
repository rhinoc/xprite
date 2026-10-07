import {
  cloneElement,
  useCallback,
  useEffect,
  useMemo,
  useRef,
  useState,
  type PointerEvent as ReactPointerEvent,
} from "react";

import "$/components/timeline/editor-timeline/editor-timeline.module.css";
import { useWorkspaceLayoutConfiguration } from "$/components/shared/editor-layout-context";
import { useElementSize } from "$/components/shared/use-size";
import { useAnimationActions } from "$/components/timeline/animation-actions";
import { animationPlaybackMenuItems } from "$/components/timeline/animation-settings";
import { TimelineCopyOutline } from "$/components/timeline/editor-timeline/timeline-copy-outline";
import {
  useTimelineInteractions,
  TimelineRangeCursor,
} from "$/components/timeline/editor-timeline/use-timeline-interactions";
import { EditorLayerFlagControls } from "$/components/timeline/layer-row";
import { EditorOnionSkinRange } from "$/components/timeline/onion-skin-range";
import {
  TimelineActionsProvider,
  useRegisterTimelineActions,
  useTimelineActions,
} from "$/components/timeline/timeline-actions";
import { timelineFrameLabel, TimelineCellButton } from "$/components/timeline/timeline-cell";
import { TimelineDialogs } from "$/components/timeline/timeline-dialogs";
import { TimelineTags } from "$/components/timeline/timeline-tags";
import { TilemapDialog } from "$/components/tools/tilemap-controls";
import { tUi, tUiSource } from "$/i18n";
import { workingColorProfile } from "$/managers/canvas/canvas-presentation";
import { useEditorFields } from "$/managers/editor/editor-state-manager";
import { useWheelInput } from "$/managers/input/use-wheel-input";
import { defaultTimelinePanelPreferences } from "$/managers/preferences/timeline-panel-preferences";
import { useTimelineLayerColumnWidthPreference } from "$/managers/preferences/use-panel-layout-preferences";
import { useTimelineDockPreferences } from "$/managers/timeline/timeline-layout-preferences";
import { TimelineWheelAction } from "$/managers/timeline/timeline-manager";
import { useTimelineManager } from "$/managers/timeline/timeline-manager";
import { defaultOnionSkinSettings } from "$/managers/timeline/timeline-presentation";
import {
  defaultPlaybackSettings,
  type PlaybackSettings,
} from "$/managers/timeline/timeline-presentation";
import {
  canMergeDown,
  canConvertBackground,
  layerSubtree,
} from "$/managers/timeline/timeline-presentation";
import { layerAncestors, layerEditable } from "$/managers/timeline/timeline-presentation";
import { timelineTags, type TimelineRange } from "$/managers/timeline/timeline-presentation";
import type { SpriteTimeline } from "$/managers/timeline/timeline-presentation";
import { UINT8_MAX } from "$/managers/timeline/timeline-presentation";
import {
  getTimelineRangeGeometry,
  getTimelineDropGeometry,
  TimelineDropMarkerKind,
  type TimelineRangeViewport,
} from "$/managers/timeline/timeline-range-geometry";
import { useWorkspaceResizeScheduler } from "$/managers/workspace/workspace-resize-scheduler";
import {
  timelineCelThumbnail,
  paintTimelineThumbnail,
  paintThumbnailChecker,
  celIdentity,
  celsShareImage,
  timelinePartForCel,
  asepriteLayerRows,
  paintLayerRowArtwork,
  paintTimelineTagArtwork,
  paintTimelineFrameArtwork,
  useTimelineTagBands,
  TIMELINE_TAG_BAND_HEIGHT,
} from "@xprite/editor-ui/timeline";
import {
  ContextMenu as EditorContextMenu,
  LongPressActivation,
  Menu,
  type MenuItem,
  Button,
  Tooltip,
  CanvasSurface,
  Scrollbar,
  useUi,
} from "@xprite/ui";
import { paintUiPart, paintUiIcon, measureUiText, useUiAssets } from "@xprite/ui/assets";
import type { UiPartName } from "@xprite/ui/assets";
import { UI_SCALE } from "@xprite/ui/canvas";
import { UI_SCALE_X as sx, UI_SCALE_Y as sy } from "@xprite/ui/canvas";
import {
  computedStyle,
  layoutSize,
  scrollBy,
  scrollPosition,
  setScrollPosition,
  hitElement,
  clientPoint,
  clientRect,
  clientScale,
  clientDeltaToLocal,
  PointerDragAxis,
  PointerResizeGesture,
  stylusPointerInputProps,
} from "@xprite/ui/utils";

const bottomOrigin = { x: 0, y: 0 };
const PLAYBACK_CONTROLS_TOP = 2;
const PLAYBACK_CONTROLS_HEIGHT = 26;
const PLAYBACK_CONTROL_PITCH = 32;
const PLAYBACK_CONTROL_BORDER_OVERLAP = 2;
const TIMELINE_HEADER_GAP = 4;
const TIMELINE_BASE_HEADER_TOP =
  PLAYBACK_CONTROLS_TOP + PLAYBACK_CONTROLS_HEIGHT + TIMELINE_HEADER_GAP;
const TIMELINE_THEME_SCALE = 2;
const TIMELINE_LAYER_ACTIONS_WIDTH = 72;
const TIMELINE_HEADER_CONTROL_SIZE = 24;
const TIMELINE_HEADER_CONTROL_COUNT = 5;
const LAYER_TOOLBAR_CONTROL_COUNT = 2;
type TimelineData = SpriteTimeline;
export interface TimelineViewProps {
  layerName?: string;
  renderDialogs?: boolean;
  docked?: boolean;
}
export function TimelineView(props: TimelineViewProps) {
  const register = useRegisterTimelineActions();
  return register ? (
    <EditorTimelineContent {...props} />
  ) : (
    <TimelineActionsProvider>
      <EditorTimelineContent {...props} />
    </TimelineActionsProvider>
  );
}
function EditorTimelineContent({
  layerName = "Layer",
  renderDialogs = true,
  docked = false,
}: TimelineViewProps) {
  const editor = useEditorFields([
    "frame",
    "frameCount",
    "locked",
    "playing",
    "setFrame",
    "setPlaying",
    "setTimelineInteractionPreferences",
    "setTimelinePanelPreferences",
    "timelineInteractionPreferences",
    "timelinePanelPreferences",
    "timelinePosition",
    "visible",
  ]);
  const { connect: connectWheel } = useWheelInput();
  const timelineManager = useTimelineManager();
  const { commands } = timelineManager;
  const coreSnapshot = timelineManager.snapshot;
  const assets = useUiAssets();
  const workspaceLayoutConfiguration = useWorkspaceLayoutConfiguration();
  const timelineLayout = workspaceLayoutConfiguration.timeline;
  const timelineHost = useRef<HTMLElement>(null);
  const timelineSize = useElementSize(timelineHost);
  const { style: timelineStyle } = useUi();
  const timelinePosition = editor.timelinePosition ?? "bottom";
  const verticalDock = timelinePosition === "left" || timelinePosition === "right";
  const panelPreferences = editor.timelinePanelPreferences ?? defaultTimelinePanelPreferences;
  const timelineZoom = panelPreferences.thumbnailsEnabled ? panelPreferences.thumbnailZoom : 1;
  const wheelZoomRef = useRef(timelineZoom);
  wheelZoomRef.current = timelineZoom;
  const frameSize = 24 * timelineZoom;
  const rowSize = 24 * timelineZoom;
  const frameHeaderHeight = TIMELINE_HEADER_CONTROL_SIZE;
  const tagItems = coreSnapshot?.document?.timeline
    ? timelineTags(coreSnapshot.document.timeline)
    : [];
  const tagBands = useTimelineTagBands(
    tagItems,
    timelineManager.identity,
    frameSize,
    measureUiText,
  );
  const headerTop = TIMELINE_BASE_HEADER_TOP + tagBands.height - TIMELINE_TAG_BAND_HEIGHT;
  const firstFrame = panelPreferences.firstFrame;
  const dockPreferences = useTimelineDockPreferences();
  const defaultDockHeight = (37 + 7 * timelineStyle.dimensions.timeline_base_size) * UI_SCALE;
  const [dockHeight, setDockHeight] = useState(() =>
    dockPreferences.readHeight(64 * UI_SCALE, defaultDockHeight),
  );
  const [dockWidth, setDockWidth] = useState<number | null>(() =>
    dockPreferences.readWidth(64 * UI_SCALE),
  );
  const dockDrag = useRef<{
    pointer: number;
    extent: number;
    gesture: PointerResizeGesture;
  } | null>(null);
  const resizeDock = (extent: number) => {
    let container = timelineHost.current?.parentElement;
    while (container && computedStyle(container).display === "contents")
      container = container.parentElement;
    const available = verticalDock
      ? (layoutSize(container)?.width ?? extent + 88 * UI_SCALE)
      : (layoutSize(container)?.height ?? extent + 44 * UI_SCALE);
    const keepViewport = (verticalDock ? 88 : 44) * UI_SCALE;
    const minimum = 64 * UI_SCALE;
    const next = Math.round(
      Math.max(minimum, Math.min(Math.max(minimum, available - keepViewport), extent)),
    );
    if (verticalDock) setDockWidth(next);
    else setDockHeight(next);
  };
  useEffect(() => {
    dockPreferences.saveHeight(dockHeight);
  }, [dockHeight, dockPreferences]);
  useEffect(() => {
    if (dockWidth === null) return;
    dockPreferences.saveWidth(dockWidth);
  }, [dockWidth, dockPreferences]);
  const { requestedColumnWidth, setColumnWidth, beginResize } =
    useTimelineLayerColumnWidthPreference();
  const columnResizeScheduler = useWorkspaceResizeScheduler();
  const layerToolbarLeft = 2 + TIMELINE_HEADER_CONTROL_COUNT * TIMELINE_HEADER_CONTROL_SIZE;
  const layerToolbarRight =
    layerToolbarLeft + LAYER_TOOLBAR_CONTROL_COUNT * TIMELINE_HEADER_CONTROL_SIZE;
  const minimumColumnWidth = Math.max(
    timelineLayout.layerColumnMinimumWidth,
    layerToolbarRight - 2,
  );
  const columnWidth = Math.max(
    minimumColumnWidth,
    timelineLayout.fitLayerColumn
      ? Math.min(requestedColumnWidth, timelineSize.width / sx - timelineLayout.frameAreaReserve)
      : requestedColumnWidth,
  );
  const tagBandTop = headerTop - tagBands.height;
  const rowTop = headerTop + frameHeaderHeight;
  const frameLeft = 2 + columnWidth;
  const timelineBottom = Math.max(88, timelineSize.height / sy);
  const rowsHeight = Math.max(rowSize, timelineBottom - rowTop);
  const columnDrag = useRef<{
    id: number;
    gesture: PointerResizeGesture;
    requestedWidth: number;
    handle: HTMLElement;
    endResize: () => void;
  } | null>(null);
  const moveColumnResize = (event: ReactPointerEvent<HTMLElement>) => {
    const drag = columnDrag.current;
    if (!drag || drag.id !== event.pointerId) return;
    const width = drag.gesture.valueAt(event);
    if (width === null) return;
    columnResizeScheduler.schedule(() => setColumnWidth(Math.round(width)));
  };
  const finishColumnResize = (event: ReactPointerEvent<HTMLElement>) => {
    const drag = columnDrag.current;
    if (!drag || drag.id !== event.pointerId) return;
    moveColumnResize(event);
    columnResizeScheduler.flush();
    columnDrag.current = null;
    drag.endResize();
    if (drag.handle.hasPointerCapture(drag.id)) drag.handle.releasePointerCapture(drag.id);
  };
  const cancelColumnResize = useCallback(() => {
    const drag = columnDrag.current;
    if (!drag) return;
    columnResizeScheduler.cancel();
    columnDrag.current = null;
    setColumnWidth(drag.requestedWidth);
    drag.endResize();
    if (drag.handle.hasPointerCapture(drag.id)) drag.handle.releasePointerCapture(drag.id);
  }, [columnResizeScheduler, setColumnWidth]);
  useEffect(() => {
    window.addEventListener("blur", cancelColumnResize);
    return () => {
      window.removeEventListener("blur", cancelColumnResize);
      cancelColumnResize();
    };
  }, [cancelColumnResize]);
  const actions = useTimelineActions();
  const flagDrag = useRef<{
    kind: "visible" | "locked" | "continuous" | "collapsed";
    value: boolean;
  } | null>(null);
  const soloVisibility = useRef<{
    documentId: number | undefined;
    ids: string;
    values: boolean[];
  } | null>(null);
  const animationActions = useAnimationActions();
  const frameScroll = useRef<HTMLDivElement>(null);
  const layerScroll = useRef<HTMLDivElement>(null);
  const [frameScrollOffset, setFrameScrollOffset] = useState(0);
  const [layerScrollOffset, setLayerScrollOffset] = useState(0);
  const [hot, setHot] = useState<{ layer: number; frame: number } | null>(null);
  const [tagPreview, setTagPreview] = useState<{ index: number; from: number; to: number } | null>(
    null,
  );
  useEffect(() => {
    const release = () => {
      flagDrag.current = null;
    };
    window.addEventListener("pointerup", release);
    window.addEventListener("pointercancel", release);
    return () => {
      window.removeEventListener("pointerup", release);
      window.removeEventListener("pointercancel", release);
    };
  }, []);
  useEffect(() => {
    const host = timelineHost.current;
    if (!host) return;
    const wheel = (event: WheelEvent) => {
      const pane = frameScroll.current;
      if (!pane) return;
      if (event.defaultPrevented) return;
      const decision = timelineManager.resolveWheelInput(event);
      const { action, precise } = decision;
      if (action === null) {
        event.preventDefault();
        event.stopPropagation();
        return;
      }
      if (action === TimelineWheelAction.Zoom) {
        if (!editor.setTimelinePanelPreferences) return;
        const delta = event.deltaX + event.deltaY;
        if (!delta) return;
        const zoom = timelineManager.wheelZoom(decision, wheelZoomRef.current);
        wheelZoomRef.current = zoom;
        editor.setTimelinePanelPreferences({ thumbnailZoom: zoom, thumbnailsEnabled: zoom > 1 });
        event.preventDefault();
        event.stopPropagation();
        return;
      }
      let dx = decision.x,
        dy = decision.y;
      if (!precise) {
        const multiplier = event.altKey ? 3 : 1;
        dx = Math.sign(dx) * frameSize * sx * multiplier;
        dy = Math.sign(dy) * rowSize * sy * multiplier;
      } else {
        const local = clientDeltaToLocal(pane, { x: dx, y: dy });
        dx = local.x;
        dy = local.y;
      }
      if (action === TimelineWheelAction.Horizontal && dx === 0) {
        dx = dy;
        dy = 0;
      }
      scrollBy(pane, { x: dx });
      scrollBy(pane, { y: dy });
      event.preventDefault();
      event.stopPropagation();
    };
    return connectWheel(host, wheel);
  }, [
    editor.setTimelinePanelPreferences,
    frameSize,
    rowSize,
    timelineZoom,
    timelineManager.wheelZoom,
    timelineManager.resolveWheelInput,
    connectWheel,
    commands,
  ]);
  const timeline: SpriteTimeline = (coreSnapshot?.document?.timeline as
    | TimelineData
    | undefined) ?? {
    layers: [
      {
        id: "layer-1",
        name: layerName,
        visible: editor.visible ?? true,
        locked: editor.locked ?? false,
        opacity: UINT8_MAX,
        flags: 0,
      },
    ],
    frames: Array.from({ length: Math.max(1, editor.frameCount) }, () => ({
      duration: 100,
      cels: [null],
    })),
    activeLayer: 0,
    activeFrame: Math.max(0, editor.frame - 1),
  };
  const layers = timeline.layers;
  const frames = timeline.frames;
  const activeLayer = Math.max(0, Math.min(layers.length - 1, timeline.activeLayer));
  const activeFrame = Math.max(0, Math.min(frames.length - 1, editor.frame - 1));
  const visibleLayers = useMemo(() => asepriteLayerRows(timeline), [layers]);
  const maxFrames = Math.max(1, frames.length);
  const scrollableHeight = (visibleLayers.length + 1) * rowSize + 2;
  const timelineScrollbarGutter = scrollableHeight > rowsHeight ? 12 : 0;
  const frameViewportWidth = Math.max(
    24,
    timelineSize.width / sx - frameLeft - 4 - timelineScrollbarGutter,
  );
  const timelineRight = frameLeft + frameViewportWidth;
  const timelineWidth = timelineRight + timelineScrollbarGutter + 2;
  const frameWidth = Math.max(frameSize, maxFrames * frameSize);
  const scrollableWidth = frameWidth + Math.floor(frameViewportWidth / 2) + 2;
  // Timeline::onPaint clips to the visible frame/layer bounds. Keep a small
  // source-sized overscan so a wheel/drag scroll never exposes a blank edge.
  const frameWindowStart = Math.max(0, Math.floor(frameScrollOffset / (frameSize * sx)) - 2);
  const frameWindowEnd = Math.min(
    frames.length,
    frameWindowStart + Math.ceil(frameViewportWidth / frameSize) + 4,
  );
  const frameEntries = useMemo(
    () =>
      frames
        .slice(frameWindowStart, frameWindowEnd)
        .map((frame, offset) => ({ frame, index: frameWindowStart + offset })),
    [frames, frameWindowStart, frameWindowEnd],
  );
  const layerWindowStart = Math.max(0, Math.floor(layerScrollOffset / (rowSize * sy)) - 2);
  const layerWindowEnd = Math.min(
    visibleLayers.length,
    layerWindowStart + Math.ceil(rowsHeight / rowSize) + 4,
  );
  const layerEntries = useMemo(
    () =>
      visibleLayers
        .slice(layerWindowStart, layerWindowEnd)
        .map(({ layer, index }, offset) => ({ layer, index, row: layerWindowStart + offset })),
    [visibleLayers, layerWindowStart, layerWindowEnd],
  );
  useEffect(() => {
    const pane = frameScroll.current;
    if (!pane) return;
    let left = scrollPosition(pane).x / sx,
      top = scrollPosition(pane).y / sy;
    const activeRow = visibleLayers.findIndex((entry) => entry.index === activeLayer);
    const x = activeFrame * frameSize,
      y = activeRow * rowSize;
    if (x < left) left = x;
    else if (x + frameSize > left + frameViewportWidth) left = x + frameSize - frameViewportWidth;
    if (activeRow >= 0) {
      if (y < top) top = y;
      else if (y + rowSize > top + rowsHeight) top = y + rowSize - rowsHeight;
    }
    if (Math.abs(scrollPosition(pane).x - left * sx) > 0.5) {
      setScrollPosition(pane, { x: left * sx });
      setFrameScrollOffset(scrollPosition(pane).x);
    }
    if (Math.abs(scrollPosition(pane).y - top * sy) > 0.5) {
      setScrollPosition(pane, { y: top * sy });
      setLayerScrollOffset(scrollPosition(pane).y);
      if (layerScroll.current)
        setScrollPosition(layerScroll.current, { y: scrollPosition(pane).y });
    }
  }, [
    activeFrame,
    activeLayer,
    visibleLayers.map((entry) => entry.index).join(","),
    frames.length,
    frameViewportWidth,
    frameSize,
    rowSize,
  ]);
  const frameScrollScene = Math.round(frameScrollOffset / sx);
  const layerScrollScene = Math.round(layerScrollOffset / sy);
  const colors = assets?.style.colors;
  const range = timeline.range;
  const rangeViewport = useMemo<TimelineRangeViewport>(
    () => ({
      frameCount: maxFrames,
      visibleLayerIndices: visibleLayers.map(({ index }) => index),
      frameSize,
      rowSize,
      frameLeft,
      rowTop,
      headerTop,
      timelineRight,
      timelineBottom,
      frameScroll: frameScrollScene,
      layerScroll: layerScrollScene,
      outlineWidth: timelineStyle.dimensions.timeline_outline_width * TIMELINE_THEME_SCALE,
      themeScale: TIMELINE_THEME_SCALE,
      timelineLeft: 2,
      layerLabelLeft: 2 + TIMELINE_LAYER_ACTIONS_WIDTH,
    }),
    [
      maxFrames,
      visibleLayers,
      frameSize,
      rowSize,
      frameLeft,
      rowTop,
      timelineRight,
      timelineBottom,
      frameScrollScene,
      layerScrollScene,
      timelineStyle.dimensions.timeline_outline_width,
    ],
  );
  const rangeGeometry = useMemo(
    () => getTimelineRangeGeometry(range, rangeViewport),
    [range, rangeViewport],
  );
  const copiedRangeGeometry = useMemo(
    () => getTimelineRangeGeometry(timelineManager.copiedRange, rangeViewport),
    [timelineManager.copiedRange, rangeViewport],
  );
  const [contextRange, setContextRange] = useState<TimelineRange | null>(null);
  const interactions = useTimelineInteractions(
    timeline,
    timelineHost,
    frameScroll,
    sx,
    sy,
    frameSize,
    rowSize,
    editor.timelineInteractionPreferences,
    { range: rangeGeometry, viewport: rangeViewport },
  );
  const [tilemapDialog, setTilemapDialog] = useState<"new" | "convert" | null>(null);
  const activeIsTilemap = layers[activeLayer]?.kind === "tilemap";
  const canConvertTilemap =
    !!commands.canConvertLayerTilemap() &&
    layerEditable(timeline, activeLayer) &&
    !activeIsTilemap &&
    !(layers[activeLayer]?.flags & 8);
  const menuRange = contextRange;
  const rangeSelected = (layer: number, frame: number) =>
    !!range && range.layers.includes(layer) && range.frames.includes(frame);
  const removeRange = () => {
    if (menuRange) commands.clearTimelineRange(menuRange);
  };
  const duplicateRange = (linked = false) => {
    if (menuRange) commands.duplicateCels(linked, menuRange);
  };
  const canEditSelectedCels = !!menuRange?.layers.some((li) => layerEditable(timeline, li));
  const selectedLinkedCels = !!menuRange?.layers.some((li) => {
    if (!layerEditable(timeline, li)) return false;
    const counts = new Map<object, number>();
    for (const frame of timeline.frames) {
      const cel = frame.cels[li];
      if (cel) {
        const key = celIdentity(cel);
        counts.set(key, (counts.get(key) ?? 0) + 1);
      }
    }
    for (const fi of menuRange.frames) {
      const cel = timeline.frames[fi]?.cels[li];
      if (cel && (counts.get(celIdentity(cel)) ?? 0) > 1) return true;
    }
    return false;
  });
  const layerContextItems = (targetRange: TimelineRange): MenuItem[] => [
    { label: "Layer Properties...", onSelect: () => actions?.openLayerPropertiesDialog() },
    {
      label: "New",
      separator: true,
      children: [
        {
          label: "New Layer",
          disabled: !commands.canAddLayer(),
          onSelect: () => commands.addLayer(),
        },
        {
          label: "New Group",
          disabled: !commands.canAddLayer(),
          onSelect: () => commands.addGroup(),
        },
        {
          label: "New Tilemap Layer",
          separator: true,
          disabled: !commands.canAddLayer() || !commands.canAddTilemapLayer(),
          onSelect: () => setTilemapDialog("new"),
        },
      ],
    },
    {
      label: "Delete Layer",
      disabled: targetRange.layers.length >= layers.length,
      onSelect: () => commands.clearTimelineRange(targetRange),
    },
    {
      label: "Convert To",
      children: [
        {
          label: "Background",
          disabled: !canConvertBackground(timeline, true),
          onSelect: () => commands.convertLayerBackground(true),
        },
        {
          label: "Layer",
          disabled: activeIsTilemap
            ? !commands.canConvertLayerTilemap()
            : !canConvertBackground(timeline, false),
          onSelect: () =>
            activeIsTilemap
              ? commands.convertLayerTilemap(false)
              : commands.convertLayerBackground(false),
        },
        {
          label: "Tilemap",
          disabled: !canConvertTilemap,
          onSelect: () => setTilemapDialog("convert"),
        },
      ],
    },
    {
      label: "Duplicate Layer",
      separator: true,
      onSelect: () => commands.duplicateLayer(),
    },
    {
      label: "Merge Down",
      disabled: !canMergeDown(timeline),
      onSelect: () => commands.mergeDown(),
    },
    { label: "Flatten", onSelect: () => commands.flattenLayers(false) },
    { label: "Flatten Visible", onSelect: () => commands.flattenLayers(true) },
  ];
  const sourceContextItems =
    menuRange?.kind === "layers"
      ? layerContextItems(menuRange)
      : menuRange?.kind === "cels"
        ? [
            {
              label: "Cel Properties...",
              disabled: !timeline.frames[activeFrame]?.cels[activeLayer],
              onSelect: () => actions?.openCelPropertiesDialog?.(),
            },
            {
              label: "Clear",
              separator: true,
              disabled: menuRange.layers.some(
                (i) => !layerEditable(timeline, i) || !!(layers[i].flags & 8),
              ),
              onSelect: removeRange,
            },
            {
              label: "Unlink",
              disabled: !selectedLinkedCels,
              onSelect: () => menuRange && commands.unlinkCels(menuRange),
            },
            {
              label: "Link Cels",
              disabled: !canEditSelectedCels || menuRange.frames.length < 2,
              onSelect: () => menuRange && commands.linkCels(menuRange),
            },
            {
              label: "Duplicate Cels",
              separator: true,
              disabled:
                !canEditSelectedCels ||
                Math.max(...menuRange.frames) * 2 - Math.min(...menuRange.frames) + 1 >= 4096,
              onSelect: () => duplicateRange(false),
            },
            {
              label: "Duplicate Linked Cels",
              disabled:
                !canEditSelectedCels ||
                Math.max(...menuRange.frames) * 2 - Math.min(...menuRange.frames) + 1 >= 4096,
              onSelect: () => duplicateRange(true),
            },
          ]
        : [
            { label: "Frame Properties...", onSelect: () => actions?.openFramePropertiesDialog() },
            { label: "New Frame", separator: true, onSelect: () => commands.addFrame() },
            { label: "New Empty Frame", onSelect: () => commands.addFrame(false) },
            { label: "New Tag", onSelect: () => actions?.newTagDialog?.() },
            {
              label: "Remove Frame",
              disabled: !!menuRange && menuRange.frames.length >= frames.length,
              onSelect: removeRange,
            },
            {
              label: "Set Loop Section",
              separator: true,
              disabled: !timelineManager.active,
              onSelect: () => {
                if (commands.setLoopSection()) actions?.openTagPropertiesDialog?.();
              },
            },
            {
              label: "Reverse Frames",
              separator: true,
              disabled:
                !timelineManager.active ||
                menuRange?.kind !== "frames" ||
                menuRange.frames.length < 2,
              onSelect: () => commands.reverseFrames(),
            },
          ];
  const bindRangeAction = (
    item: MenuItem,
    targetRange: TimelineRange | null = menuRange,
  ): MenuItem => {
    const action = item.onSelect;
    return {
      ...item,
      onSelect: action ? () => timelineManager.runRangeAction(targetRange, action) : undefined,
      children: item.children?.map((child) => bindRangeAction(child, targetRange)),
    };
  };
  const contextItems = sourceContextItems.map((item) => bindRangeAction(item));
  const layerToolbarRange: TimelineRange =
    range?.kind === "layers"
      ? range
      : { kind: "layers", layers: [activeLayer], frames: frames.map((_, index) => index) };
  const layerToolbarItems = layerContextItems(layerToolbarRange).map((item) =>
    bindRangeAction(item, layerToolbarRange),
  );
  const selectLayer = (index: number) => {
    commands.selectLayer(index);
  };
  const updatePlaybackOptions = (value: PlaybackSettings) => {
    commands.setPlaybackOptions(value);
    if (value.rewindOnStop !== editor.timelineInteractionPreferences.rewindOnStop)
      editor.setTimelineInteractionPreferences({
        ...editor.timelineInteractionPreferences,
        rewindOnStop: value.rewindOnStop,
      });
  };
  const selectFrame = (index: number) => editor.setFrame(index + 1);
  const selectCel = (layer: number, frame: number) => {
    selectLayer(layer);
    selectFrame(frame);
  };
  const toggleSolo = (index: number) => {
    const ids = layers.map((layer) => layer.id).join("|");
    const documentId = coreSnapshot?.document?.id;
    const prior = soloVisibility.current;
    if (
      prior &&
      prior.documentId === documentId &&
      prior.ids === ids &&
      prior.values.some(Boolean)
    ) {
      prior.values.forEach((visible, at) => commands.setLayerVisible(visible || at === index, at));
      soloVisibility.current = null;
    } else {
      soloVisibility.current = { documentId, ids, values: layers.map((layer) => layer.visible) };
      const selected = new Set([
        ...layerSubtree(timeline, index),
        ...layerAncestors(timeline, index).map((l) => layers.indexOf(l)),
      ]);
      layers.forEach((_, at) => commands.setLayerVisible(selected.has(at), at));
    }
  };
  const controls = [
    ["ani_first", "First frame", () => selectFrame(0), "Home"],
    ["ani_previous", "Previous frame", () => commands.stepFrame(-1), "Left"],
    [
      editor.playing ? "ani_stop" : "ani_play",
      editor.playing ? "Stop playback" : "Play animation",
      () => editor.setPlaying(!editor.playing),
      "Enter",
    ],
    ["ani_next", "Next frame", () => commands.stepFrame(1), "Right"],
    ["ani_last", "Last frame", () => selectFrame(Math.max(0, frames.length - 1)), "End"],
  ] as const;
  const playbackControlPitch = Math.min(
    PLAYBACK_CONTROL_PITCH,
    Math.floor((columnWidth - PLAYBACK_CONTROL_BORDER_OVERLAP) / controls.length),
  );
  const onionSkinActive = !!coreSnapshot?.view.onionSkin?.active;
  const headerControls = [
    {
      icon: layers.every((layer) => !layer.visible)
        ? "timeline_closed_eye_normal"
        : "timeline_open_eye_normal",
      label: "Toggle all layer visibility",
      action: () => commands.setAllLayersVisible(!layers.every((layer) => layer.visible)),
    },
    {
      icon: layers.every((layer) => layer.locked)
        ? "timeline_closed_padlock_normal"
        : "timeline_open_padlock_normal",
      label: "Toggle all layer locks",
      action: () => commands.setAllLayersLocked(layers.every((layer) => !layer.locked)),
    },
    {
      icon: layers.every((layer) => !!(layer.flags & 16))
        ? "timeline_continuous_normal"
        : "timeline_discontinuous_normal",
      label: "Toggle all layer continuous cels",
      action: () => commands.setAllLayersContinuous(!layers.every((layer) => !!(layer.flags & 16))),
    },
    {
      icon: "timeline_gear",
      label: "Timeline configuration",
      action: () => animationActions?.openOnionSettings(),
    },
    {
      icon: "timeline_onionskin",
      label: "Onion skin",
      action: () => commands.setOnionSkin({ active: !coreSnapshot?.view.onionSkin?.active }),
    },
  ] as const;
  const dropGeometry = useMemo(
    () => getTimelineDropGeometry(interactions.drop, rangeViewport),
    [interactions.drop, rangeViewport],
  );
  const paintSelectionOutline = useCallback(
    (ctx: CanvasRenderingContext2D) => {
      if (!assets) return;
      const paintDecoration = (
        bounds: { x: number; y: number; width: number; height: number },
        clip: { x: number; y: number; width: number; height: number },
        part: UiPartName,
        drawCenter = false,
      ) => {
        ctx.save();
        ctx.beginPath();
        ctx.rect(clip.x, clip.y, clip.width, clip.height);
        ctx.clip();
        paintUiPart(ctx, assets, part, bounds.x, bounds.y, bounds.width, bounds.height, {
          drawCenter,
        });
        ctx.restore();
      };
      if (rangeGeometry)
        paintDecoration(
          rangeGeometry.outlineBounds,
          rangeGeometry.outlineClipBounds,
          interactions.rangeHot ? "colorbar_selection_hot" : "colorbar_selection",
        );
      if (dropGeometry) {
        const part =
          dropGeometry.kind === TimelineDropMarkerKind.Frames
            ? "timeline_drop_frame_deco"
            : dropGeometry.kind === TimelineDropMarkerKind.Layers
              ? "timeline_drop_layer_deco"
              : "colorbar_selection";
        paintDecoration(
          dropGeometry.bounds,
          dropGeometry.clipBounds,
          part,
          dropGeometry.kind === TimelineDropMarkerKind.Frames ||
            dropGeometry.kind === TimelineDropMarkerKind.Layers,
        );
      }
    },
    [assets, rangeGeometry, dropGeometry, interactions.rangeHot],
  );
  const paintThumbnailOverlay = useCallback(
    (ctx: CanvasRenderingContext2D) => {
      if (!assets) return;
      ctx.save();
      ctx.beginPath();
      ctx.rect(frameLeft, rowTop, frameViewportWidth, rowsHeight);
      ctx.clip();
      const overlayDocument = coreSnapshot?.document;
      const overlayLayer = hot && hot.layer >= 0 ? timeline.layers[hot.layer] : undefined;
      const overlayCel = hot && hot.frame >= 0 ? timeline.frames[hot.frame]?.cels[hot.layer] : null;
      if (
        panelPreferences.thumbnailOverlayEnabled &&
        overlayDocument &&
        overlayCel &&
        overlayLayer?.kind !== "tilemap"
      ) {
        const maximum = 24 * panelPreferences.thumbnailOverlaySize;
        const overlayWidth =
          overlayDocument.width >= overlayDocument.height
            ? maximum
            : Math.max(1, Math.round((maximum * overlayDocument.width) / overlayDocument.height));
        const overlayHeight =
          overlayDocument.height >= overlayDocument.width
            ? maximum
            : Math.max(1, Math.round((maximum * overlayDocument.height) / overlayDocument.width));
        const row = visibleLayers.findIndex((entry) => entry.index === hot!.layer),
          cellX = frameLeft + hot!.frame * frameSize - frameScrollScene,
          cellY = rowTop + Math.max(0, row) * rowSize - layerScrollScene;
        let overlayX = cellX + frameSize,
          overlayY = cellY + Math.floor(frameSize / 2);
        if (overlayX + overlayWidth > timelineRight) overlayX = cellX - overlayWidth;
        if (overlayY + overlayHeight > timelineBottom)
          overlayY = cellY - overlayHeight + Math.floor(frameSize / 2);
        overlayX = Math.max(2, Math.min(timelineWidth - overlayWidth - 2, overlayX));
        overlayY = Math.max(2, Math.min(timelineBottom - overlayHeight - 2, overlayY));
        ctx.save();
        ctx.fillStyle = assets.style.colors.window_face;
        ctx.fillRect(overlayX, overlayY, overlayWidth, overlayHeight);
        paintThumbnailChecker(
          ctx,
          overlayX + 1,
          overlayY + 1,
          Math.max(1, overlayWidth - 2),
          Math.max(1, overlayHeight - 2),
          16,
        );
        const preview = timelineCelThumbnail(
          overlayCel,
          workingColorProfile(timeline),
          Math.max(1, overlayWidth - 2),
          Math.max(1, overlayHeight - 2),
          panelPreferences.thumbnailScaleUpToFit,
        );
        if (preview) {
          ctx.imageSmoothingEnabled = false;
          ctx.drawImage(
            preview,
            overlayX + 1 + Math.floor((overlayWidth - 2 - preview.width) / 2),
            overlayY + 1 + Math.floor((overlayHeight - 2 - preview.height) / 2),
          );
        }
        ctx.strokeStyle = "rgba(0,0,0,.5)";
        ctx.lineWidth = 1;
        ctx.strokeRect(overlayX + 0.5, overlayY + 0.5, overlayWidth - 1, overlayHeight - 1);
        ctx.restore();
      }
      ctx.restore();
    },
    [
      assets,
      coreSnapshot?.document,
      hot,
      timeline,
      panelPreferences,
      visibleLayers,
      frameLeft,
      frameSize,
      frameScrollScene,
      rowTop,
      rowSize,
      layerScrollScene,
      timelineRight,
      timelineBottom,
      timelineWidth,
      frameViewportWidth,
      rowsHeight,
    ],
  );
  const paint = useCallback(
    (ctx: CanvasRenderingContext2D) => {
      if (!assets) return;
      ctx.save();
      // Timeline::drawPaddings uses atlas-backed styles, not the similarly
      // named color roles (the dark sheet center is deliberately darker).
      ctx.fillStyle = assets.style.colors.workspace;
      ctx.fillRect(0, 2, timelineWidth, timelineBottom - 2);
      const lastFrameEnd = Math.max(
        frameLeft,
        Math.min(timelineRight, frameLeft + maxFrames * frameSize - frameScrollScene),
      );
      const rowsEnd = Math.max(
        rowTop,
        Math.min(timelineBottom, rowTop + visibleLayers.length * rowSize - layerScrollScene),
      );
      if (lastFrameEnd < timelineRight)
        paintUiPart(
          ctx,
          assets,
          "timeline_padding_tr",
          lastFrameEnd,
          headerTop,
          timelineRight - lastFrameEnd,
          rowsEnd - headerTop,
        );
      if (rowsEnd < timelineBottom) {
        paintUiPart(
          ctx,
          assets,
          "timeline_padding_bl",
          2,
          rowsEnd,
          lastFrameEnd - 2,
          timelineBottom - rowsEnd,
        );
        if (lastFrameEnd < timelineRight)
          paintUiPart(
            ctx,
            assets,
            "timeline_padding_br",
            lastFrameEnd,
            rowsEnd,
            timelineRight - lastFrameEnd,
            timelineBottom - rowsEnd,
          );
      }
      // Paint each visible tag band above the frame header.
      // TimelineTags owns hit testing and edits; this surface paints
      // the same source ranges/colors used for save and playback.
      const tags = timelineTags(timeline);
      ctx.save();
      ctx.beginPath();
      ctx.rect(frameLeft, tagBandTop, frameViewportWidth, tagBands.height);
      ctx.clip();
      for (const [tagIndex, originalTag] of tags.entries()) {
        const row = tagBands.row(tagIndex);
        if (row < 0) continue;
        const bandTop = tagBandTop + row * TIMELINE_TAG_BAND_HEIGHT;
        ctx.save();
        ctx.beginPath();
        ctx.rect(frameLeft, bandTop, frameViewportWidth, TIMELINE_TAG_BAND_HEIGHT);
        ctx.clip();
        const tag =
          tagPreview?.index === tagIndex
            ? { ...originalTag, from: tagPreview.from, to: tagPreview.to }
            : originalTag;
        const x = frameLeft + tag.from * frameSize - frameScrollScene;
        const right = frameLeft + (tag.to + 1) * frameSize - frameScrollScene;
        paintTimelineTagArtwork(ctx, assets, { tag, x, y: bandTop, width: right - x });
        ctx.restore();
      }
      ctx.restore();
      // The next header cell supplies the last button's right divider.
      if (layerToolbarRight < frameLeft)
        paintUiPart(
          ctx,
          assets,
          "timeline_normal",
          layerToolbarRight,
          headerTop,
          frameLeft - layerToolbarRight,
          frameHeaderHeight,
        );

      // Timeline::onPaint clips the frame and layer views independently. The
      // browser keeps the same source-unit scroll phase and only exposes
      // semantic buttons for the virtualized rows/columns below.
      ctx.save();
      ctx.beginPath();
      ctx.rect(frameLeft, headerTop, frameViewportWidth, timelineBottom - headerTop);
      ctx.clip();
      for (const { index } of frameEntries) {
        const x = frameLeft + index * frameSize - frameScrollScene;
        const selected =
          range?.kind === "frames" ? range.frames.includes(index) : index === activeFrame;
        paintTimelineFrameArtwork(ctx, assets, {
          x,
          y: headerTop,
          width: frameSize,
          height: frameHeaderHeight,
          label: timelineFrameLabel(index, firstFrame),
          selected,
          hovered: hot?.layer === -1 && hot.frame === index,
        });
      }
      ctx.restore();

      ctx.save();
      ctx.beginPath();
      ctx.rect(2, rowTop, columnWidth, rowsHeight);
      ctx.clip();
      for (const { index, row } of layerEntries) {
        const y = rowTop + row * rowSize - layerScrollScene;
        const selected =
          range?.kind === "layers" ? range.layers.includes(index) : index === activeLayer;
        paintLayerRowArtwork(ctx, assets, {
          timeline,
          index,
          x: 2,
          y,
          width: columnWidth,
          height: rowSize,
          selected,
          hovered: hot?.layer === index && hot.frame === -1,
        });
      }
      ctx.restore();

      ctx.save();
      ctx.beginPath();
      ctx.rect(frameLeft, rowTop, frameViewportWidth, rowsHeight);
      ctx.clip();
      for (const { layer, index, row } of layerEntries) {
        const y = rowTop + row * rowSize - layerScrollScene;
        for (const { frame, index: frameIndex } of frameEntries) {
          const x = frameLeft + frameIndex * frameSize - frameScrollScene;
          const cel = frame.cels[index];
          const leftCel = frameIndex > 0 ? frames[frameIndex - 1].cels[index] : null;
          const rightCel =
            frameIndex + 1 < frames.length ? frames[frameIndex + 1].cels[index] : null;
          const selected = range
            ? rangeSelected(index, frameIndex)
            : index === activeLayer && frameIndex === activeFrame;
          const focused = index === activeLayer && frameIndex === activeFrame;
          const hovered = hot?.layer === index && hot.frame === frameIndex;
          const looselyActive = range
            ? range.layers.includes(index) || range.frames.includes(frameIndex)
            : index === activeLayer || frameIndex === activeFrame;
          paintUiPart(
            ctx,
            assets,
            focused && range
              ? "timeline_focused"
              : selected || focused
                ? hovered
                  ? "timeline_active"
                  : "timeline_clicked"
                : hovered
                  ? looselyActive
                    ? "timeline_active_hover"
                    : "timeline_hover"
                  : looselyActive
                    ? "timeline_active"
                    : "timeline_normal",
            x,
            y,
            frameSize,
            rowSize,
          );
          const marker = timelinePartForCel(
            !!cel,
            celsShareImage(leftCel, cel),
            celsShareImage(rightCel, cel),
          );
          if (layer.kind !== "group")
            paintUiPart(
              ctx,
              assets,
              looselyActive ? (marker.replace(/_normal$/, "_active") as UiPartName) : marker,
              x,
              y,
              frameSize,
              rowSize,
            );
          if (
            panelPreferences.thumbnailsEnabled &&
            timelineZoom > 1 &&
            cel &&
            layer.kind !== "tilemap"
          )
            paintTimelineThumbnail(
              ctx,
              cel,
              workingColorProfile(timeline),
              x,
              y,
              frameSize,
              rowSize,
              panelPreferences.thumbnailScaleUpToFit,
            );
          if (cel?.zIndex) paintUiIcon(ctx, assets, "timeline_zindex", x + 12, y + 10);
        }
      }
      ctx.restore();

      ctx.restore();
    },
    [
      assets,
      range,
      columnWidth,
      frameLeft,
      layerToolbarRight,
      timelineRight,
      timelineWidth,
      frameViewportWidth,
      maxFrames,
      frameEntries,
      layerEntries,
      frameScrollScene,
      layerScrollScene,
      activeFrame,
      activeLayer,
      frames,
      layers,
      hot,
      tagPreview,
      tagBands,
      tagBandTop,
      headerTop,
      coreSnapshot?.view.onionSkin,
      timelineBottom,
      rowsHeight,
      frameSize,
      frameHeaderHeight,
      rowTop,
      firstFrame,
      panelPreferences,
      timelineZoom,
    ],
  );
  return (
    <EditorContextMenu
      label="Timeline menu"
      gestureScope={timelineManager.identity}
      items={contextItems}
      longPressTarget="[data-timeline-kind]"
      longPressActivation={LongPressActivation.Hold}
      canOpenTouchMenu={interactions.canOpenTouchMenu}
      onContextMenu={(event) => {
        const selected = interactions.contextTarget(event.target as Element);
        if (selected) setContextRange(selected);
        else event.preventDefault();
      }}
    >
      <section
        tabIndex={-1}
        {...interactions.handlers}
        onDoubleClick={(event) => {
          const el = hitElement(
            { x: clientPoint(event).x, y: clientPoint(event).y },
            document,
          )?.closest<HTMLElement>("[data-timeline-kind]");
          if (el?.dataset.timelineKind === "layers") actions?.openLayerPropertiesDialog();
          else if (el?.dataset.timelineKind === "frames") actions?.openFramePropertiesDialog();
          else if (el?.dataset.timelineKind === "cels") actions?.openCelPropertiesDialog?.();
        }}
        ref={timelineHost}
        style={{
          height: docked || verticalDock ? "100%" : dockHeight,
          width: docked ? "100%" : verticalDock ? (dockWidth ?? undefined) : undefined,
          flex: docked
            ? "1 1 auto"
            : verticalDock
              ? `0 0 ${dockWidth === null ? "25%" : `${dockWidth}px`}`
              : `0 0 ${dockHeight}px`,
          minWidth: docked ? 0 : verticalDock ? `${64 * UI_SCALE}px` : 0,
          minHeight: docked || verticalDock ? 0 : undefined,
          maxHeight: docked || verticalDock ? "none" : `calc(100% - ${44 * UI_SCALE}px)`,
          maxWidth: docked ? "none" : verticalDock ? `calc(100% - ${88 * UI_SCALE}px)` : undefined,
        }}
        className={`xse-timeline xse-timeline-${timelinePosition}`}
        data-ui-region="timeline"
        data-range-cursor={interactions.rangeCursor ?? undefined}
        data-slot="timeline"
        aria-label={tUi("ui.timeline")}
        aria-description={tUi("ui.count.layers.frames.frames", {
          count: layers.length,
          frames: frames.length,
        })}
      >
        <CanvasSurface
          bounds={{ x: 0, y: 2, width: timelineWidth, height: timelineBottom - 2 }}
          paint={paint}
          aria-hidden="true"
          style={{
            position: "absolute",
            left: 0,
            top: Math.floor(2 * sy) - bottomOrigin.y * sy,
            pointerEvents: "none",
          }}
        />
        {(range || interactions.drop) && (
          <CanvasSurface
            className="xse-timeline-selection-outline"
            bounds={{ x: 0, y: 2, width: timelineWidth, height: timelineBottom - 2 }}
            paint={paintSelectionOutline}
            aria-hidden="true"
            style={{ left: 0, top: Math.floor(2 * sy) - bottomOrigin.y * sy }}
          />
        )}
        {copiedRangeGeometry && (
          <TimelineCopyOutline
            geometry={copiedRangeGeometry}
            width={timelineWidth}
            height={timelineBottom - 2}
            top={Math.floor(2 * sy) - bottomOrigin.y * sy}
          />
        )}
        {panelPreferences.thumbnailOverlayEnabled && hot && (
          <CanvasSurface
            className="xse-timeline-thumbnail-overlay"
            bounds={{ x: 0, y: 2, width: timelineWidth, height: timelineBottom - 2 }}
            paint={paintThumbnailOverlay}
            aria-hidden="true"
            style={{ left: 0, top: Math.floor(2 * sy) - bottomOrigin.y * sy }}
          />
        )}
        {controls.map(([icon, label, action, shortcut], i) => {
          const button = (
            <Button
              bounds={{
                x: PLAYBACK_CONTROL_BORDER_OVERLAP + i * playbackControlPitch,
                y: PLAYBACK_CONTROLS_TOP,
                width: playbackControlPitch + PLAYBACK_CONTROL_BORDER_OVERLAP,
                height: PLAYBACK_CONTROLS_HEIGHT,
              }}
              pushedPart="buttonset_item_pushed"
              relativeTo={bottomOrigin}
              icon={icon as UiPartName}
              aria-label={tUiSource(label)}
              disabled={!timelineManager.active}
              onClick={action}
            />
          );
          return (
            <Tooltip
              key={shortcut}
              placement="bottom"
              text={`${tUiSource(label)}\n\n${tUi("ui.timeline.playback.shortcut", { shortcut })}${i === 2 ? `\n\n${tUi("ui.timeline.playback.right.click.settings")}` : ""}`}
            >
              {(getTooltipProps) =>
                i === 2 ? (
                  <EditorContextMenu
                    label="Animation Playback"
                    touchDoubleClickTarget={false}
                    items={animationPlaybackMenuItems(
                      coreSnapshot?.view.playback ?? defaultPlaybackSettings,
                      updatePlaybackOptions,
                    )}
                  >
                    {(getContextProps) =>
                      cloneElement(button, getTooltipProps(getContextProps(button.props)))
                    }
                  </EditorContextMenu>
                ) : (
                  cloneElement(button, getTooltipProps(button.props))
                )
              }
            </Tooltip>
          );
        })}
        <Tooltip
          placement="bottom"
          text={`${tUi("ui.new.layer")}\n\n${tUi("ui.timeline.playback.shortcut", { shortcut: "Shift+N" })}`}
        >
          {(getTooltipProps) => (
            <Button
              {...getTooltipProps()}
              className="xse-timeline-header-action"
              bounds={{
                x: layerToolbarLeft,
                y: headerTop,
                width: TIMELINE_HEADER_CONTROL_SIZE,
                height: frameHeaderHeight,
              }}
              relativeTo={bottomOrigin}
              part="timeline_normal"
              hotPart="timeline_hover"
              pushedPart="timeline_clicked"
              insetContent={false}
              icon="icon_add"
              aria-label={tUi("ui.new.layer")}
              disabled={!commands.canAddLayer()}
              onClick={() => commands.addLayer()}
            />
          )}
        </Tooltip>
        <Menu
          key={timelineManager.identity}
          label={tUi("ui.layer.menu")}
          items={layerToolbarItems}
          renderTrigger={(props) => (
            <Tooltip placement="bottom" text={tUi("ui.layer.menu")}>
              {(getTooltipProps) => (
                <Button
                  {...getTooltipProps(props)}
                  className="xse-timeline-header-action"
                  bounds={{
                    x: layerToolbarLeft + TIMELINE_HEADER_CONTROL_SIZE,
                    y: headerTop,
                    width: TIMELINE_HEADER_CONTROL_SIZE,
                    height: frameHeaderHeight,
                  }}
                  relativeTo={bottomOrigin}
                  part="timeline_normal"
                  hotPart="timeline_hover"
                  pushedPart="timeline_clicked"
                  insetContent={false}
                  text="..."
                  disabled={!timelineManager.active}
                />
              )}
            </Tooltip>
          )}
        />
        {headerControls.map(({ icon, label, action }, index) => (
          <Button
            key={label}
            className="xse-timeline-header-action"
            part={label === "Onion skin" && onionSkinActive ? "timeline_active" : "timeline_normal"}
            hotPart={
              label === "Onion skin" && onionSkinActive ? "timeline_active_hover" : "timeline_hover"
            }
            pushedPart="timeline_clicked"
            insetContent={false}
            icon={
              (label === "Onion skin" && onionSkinActive
                ? "timeline_onionskin_active"
                : icon) as UiPartName
            }
            selectedIcon={`${icon.replace(/_normal$/, "")}_active` as UiPartName}
            aria-label={tUiSource(label)}
            data-ui-label-source={label}
            aria-pressed={label === "Onion skin" ? onionSkinActive : undefined}
            onContextMenu={
              label === "Onion skin"
                ? (event) => {
                    event.preventDefault();
                    event.stopPropagation();
                    animationActions?.openOnionSettings();
                  }
                : undefined
            }
            disabled={!timelineManager.active}
            onPointerDown={(event) => {
              if (event.button === 0) action();
            }}
            onClick={(event) => {
              if (event.detail === 0) action();
            }}
            style={{
              zIndex: 3,
            }}
            bounds={{
              x: 2 + index * TIMELINE_HEADER_CONTROL_SIZE,
              y: headerTop,
              width: TIMELINE_HEADER_CONTROL_SIZE,
              height: frameHeaderHeight,
            }}
            relativeTo={bottomOrigin}
          />
        ))}
        <div
          className="xse-timeline-layer-pane"
          style={{
            left: 2 * sx,
            width: columnWidth * sx,
            top: rowTop * sy,
            height: rowsHeight * sy,
          }}
          ref={layerScroll}
          aria-label={tUi("ui.layers")}
          onScroll={(event) => {
            setLayerScrollOffset(scrollPosition(event.currentTarget).y);
            if (frameScroll.current)
              setScrollPosition(frameScroll.current, { y: scrollPosition(event.currentTarget).y });
          }}
        >
          <div className="xse-timeline-layer-content" style={{ height: scrollableHeight * sy }}>
            {layerEntries.map(({ layer, index, row }) => {
              const selected =
                range?.kind === "layers" ? range.layers.includes(index) : index === activeLayer;
              return (
                <span
                  key={layer.id}
                  className="xse-timeline-layer-row"
                  style={{ top: row * rowSize * sy, height: rowSize * sy }}
                >
                  <button
                    type="button"
                    className="xse-timeline-layer-name"
                    style={{ width: (columnWidth - 72) * sx }}
                    {...stylusPointerInputProps()}
                    data-timeline-kind="layers"
                    data-layer={index}
                    aria-label={tUi("ui.select.layer.name", { name: layer.name })}
                    aria-pressed={selected}
                    onClick={(event) => {
                      if (event.detail === 0) {
                        selectLayer(index);
                        commands.setTimelineRange({
                          kind: "layers",
                          layers: [index],
                          frames: frames.map((_, i) => i),
                        });
                      }
                    }}
                    onPointerEnter={() => setHot({ layer: index, frame: -1 })}
                    onPointerLeave={() => setHot(null)}
                  ></button>
                  <EditorLayerFlagControls
                    timeline={timeline}
                    index={index}
                    height={rowSize}
                    disabled={!timelineManager.active}
                    dragRef={flagDrag}
                    onSolo={toggleSolo}
                    onVisible={(v, i) => commands.setLayerVisible(v, i)}
                    onLocked={(v, i) => commands.setLayerLocked(v, i)}
                    onContinuous={(v, i) => commands.setLayerContinuous(v, i)}
                    onCollapsed={(v, i) => commands.setLayerCollapsed(v, i)}
                  />
                </span>
              );
            })}
          </div>
        </div>
        <div
          className="xse-timeline-frame-pane"
          style={{
            left: frameLeft * sx,
            top: headerTop * sy,
            right: (2 + timelineScrollbarGutter) * sx,
            height: (timelineBottom - headerTop) * sy,
          }}
          ref={frameScroll}
          aria-label={tUi("ui.frames")}
          onScroll={(event) => {
            setFrameScrollOffset(scrollPosition(event.currentTarget).x);
            setLayerScrollOffset(scrollPosition(event.currentTarget).y);
            if (layerScroll.current)
              setScrollPosition(layerScroll.current, { y: scrollPosition(event.currentTarget).y });
          }}
        >
          <div
            className="xse-timeline-frame-content"
            style={{
              width: scrollableWidth * sx,
              height: (frameHeaderHeight + scrollableHeight) * sy,
            }}
          >
            <div
              className="xse-timeline-frame-header"
              style={{ width: frameWidth * sx, height: frameHeaderHeight * sy }}
            >
              {frameEntries.map(({ frame, index }) => {
                const selected =
                  range?.kind === "frames" ? range.frames.includes(index) : index === activeFrame;
                return (
                  <TimelineCellButton
                    key={`head-${index}`}
                    frameIndex={index}
                    left={index * frameSize}
                    top={0}
                    width={frameSize}
                    height={frameHeaderHeight}
                    part={selected ? "timeline_active" : "timeline_normal"}
                    text={timelineFrameLabel(index, firstFrame)}
                    textColor={
                      selected ? colors?.timeline_active_text : colors?.timeline_normal_text
                    }
                    selected={selected}
                    label={tUi("ui.frame.frame.duration.duration.milliseconds", {
                      frame: firstFrame + index,
                      duration: frame.duration,
                    })}
                    onHover={() => setHot({ layer: -1, frame: index })}
                    onLeave={() => setHot(null)}
                    onClick={() => selectFrame(index)}
                  />
                );
              })}
            </div>
            {layerEntries.map(({ layer, index, row }) => (
              <div
                key={layer.id}
                className="xse-timeline-frame-row"
                style={{
                  top: frameHeaderHeight * sy + row * rowSize * sy,
                  height: rowSize * sy,
                  width: frameWidth * sx,
                }}
              >
                {frameEntries.map(({ frame, index: frameIndex }) => {
                  const cel = frame.cels[index];
                  const leftCel = frameIndex > 0 ? frames[frameIndex - 1].cels[index] : null;
                  const rightCel =
                    frameIndex + 1 < frames.length ? frames[frameIndex + 1].cels[index] : null;
                  const selected = range
                    ? rangeSelected(index, frameIndex)
                    : index === activeLayer && frameIndex === activeFrame;
                  const marker = timelinePartForCel(
                    !!cel,
                    celsShareImage(leftCel, cel),
                    celsShareImage(rightCel, cel),
                  );
                  const activeMarker = marker.replace(/_normal$/, "_active") as UiPartName;
                  return (
                    <TimelineCellButton
                      key={`${layer.id}-${frameIndex}`}
                      frameIndex={frameIndex}
                      layerIndex={index}
                      left={frameIndex * frameSize}
                      top={0}
                      width={frameSize}
                      height={rowSize}
                      part={selected ? "timeline_clicked" : "timeline_normal"}
                      overlayPart={selected ? activeMarker : marker}
                      selected={selected}
                      label={tUi("ui.name.frame.frame.kind", {
                        name: layer.name,
                        frame: firstFrame + frameIndex,
                        kind: tUi(cel ? "ui.keyframe" : "ui.empty"),
                      })}
                      className={cel ? "xse-timeline-cel" : "xse-timeline-empty-cel"}
                      onHover={() => setHot({ layer: index, frame: frameIndex })}
                      onLeave={() => setHot(null)}
                      onClick={() => selectCel(index, frameIndex)}
                    />
                  );
                })}
              </div>
            ))}
          </div>
        </div>
        {scrollableWidth > frameViewportWidth && (
          <Scrollbar
            bounds={{ x: frameLeft, y: timelineBottom - 12, width: frameViewportWidth, height: 12 }}
            relativeTo={bottomOrigin}
            orientation="horizontal"
            contentSize={scrollableWidth}
            visibleSize={frameViewportWidth}
            value={Math.round(frameScrollOffset / sx)}
            onValueChange={(value) => {
              const next = value * sx;
              if (frameScroll.current) setScrollPosition(frameScroll.current, { x: next });
              setFrameScrollOffset(next);
            }}
            variant="transparent"
            aria-label={tUi("ui.timeline.frame.scroll")}
          />
        )}
        {scrollableHeight > rowsHeight && (
          <Scrollbar
            bounds={{ x: timelineRight, y: rowTop, width: 12, height: rowsHeight }}
            relativeTo={bottomOrigin}
            orientation="vertical"
            contentSize={scrollableHeight}
            visibleSize={rowsHeight}
            value={Math.round(layerScrollOffset / sy)}
            onValueChange={(value) => {
              const next = value * sy;
              if (layerScroll.current) setScrollPosition(layerScroll.current, { y: next });
              if (frameScroll.current) setScrollPosition(frameScroll.current, { y: next });
              setLayerScrollOffset(next);
            }}
            variant="mini"
            aria-label={tUi("ui.timeline.layer.scroll")}
          />
        )}
        <div
          {...stylusPointerInputProps()}
          role="separator"
          aria-label={tUi("ui.timeline.layer.column.width")}
          aria-valuemin={2 + minimumColumnWidth}
          aria-valuenow={Math.round(frameLeft)}
          aria-orientation="vertical"
          tabIndex={0}
          data-timeline-separator=""
          style={{
            position: "absolute",
            zIndex: 5,
            left: (frameLeft - 3) * sx,
            top: headerTop * sy - bottomOrigin.y * sy,
            width: 6 * sx,
            height: (timelineBottom - headerTop) * sy,
            cursor: interactions.rangeHot
              ? interactions.rangeCursor === TimelineRangeCursor.Copy
                ? "var(--ui-cursor-copy, copy)"
                : "var(--ui-cursor-move, move)"
              : "col-resize",
            touchAction: "none",
          }}
          onPointerDown={(e) => {
            if (e.button !== 0 || columnDrag.current) return;
            e.preventDefault();
            e.stopPropagation();
            e.currentTarget.focus();
            e.currentTarget.setPointerCapture(e.pointerId);
            columnDrag.current = {
              id: e.pointerId,
              gesture: new PointerResizeGesture(e, {
                axis: PointerDragAxis.Horizontal,
                initialValue: columnWidth,
                pixelsPerUnit:
                  (sx * (clientRect(timelineHost.current)?.width ?? timelineSize.width)) /
                  Math.max(1, timelineSize.width),
              }),
              requestedWidth: requestedColumnWidth,
              handle: e.currentTarget,
              endResize: beginResize(),
            };
          }}
          onPointerMove={moveColumnResize}
          onPointerUp={finishColumnResize}
          onPointerCancel={cancelColumnResize}
          onLostPointerCapture={cancelColumnResize}
          onKeyDown={(e) => {
            if (e.key === "Escape" && columnDrag.current) {
              cancelColumnResize();
              e.preventDefault();
              e.stopPropagation();
            }
            if (e.key === "ArrowLeft" || e.key === "ArrowRight") {
              setColumnWidth((w) => w + (e.key === "ArrowLeft" ? -8 : 8));
              e.preventDefault();
              e.stopPropagation();
            }
          }}
        />
        <EditorOnionSkinRange
          bounds={{
            x: frameLeft,
            y: headerTop,
            width: frameViewportWidth,
            height: frameHeaderHeight,
          }}
          relativeTo={bottomOrigin}
          frameWidth={frameSize}
          scrollOffset={frameScrollScene}
          activeFrame={activeFrame}
          frameCount={frames.length}
          value={coreSnapshot?.view.onionSkin ?? defaultOnionSkinSettings}
          onChange={(value) => commands.setOnionSkin(value)}
          disabled={!timelineManager.active}
        />
        <TimelineTags
          timeline={timeline}
          left={frameLeft}
          top={tagBandTop}
          height={tagBands.height}
          bands={tagBands.bands}
          focusedBand={tagBands.focusedBand}
          bandCount={tagBands.count}
          onFocusBand={tagBands.toggleFocus}
          width={frameViewportWidth}
          scroll={frameScrollScene}
          frameWidth={frameSize}
          firstFrame={firstFrame}
          onPreview={setTagPreview}
        />
        <div
          {...stylusPointerInputProps()}
          role="separator"
          aria-label={tUi("ui.resize.timeline")}
          aria-orientation={verticalDock ? "vertical" : "horizontal"}
          aria-valuenow={Math.round(verticalDock ? timelineSize.width : timelineSize.height)}
          tabIndex={0}
          style={{
            position: "absolute",
            zIndex: 8,
            display: docked ? "none" : undefined,
            touchAction: "none",
            ...(verticalDock
              ? {
                  top: 0,
                  bottom: 0,
                  width: 3 * UI_SCALE,
                  ...(timelinePosition === "left" ? { right: 0 } : { left: 0 }),
                  cursor: "ew-resize",
                }
              : {
                  left: 0,
                  right: 0,
                  height: 3 * UI_SCALE,
                  ...(timelinePosition === "top" ? { bottom: 0 } : { top: 0 }),
                  cursor: "ns-resize",
                }),
          }}
          onPointerDown={(event) => {
            if (event.button !== 0) return;
            event.preventDefault();
            event.currentTarget.setPointerCapture(event.pointerId);
            const extent = verticalDock
              ? (layoutSize(timelineHost.current)?.width ?? dockWidth ?? 0)
              : (layoutSize(timelineHost.current)?.height ?? dockHeight);
            const growsTowardPositive = verticalDock
              ? timelinePosition === "left"
              : timelinePosition === "top";
            const scale = clientScale(timelineHost.current ?? event.currentTarget);
            dockDrag.current = {
              pointer: event.pointerId,
              gesture: new PointerResizeGesture(event, {
                axis: verticalDock ? PointerDragAxis.Horizontal : PointerDragAxis.Vertical,
                initialValue: extent,
                pixelsPerUnit: (verticalDock ? scale.x : scale.y) * (growsTowardPositive ? 1 : -1),
              }),
              extent,
            };
          }}
          onPointerMove={(event) => {
            const drag = dockDrag.current;
            if (drag?.pointer === event.pointerId) {
              const extent = drag.gesture.valueAt(event);
              if (extent !== null) resizeDock(extent);
            }
          }}
          onPointerUp={(event) => {
            dockDrag.current = null;
            if (event.currentTarget.hasPointerCapture(event.pointerId))
              event.currentTarget.releasePointerCapture(event.pointerId);
          }}
          onPointerCancel={() => {
            if (dockDrag.current) {
              if (verticalDock) setDockWidth(dockDrag.current.extent);
              else setDockHeight(dockDrag.current.extent);
            }
            dockDrag.current = null;
          }}
          onLostPointerCapture={() => {
            dockDrag.current = null;
          }}
          onKeyDown={(event) => {
            const positiveKey = verticalDock
              ? timelinePosition === "left"
                ? "ArrowRight"
                : "ArrowLeft"
              : timelinePosition === "top"
                ? "ArrowDown"
                : "ArrowUp";
            const negativeKey = verticalDock
              ? positiveKey === "ArrowRight"
                ? "ArrowLeft"
                : "ArrowRight"
              : positiveKey === "ArrowDown"
                ? "ArrowUp"
                : "ArrowDown";
            if (event.key === positiveKey || event.key === negativeKey) {
              event.preventDefault();
              event.stopPropagation();
              const extent = verticalDock
                ? (layoutSize(timelineHost.current)?.width ?? dockWidth ?? 0)
                : (layoutSize(timelineHost.current)?.height ?? dockHeight);
              resizeDock(extent + (event.key === positiveKey ? 12 : -12) * UI_SCALE);
            }
          }}
        />
        {tilemapDialog && timelineManager.active ? (
          <TilemapDialog
            convert={tilemapDialog === "convert"}
            onClose={() => setTilemapDialog(null)}
          />
        ) : null}
        {renderDialogs ? <TimelineDialogs layerName={layerName} firstFrame={firstFrame} /> : null}
      </section>
    </EditorContextMenu>
  );
}
