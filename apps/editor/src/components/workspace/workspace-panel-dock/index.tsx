import {
  useEffect,
  useMemo,
  useRef,
  useState,
  type MouseEvent as ReactMouseEvent,
  type PointerEvent as ReactPointerEvent,
  type ReactNode,
  type ReactElement,
} from "react";

import { useEditorLayoutSettings } from "$/components/shared/editor-layout-context";
import { useElementSize } from "$/components/shared/use-size";
import {
  WorkspaceDropGuides,
  workspaceDropTargetLabel,
} from "$/components/workspace/workspace-drop-guides";
import { WorkspaceLayoutSelector } from "$/components/workspace/workspace-layout-selector";
import { tUi, tUiSource, useUiLanguage } from "$/i18n";
import { DockEdge } from "$/managers/workspace/dock-edge";
import { useWorkspacePanelLayout } from "$/managers/workspace/use-workspace-panel-layout";
import {
  transferWorkspacePanels,
  workspacePanelDropEdge,
  type WorkspacePanelDrop,
} from "$/managers/workspace/workspace-panel-drop";
import {
  workspacePanelDropGuidance,
  WorkspaceDropGuideScope,
  type WorkspaceDropGuidance,
  type WorkspaceDropSurface,
} from "$/managers/workspace/workspace-panel-drop-guides";
import {
  defaultFloatingWorkspaceGeometry,
  floatingWorkspaceAnchorOffset,
  floatingWorkspaceRect,
  floatingWorkspaceResizeEdges,
  resizeFloatingWorkspaceGeometry,
  toggleFloatingWorkspacePane,
  floatingWorkspaceSize,
  floatingWorkspaceFootprint,
  isWorkspaceBar,
  workspaceBarOrientation,
  workspaceSplitGeometry,
  workspaceSplitSizing,
  WORKSPACE_BAR_GAP,
  WORKSPACE_WINDOW_GAP,
} from "$/managers/workspace/workspace-panel-geometry";
import {
  WorkspaceBarOrientation,
  isWorkspaceBarId,
  FloatingPanePresentation,
  FloatingPaneAnchor,
  canDockWorkspacePanelsAtEdge,
  dockWorkspacePaneAtCanvas,
  dockWorkspacePanelAtEdge,
  workspacePanelIds,
  moveWorkspacePanel,
  panelPanes,
  removeWorkspacePanelPane,
  resizeWorkspacePanelSplit,
  selectWorkspacePanel,
  splitWorkspacePanel,
  type WorkspacePanelLayoutDefaults,
  type FloatingWorkspacePane,
  type WorkspacePanelId,
  type WorkspacePanelNode,
  type WorkspacePanelPane,
  type WorkspacePanelTabNode,
  workspaceTabPanels,
  workspacePaneTabIds,
  workspacePaneTabLayout,
  workspacePaneTabSource,
  removeWorkspacePanePanels,
  mergeWorkspacePaneTabs,
  resizeWorkspacePaneTabSplit,
  type WorkspacePanelLayout,
  type WorkspacePanelResizeTarget,
  type TimelineDockPosition,
} from "$/managers/workspace/workspace-panel-layout";
import { WorkspaceContextPresentation } from "$/managers/workspace/workspace-panel-layout";
import { useWorkspaceResizeScheduler } from "$/managers/workspace/workspace-resize-scheduler";
import {
  Button,
  ButtonVariant,
  ContextMenu as EditorContextMenu,
  LongPressActivation,
  Splitter,
  Tabs,
  Text,
  TextVariant,
  useUi,
} from "@xprite/ui";
import { UiIcon, uiMetrics, type UiPartName } from "@xprite/ui/assets";
import { UI_SCALE } from "@xprite/ui/canvas";
import {
  hitElements,
  clientPoint,
  layoutSize,
  PointerDragActivation,
  PointerDragAxis,
  PointerResizeGesture,
  clientToSurface,
  clientRect,
  clientToLocal,
  stylusPointerInputProps,
} from "@xprite/ui/utils";

import "$/components/workspace/workspace-panel-dock/workspace-panel-dock.module.css";

const labels: Record<WorkspacePanelId, string> = {
  shortcuts: "Shortcuts",
  context: "Context",
  palette: "Palette",
  timeline: "Timeline",
  picker: "Picker",
  tileset: "Tileset",
  tools: "Tools",
};
const panelIcons: Record<WorkspacePanelId, UiPartName> = {
  shortcuts: "icon_save",
  context: "timeline_gear",
  palette: "icon_layout",
  timeline: "tool_timeline",
  picker: "tool_eyedropper",
  tileset: "tiles",
  tools: "tool_pencil",
};
const interactivePaneTarget =
  'button,input,textarea,select,a,canvas,[role="button"],[role="slider"],[role="scrollbar"],[role="tab"],[role="menuitem"],[role="option"],[role="listboxoption"],[data-timeline-kind],[data-palette-index],[data-tile-index],[contenteditable="true"]';
const newId = () =>
  `workspace-float-${globalThis.crypto?.randomUUID?.() ?? Math.random().toString(36).slice(2)}`;
const clamp = (value: number, low: number, high: number) => Math.max(low, Math.min(high, value));
const paneOnly = (pane: FloatingWorkspacePane): WorkspacePanelPane => ({
  kind: "pane",
  id: pane.id,
  tabs: pane.tabs,
  active: pane.active,
  ...(pane.tabLayouts ? { tabLayouts: pane.tabLayouts } : {}),
});
const visiblePane = (
  pane: WorkspacePanelPane,
  tilesetAvailable: boolean,
  hideTimeline = false,
  shortcutPanelVisible = true,
  contextPanelVisible = true,
): WorkspacePanelPane | null => {
  const hidden = pane.tabs.filter(
    (tab) =>
      (tab === "tileset" && !tilesetAvailable) ||
      (hideTimeline && tab === "timeline") ||
      (!shortcutPanelVisible && tab === "shortcuts") ||
      (!contextPanelVisible && tab === "context"),
  );
  const next = removeWorkspacePanePanels(pane, hidden);
  return next ? { ...next, tabs: workspacePaneTabIds(next) } : null;
};
const visiblePanelNode = (
  node: WorkspacePanelNode,
  tilesetAvailable: boolean,
  hideTimeline = false,
  shortcutPanelVisible = true,
  contextPanelVisible = true,
): WorkspacePanelNode | null => {
  if (node.kind === "canvas") return node;
  if (node.kind === "pane")
    return visiblePane(
      node,
      tilesetAvailable,
      hideTimeline,
      shortcutPanelVisible,
      contextPanelVisible,
    );
  const first = visiblePanelNode(
    node.first,
    tilesetAvailable,
    hideTimeline,
    shortcutPanelVisible,
    contextPanelVisible,
  );
  const second = visiblePanelNode(
    node.second,
    tilesetAvailable,
    hideTimeline,
    shortcutPanelVisible,
    contextPanelVisible,
  );
  if (!first) return second;
  if (!second) return first;
  return { ...node, first, second };
};
const nodeContainsTools = (node: WorkspacePanelNode): boolean =>
  node.kind === "pane"
    ? node.tabs.includes("tools")
    : node.kind === "split"
      ? nodeContainsTools(node.first) || nodeContainsTools(node.second)
      : false;
type DropRect = { left: number; top: number; width: number; height: number };
type PanelDrop = WorkspacePanelDrop;
type DragPreview = {
  rect: DropRect;
  kind: "split" | "merge" | "float";
  active: WorkspacePanelId;
  target: PanelDrop;
};
const PANEL_DRAG_THRESHOLD = 4;
const FLOATING_PANEL_ICON_MAX_SIZE = 16;
type PanelDragPoint = Pick<ReactPointerEvent<HTMLElement>, "pointerId" | "clientX" | "clientY">;

export function WorkspacePanelDock({
  renderCanvas,
  renderPanel,
  tilesetAvailable,
  timelineVisible = true,
  timelinePosition = "bottom",
  onTimelinePositionChange,
  onSplitRatioChange,
  layoutEditing,
  layoutDefaults,
  shortcutPanelVisible = true,
}: {
  renderCanvas: () => ReactNode;
  renderPanel: (id: WorkspacePanelId) => ReactNode;
  tilesetAvailable: boolean;
  timelineVisible?: boolean;
  timelinePosition?: TimelineDockPosition;
  onTimelinePositionChange?: (position: TimelineDockPosition) => void;
  onSplitRatioChange?: (target: WorkspacePanelResizeTarget, ratio: number, extent: number) => void;
  layoutEditing: boolean;
  onLayoutEditingChange: (open: boolean) => void;
  layoutDefaults?: WorkspacePanelLayoutDefaults;
  shortcutPanelVisible?: boolean;
}) {
  useUiLanguage();
  const { style } = useUi();
  const barThickness = uiMetrics(style).toolHeight * UI_SCALE;
  const {
    shortScreen,
    savedWorkspaceLayoutId,
    workspaceLayoutConfiguration,
    setWorkspaceLayoutMode,
  } = useEditorLayoutSettings();
  const contextPanelVisible =
    workspaceLayoutConfiguration.chrome.contextBarPresentation ===
    WorkspaceContextPresentation.Docked;
  const panelLabel = (id: WorkspacePanelId) =>
    id === "tileset" && workspaceLayoutConfiguration.panelLayout.defaultArrangement === "stacked"
      ? "Tilemap"
      : labels[id];
  const hideTimeline = !timelineVisible;
  const splitLimits = { min: 0.04, max: 0.96 };
  const {
    layout,
    layoutRef,
    replaceLayout,
    setLayout,
    beginLayoutInteraction,
    endLayoutInteraction,
    layoutSelectionKey,
    recordTimelineDrop,
    resetWorkspacePanelLayout,
    selectWorkspacePanelLayoutMode,
    loadWorkspacePanelLayout,
  } = useWorkspacePanelLayout({
    workspaceLayoutConfiguration,
    savedWorkspaceLayoutId,
    shortScreen,
    layoutDefaults,
    timelinePosition,
    onTimelinePositionChange,
    setWorkspaceLayoutMode,
  });
  const resizeScheduler = useWorkspaceResizeScheduler();
  const moveScheduler = useWorkspaceResizeScheduler();
  // Keep panel element identities stable while only split geometry changes.
  // Their own manager/context subscriptions still deliver document and UI changes.
  const panelContent = useMemo(
    () => new Map(workspacePanelIds.map((id) => [id, renderPanel(id)])),
    [renderPanel],
  );
  const canvasContent = useMemo(() => renderCanvas(), [renderCanvas]);
  const splitResizeDispose = useRef<(() => void) | null>(null);
  useEffect(() => () => splitResizeDispose.current?.(), []);
  const [dropGuidance, setDropGuidance] = useState<WorkspaceDropGuidance | null>(null);
  const dropGuidanceRef = useRef<WorkspaceDropGuidance | null>(null);
  const clearDropGuidance = () => {
    dropGuidanceRef.current = null;
    setDropGuidance(null);
  };
  const floatClickSuppressed = useRef(false);
  const [preview, setPreview] = useState<DragPreview | null>(null);
  const [dragHandle, setDragHandle] = useState<{ x: number; y: number } | null>(null);
  const root = useRef<HTMLDivElement>(null);
  const size = useElementSize(root);
  const dropPlan = useRef<{
    source: string;
    x: number;
    y: number;
    before: WorkspacePanelLayout;
    candidate: WorkspacePanelLayout;
    target: PanelDrop;
  } | null>(null);
  const rootPoint = (x: number, y: number) => {
    return root.current ? clientToSurface(root.current, { x, y }, size) : { x, y };
  };
  useEffect(() => {
    clearDropGuidance();
    setPreview(null);
    dropPlan.current = null;
  }, [layoutSelectionKey]);
  const splitLimitsFor = (node: WorkspacePanelNode, extent: number) => {
    if (node.kind !== "split" || !node.resize || extent <= 0) return splitLimits;
    const { resize } = node;
    const minimumSecondExtent = Math.min(resize.minimumSecondExtent ?? 0, extent);
    const minimumFirstExtent = Math.min(
      resize.minimumFirstExtent ?? 0,
      Math.max(0, extent - minimumSecondExtent),
    );
    const minimum = Math.max(
      resize.minimumFirstRatio ?? splitLimits.min,
      minimumFirstExtent / extent,
    );
    const maximum = Math.min(
      resize.maximumFirstRatio ?? splitLimits.max,
      1 - minimumSecondExtent / extent,
    );
    return { min: Math.min(minimum, maximum), max: maximum };
  };
  const layoutMenuTab = useRef<WorkspacePanelId>("palette");
  const paneMove = useRef<{
    pane: WorkspacePanelPane;
    pointer: number;
    x: number;
    y: number;
    moved: boolean;
  } | null>(null);
  const floatMove = useRef<{
    id: string;
    pointer: number;
    x: number;
    y: number;
    left: number;
    top: number;
    docking: boolean;
    moved: boolean;
    original: WorkspacePanelLayout;
  } | null>(null);
  const floatResize = useRef<{
    id: string;
    pointer: number;
    activation: PointerDragActivation;
    x: number;
    y: number;
    pane: FloatingWorkspacePane;
    moved: boolean;
  } | null>(null);
  const cancelBlankPress = useRef<(() => void) | null>(null);
  const tabDragActive = useRef(false);
  const tabResize = useRef<{
    pointer: number;
    paneId: string;
    splitId: string;
    horizontal: boolean;
    host: HTMLElement;
    gesture: PointerResizeGesture;
    ratio: number;
    moved: boolean;
  } | null>(null);
  const setTabSplitRatio = (paneId: string, splitId: string, ratio: number) =>
    setLayout((current) => {
      const dock = resizeWorkspacePanelSplit(current.dock, splitId, ratio);
      const floats = current.floats.map((pane) =>
        pane.id === paneId ? resizeWorkspacePaneTabSplit(pane, splitId, ratio) : pane,
      );
      return dock === current.dock && floats.every((pane, index) => pane === current.floats[index])
        ? current
        : { ...current, dock, floats };
    });
  const moveTabResize = (event: ReactPointerEvent<HTMLElement>) => {
    const drag = tabResize.current;
    if (!drag || drag.pointer !== event.pointerId) return;
    const candidate = drag.gesture.valueAt(event);
    if (candidate === null) return;
    const ratio = clamp(candidate, 0.04, 0.96);
    resizeScheduler.schedule(() => {
      if (drag.ratio === ratio) return;
      drag.ratio = ratio;
      drag.moved = true;
      const tracks = `minmax(0, ${ratio}fr) ${WORKSPACE_WINDOW_GAP}px minmax(0, ${1 - ratio}fr)`;
      if (drag.horizontal) drag.host.style.gridTemplateColumns = tracks;
      else drag.host.style.gridTemplateRows = tracks;
    });
  };
  const finishTabResize = (event?: ReactPointerEvent<HTMLElement>) => {
    if (!tabResize.current || (event && tabResize.current.pointer !== event.pointerId)) return;
    if (event?.type === "pointerup") moveTabResize(event);
    resizeScheduler.flush();
    const drag = tabResize.current;
    tabResize.current = null;
    if (drag.moved) setTabSplitRatio(drag.paneId, drag.splitId, drag.ratio);
    if (event?.currentTarget.hasPointerCapture(drag.pointer))
      event.currentTarget.releasePointerCapture(drag.pointer);
    endLayoutInteraction();
  };
  const lastBlankTouch = useRef<{ x: number; y: number; at: number } | null>(null);
  useEffect(
    () => () => {
      cancelBlankPress.current?.();
      finishTabResize();
    },
    [],
  );
  useEffect(() => {
    if (layoutEditing) return;
    splitResizeDispose.current?.();
    moveScheduler.cancel();
    resizeScheduler.flush();
    endLayoutInteraction();
    tabResize.current = null;
    cancelBlankPress.current?.();
    tabDragActive.current = false;
    paneMove.current = null;
    floatMove.current = null;
    floatResize.current = null;
    clearDropGuidance();
    setPreview(null);
    setDragHandle(null);
  }, [layoutEditing]);
  const dropAt = (
    x: number,
    y: number,
    sourceFloatId?: string,
    sourceTabs: readonly WorkspacePanelId[] = [],
    showGuides = false,
  ): PanelDrop => {
    const canSplit = (edge: DockEdge, targetTabs: readonly WorkspacePanelId[] = []) =>
      canDockWorkspacePanelsAtEdge([...sourceTabs, ...targetTabs], edge);
    const rootRect = clientRect(root.current);
    if (!rootRect) return { kind: "outside" };
    const point = rootPoint(x, y);
    const panes = panelPanes(layoutRef.current.dock);
    const surfaces: WorkspaceDropSurface[] = [];
    for (const element of root.current?.querySelectorAll<HTMLElement>(
      "[data-workspace-panel-pane],[data-workspace-float-id],[data-workspace-canvas-dock],[data-workspace-tab-panel]",
    ) ?? []) {
      const floatId = element.dataset.workspaceFloatId;
      const paneId = element.dataset.workspacePanelPane;
      const nestedPanel = element.dataset.workspaceTabPanel as WorkspacePanelId | undefined;
      const nestedOwner = element.dataset.workspaceTabOwner;
      const pane = nestedOwner
        ? [...panes, ...layoutRef.current.floats].find((item) => item.id === nestedOwner)
        : floatId
          ? layoutRef.current.floats.find((item) => item.id === floatId)
          : panes.find((item) => item.id === paneId);
      const measured = clientRect(
        paneId ? element.querySelector<HTMLElement>(".xse-workspace-panel-content") : element,
      );
      if (!measured || !measured.width || !measured.height) continue;
      const local = rootPoint(measured.left, measured.top);
      surfaces.push({
        id: nestedPanel
          ? `${nestedOwner}:${nestedPanel}`
          : (floatId ?? paneId ?? "workspace-canvas"),
        scope: nestedPanel
          ? WorkspaceDropGuideScope.Panel
          : floatId
            ? WorkspaceDropGuideScope.Floating
            : paneId
              ? WorkspaceDropGuideScope.Panel
              : WorkspaceDropGuideScope.Canvas,
        tabs: nestedPanel
          ? [nestedPanel]
          : pane && workspacePaneTabIds(pane).length > 1
            ? workspaceTabPanels(workspacePaneTabLayout(pane, pane.active))
            : (pane?.tabs ?? []),
        ...(pane ? { paneId: pane.id } : {}),
        ...(nestedPanel
          ? { tab: element.dataset.workspaceTabRoot as WorkspacePanelId, panel: nestedPanel }
          : pane && workspacePaneTabIds(pane).length > 1
            ? { tab: pane.active }
            : {}),
        rect: {
          left: local.x,
          top: local.y,
          width: (measured.width * size.width) / Math.max(1, rootRect.width),
          height: (measured.height * size.height) / Math.max(1, rootRect.height),
        },
      });
    }
    const dragOrigin = paneMove.current ?? floatMove.current;
    const origin = dragOrigin ? rootPoint(dragOrigin.x, dragOrigin.y) : null;
    const guidance = workspacePanelDropGuidance({
      workspace: { left: 0, top: 0, width: size.width, height: size.height },
      surfaces,
      sourceTabs,
      sourceFloatId,
      x: point.x,
      y: point.y,
      previousGuideId: dropGuidanceRef.current?.selected?.id,
      previousSurfaceId: dropGuidanceRef.current?.surface?.id,
      movement: origin ? { x: point.x - origin.x, y: point.y - origin.y } : undefined,
    });
    for (const element of hitElements({ x: x, y: y }, document)) {
      const tab = element.closest<HTMLElement>(".xse-workspace-panel-tabs [data-ui-tab-value]");
      const host = tab?.closest<HTMLElement>(
        "[data-workspace-panel-pane],[data-workspace-float-id]",
      );
      if (!tab || !host || !root.current?.contains(host)) continue;
      const target = [...panes, ...layoutRef.current.floats].find(
        (pane) => pane.id === (host.dataset.workspacePanelPane ?? host.dataset.workspaceFloatId),
      );
      const tabId = tab.dataset.uiTabValue as WorkspacePanelId;
      if (!target || !target.tabs.includes(tabId)) continue;
      const members = workspaceTabPanels(workspacePaneTabLayout(target, tabId));
      if (members.some((panel) => sourceTabs.includes(panel))) continue;
      const rect = clientRect(tab);
      const edge = x < rect.left + rect.width / 2 ? DockEdge.Left : DockEdge.Right;
      if (!canSplit(edge, members)) continue;
      const local = rootPoint(rect.left, rect.top);
      const guide = {
        id: `tab:${target.id}:${tabId}:${edge}`,
        scope: WorkspaceDropGuideScope.Panel,
        rect: {
          left: local.x,
          top: local.y,
          width: (rect.width * size.width) / Math.max(1, rootRect.width),
          height: (rect.height * size.height) / Math.max(1, rootRect.height),
        },
        target: { kind: "tab" as const, paneId: target.id, tab: tabId, edge },
      };
      guidance.guides.push(guide);
      guidance.selected = guide;
      break;
    }
    if (showGuides) {
      dropGuidanceRef.current = guidance;
      setDropGuidance((current) =>
        JSON.stringify(current) === JSON.stringify(guidance) ? current : guidance,
      );
    }
    if (guidance.selected) return guidance.selected.target;
    if (x < rootRect.left || x >= rootRect.right || y < rootRect.top || y >= rootRect.bottom)
      return { kind: "outside" };
    for (const element of hitElements({ x: x, y: y }, document)) {
      if (element.closest(".xse-workspace-drop-mask, .xse-workspace-drag-handle-ghost")) continue;
      const nested = element.closest<HTMLElement>("[data-workspace-tab-panel]");
      if (nested && root.current?.contains(nested)) {
        const panel = nested.dataset.workspaceTabPanel as WorkspacePanelId;
        const edge = workspacePanelDropEdge(clientRect(nested), x, y) ?? DockEdge.Right;
        return sourceTabs.includes(panel) || !canSplit(edge, [panel])
          ? { kind: "none" }
          : {
              kind: "tab",
              paneId: nested.dataset.workspaceTabOwner!,
              tab: nested.dataset.workspaceTabRoot as WorkspacePanelId,
              panel,
              edge,
            };
      }
      const floating = element.closest<HTMLElement>("[data-workspace-float-id]");
      if (floating && floating.dataset.workspaceFloatId === sourceFloatId) continue;
      if (floating && root.current?.contains(floating)) {
        const target = layout.floats.find((pane) => pane.id === floating.dataset.workspaceFloatId);
        if (!target) return { kind: "none" };
        const tab = element.closest<HTMLElement>("[data-ui-tab-value]");
        const rect = clientRect(tab);
        const next =
          tab?.nextElementSibling instanceof HTMLElement
            ? (tab.nextElementSibling.dataset.uiTabValue as WorkspacePanelId | undefined)
            : undefined;
        return {
          kind: "float",
          paneId: floating.dataset.workspaceFloatId!,
          beforeTab:
            tab && rect && x < rect.left + rect.width / 2
              ? (tab.dataset.uiTabValue as WorkspacePanelId)
              : next,
        };
      }
      const pane = element.closest<HTMLElement>("[data-workspace-panel-pane]");
      if (pane && root.current?.contains(pane)) {
        const tab = element.closest<HTMLElement>("[data-ui-tab-value]");
        const rect = clientRect(tab);
        const tabRow = element.closest<HTMLElement>(".xse-workspace-panel-tab-row");
        if (tabRow && pane.contains(tabRow)) {
          const target = panelPanes(layout.dock).find(
            (item) => item.id === pane.dataset.workspacePanelPane,
          );
          if (!target) return { kind: "none" };
          const next =
            tab?.nextElementSibling instanceof HTMLElement
              ? (tab.nextElementSibling.dataset.uiTabValue as WorkspacePanelId | undefined)
              : undefined;
          return {
            kind: "pane",
            paneId: pane.dataset.workspacePanelPane!,
            beforeTab:
              tab && rect && x < rect.left + rect.width / 2
                ? (tab.dataset.uiTabValue as WorkspacePanelId)
                : next,
          };
        }
        const content = pane.querySelector<HTMLElement>(".xse-workspace-panel-content");
        if (content?.contains(element)) {
          const edge = workspacePanelDropEdge(clientRect(content), x, y);
          const targetTabs = panelPanes(layout.dock).find(
            (item) => item.id === pane.dataset.workspacePanelPane,
          )?.tabs;
          return edge && canSplit(edge, targetTabs)
            ? { kind: "pane", paneId: pane.dataset.workspacePanelPane!, edge }
            : { kind: "pane", paneId: pane.dataset.workspacePanelPane! };
        }
        continue;
      }
      const canvas = element.closest<HTMLElement>("[data-workspace-canvas-dock]");
      if (canvas && root.current?.contains(canvas)) {
        const edge = workspacePanelDropEdge(clientRect(canvas), x, y);
        return edge && canSplit(edge) ? { kind: "canvas", edge } : { kind: "outside" };
      }
    }
    return { kind: "outside" };
  };

  const splitRatioForPanel = (
    tabs: readonly WorkspacePanelId[],
    target: PanelDrop,
    edge: DockEdge,
  ) => {
    const toolsPanel = tabs.length === 1 && isWorkspaceBarId(tabs[0]);
    if (!toolsPanel) return target.kind === "canvas" || target.kind === "workspace" ? 0.3 : 0.5;
    const targetElement =
      target.kind === "pane"
        ? [
            ...(root.current?.querySelectorAll<HTMLElement>("[data-workspace-panel-pane]") ?? []),
          ].find((pane) => pane.dataset.workspacePanelPane === target.paneId)
        : target.kind === "canvas"
          ? root.current?.querySelector<HTMLElement>("[data-workspace-canvas-dock]")
          : target.kind === "workspace"
            ? root.current
            : null;
    const rect = clientRect(targetElement);
    if (!rect) return 0.12;
    const area = clientRect(root.current);
    const horizontal = edge === DockEdge.Left || edge === DockEdge.Right;
    const extent = horizontal
      ? (rect.width * size.width) / Math.max(1, area?.width ?? size.width)
      : (rect.height * size.height) / Math.max(1, area?.height ?? size.height);
    return clamp(barThickness / Math.max(1, extent - WORKSPACE_BAR_GAP), 0.04, 0.96);
  };

  const floatPosition = (
    x: number,
    y: number,
    width: number,
    height: number,
    others: FloatingWorkspacePane[] = [],
    source?: WorkspacePanelPane,
  ) => {
    const maxX = Math.max(0, size.width - width),
      maxY = Math.max(0, size.height - height);
    let left = clamp(x, 0, maxX),
      top = clamp(y, 0, maxY);
    if (left < 18) left = 0;
    else if (maxX - left < 18) left = maxX;
    if (top < 18) top = 0;
    else if (maxY - top < 18) top = maxY;
    for (const pane of others) {
      const gap =
        (source && isWorkspaceBar(source)) || isWorkspaceBar(pane)
          ? WORKSPACE_BAR_GAP
          : WORKSPACE_WINDOW_GAP;
      const otherSize = floatingWorkspaceFootprint(pane, size, barThickness);
      if (Math.abs(left - pane.x - otherSize.width - gap) < 10)
        left = clamp(pane.x + otherSize.width + gap, 0, maxX);
      if (Math.abs(left + width + gap - pane.x) < 10) left = clamp(pane.x - width - gap, 0, maxX);
      if (Math.abs(top - pane.y - otherSize.height - gap) < 10)
        top = clamp(pane.y + otherSize.height + gap, 0, maxY);
      if (Math.abs(top + height + gap - pane.y) < 10) top = clamp(pane.y - height - gap, 0, maxY);
    }
    return { x: left, y: top };
  };
  const newFloatingPane = (
    pane: WorkspacePanelPane,
    x: number,
    y: number,
    others: FloatingWorkspacePane[],
  ): FloatingWorkspacePane => {
    const point = rootPoint(x, y);
    const source = clientRect(
      [...(root.current?.querySelectorAll<HTMLElement>("[data-workspace-panel-pane]") ?? [])].find(
        (element) =>
          element.dataset.workspacePanelPane === pane.id ||
          element.dataset.workspacePaneTabs?.split(",").includes(pane.active),
      ),
    );
    const geometry = defaultFloatingWorkspaceGeometry(pane, size, barThickness, source);
    const { width, height } = geometry;
    const position = floatPosition(point.x - 42, point.y - 20, width, height, others, pane);
    return { ...pane, ...position, ...geometry };
  };
  const previewForLayout = (
    candidate: WorkspacePanelLayout,
    target: PanelDrop,
    active: WorkspacePanelId,
    sourcePanels: readonly WorkspacePanelId[] = [active],
  ): DragPreview | null => {
    const locateTab = (node: WorkspacePanelTabNode, rect: DropRect): DropRect | null => {
      if (workspaceTabPanels(node).every((panel) => sourcePanels.includes(panel))) return rect;
      if (node.kind === "panel") return null;
      const horizontal = node.axis === "horizontal";
      const extent = Math.max(0, (horizontal ? rect.width : rect.height) - WORKSPACE_WINDOW_GAP);
      const first = extent * node.ratio;
      return (
        locateTab(
          node.first,
          horizontal ? { ...rect, width: first } : { ...rect, height: first },
        ) ??
        locateTab(
          node.second,
          horizontal
            ? { ...rect, left: rect.left + first + WORKSPACE_WINDOW_GAP, width: extent - first }
            : { ...rect, top: rect.top + first + WORKSPACE_WINDOW_GAP, height: extent - first },
        )
      );
    };
    const locate = (node: WorkspacePanelNode, rect: DropRect): DropRect | null => {
      if (node.kind === "canvas") return null;
      if (node.kind === "pane") {
        const content = workspacePaneTabLayout(node, node.active);
        if (target.kind === "tab" && node.id === target.paneId) {
          const header =
            workspacePaneTabIds(node).length > 1
              ? workspaceLayoutConfiguration.surface.panelTabHeight
              : 0;
          return locateTab(content, {
            ...rect,
            top: rect.top + header,
            height: Math.max(0, rect.height - header),
          });
        }
        return node.tabs.includes(active) || workspaceTabPanels(content).includes(active)
          ? rect
          : null;
      }
      const horizontal = node.axis === "horizontal";
      const extent = horizontal ? rect.width : rect.height;
      const {
        first: firstSize,
        second: secondSize,
        gap,
      } = workspaceSplitGeometry(
        node,
        extent,
        barThickness,
        clamp(
          node.ratio,
          splitLimitsFor(node, horizontal ? size.width : size.height).min,
          splitLimitsFor(node, horizontal ? size.width : size.height).max,
        ),
      );
      const first = horizontal ? { ...rect, width: firstSize } : { ...rect, height: firstSize };
      const second = horizontal
        ? {
            ...rect,
            left: rect.left + firstSize + gap,
            width: secondSize,
          }
        : {
            ...rect,
            top: rect.top + firstSize + gap,
            height: secondSize,
          };
      return locate(node.first, first) ?? locate(node.second, second);
    };
    const floating = candidate.floats.find((pane) => pane.tabs.includes(active));
    const { width, height } = floating
      ? floatingWorkspaceFootprint(floating, size, barThickness)
      : { width: 0, height: 0 };
    let rect = floating
      ? {
          left: clamp(floating.x, 0, Math.max(0, size.width - width)),
          top: clamp(floating.y, 0, Math.max(0, size.height - height)),
          width,
          height,
        }
      : locate(
          visiblePanelNode(
            candidate.dock,
            tilesetAvailable,
            hideTimeline,
            shortcutPanelVisible,
            contextPanelVisible,
          ) ?? { kind: "canvas", id: "workspace-canvas" },
          { left: 0, top: 0, width: size.width, height: size.height },
        );
    if (!rect) return null;
    if (floating && target.kind === "tab") {
      const host = [
        ...(root.current?.querySelectorAll<HTMLElement>("[data-workspace-float-id]") ?? []),
      ].find((element) => element.dataset.workspaceFloatId === target.paneId);
      const bounds = clientRect(host?.querySelector<HTMLElement>(".xse-workspace-panel-content"));
      if (bounds) {
        const local = rootPoint(bounds.left, bounds.top);
        rect =
          locateTab(workspacePaneTabLayout(floating, floating.active), {
            left: local.x,
            top: local.y,
            width:
              (bounds.width * size.width) /
              Math.max(1, clientRect(root.current)?.width ?? size.width),
            height:
              (bounds.height * size.height) /
              Math.max(1, clientRect(root.current)?.height ?? size.height),
          }) ?? rect;
      }
    }
    const kind =
      (target.kind === "tab" ||
        target.kind === "pane" ||
        target.kind === "canvas" ||
        target.kind === "workspace") &&
      target.edge
        ? "split"
        : target.kind === "pane" || target.kind === "float"
          ? "merge"
          : "float";
    return { active, kind, rect, target };
  };
  const layoutAfterTabDrop = (
    current: WorkspacePanelLayout,
    tab: WorkspacePanelId,
    target: PanelDrop,
    x: number,
    y: number,
    sourceFloatId?: string,
    sourcePaneId?: string,
  ): WorkspacePanelLayout => {
    const sourceFloat = current.floats.find((pane) => pane.id === sourceFloatId);
    const owner = sourcePaneId
      ? [...panelPanes(current.dock), ...current.floats].find((pane) => pane.id === sourcePaneId)
      : undefined;
    const pane: WorkspacePanelPane = owner
      ? workspacePaneTabSource(owner, tab)
      : { kind: "pane", id: newId(), tabs: [tab], active: tab };
    const floating = newFloatingPane(pane, x, y, current.floats);
    if (sourceFloat && workspacePaneTabIds(sourceFloat).length === 1) {
      floating.width = sourceFloat.width;
      floating.height = sourceFloat.height;
      floating.barOrientation = sourceFloat.barOrientation;
      floating.anchor = sourceFloat.anchor;
      floating.id = sourceFloat.id;
      const point = rootPoint(x, y);
      Object.assign(
        floating,
        floatPosition(
          point.x - 42,
          point.y - 20,
          floatingWorkspaceSize(floating, size, barThickness).width,
          floatingWorkspaceSize(floating, size, barThickness).height,
          current.floats.filter((item) => item.id !== sourceFloat.id),
          floating,
        ),
      );
    }
    return transferWorkspacePanels(
      current,
      pane,
      target,
      floating,
      "edge" in target && target.edge ? splitRatioForPanel(pane.tabs, target, target.edge) : 0.5,
    );
  };
  const applyTabDrop = (
    tab: WorkspacePanelId,
    x: number,
    y: number,
    sourceFloatId?: string,
    sourcePaneId?: string,
  ) => {
    const plan = dropPlan.current;
    const before = layoutRef.current;
    const owner = sourcePaneId
      ? [...panelPanes(before.dock), ...before.floats].find((pane) => pane.id === sourcePaneId)
      : undefined;
    const target =
      plan?.source === `tab:${tab}` &&
      plan.x === x &&
      plan.y === y &&
      plan.before === layoutRef.current
        ? plan.target
        : dropAt(x, y, sourceFloatId, owner ? workspacePaneTabSource(owner, tab).tabs : [tab]);
    clearDropGuidance();
    setPreview(null);
    const next =
      plan?.source === `tab:${tab}` && plan.x === x && plan.y === y && plan.before === before
        ? plan.candidate
        : layoutAfterTabDrop(before, tab, target, x, y, sourceFloatId, sourcePaneId);
    setLayout(next);
    dropPlan.current = null;
    if (
      next !== before &&
      (target.kind === "pane" || target.kind === "canvas" || target.kind === "workspace")
    )
      recordTimelineDrop([tab], target.edge);
  };
  const layoutAfterPaneDrop = (
    current: WorkspacePanelLayout,
    pane: WorkspacePanelPane,
    target: PanelDrop,
    x: number,
    y: number,
  ): WorkspacePanelLayout => {
    return transferWorkspacePanels(
      current,
      pane,
      target,
      newFloatingPane(pane, x, y, current.floats),
      "edge" in target && target.edge ? splitRatioForPanel(pane.tabs, target, target.edge) : 0.5,
    );
  };
  const applyPaneDrop = (pane: WorkspacePanelPane, x: number, y: number) => {
    const plan = dropPlan.current;
    const before = layoutRef.current;
    const target =
      plan?.source === pane.id && plan.x === x && plan.y === y && plan.before === layoutRef.current
        ? plan.target
        : dropAt(x, y, undefined, pane.tabs);
    clearDropGuidance();
    setPreview(null);
    const next =
      plan?.source === pane.id && plan.x === x && plan.y === y && plan.before === before
        ? plan.candidate
        : layoutAfterPaneDrop(before, pane, target, x, y);
    setLayout(next);
    dropPlan.current = null;
    if (
      next !== before &&
      (target.kind === "pane" || target.kind === "canvas" || target.kind === "workspace")
    )
      recordTimelineDrop(pane.tabs, target.edge);
  };
  const previewTabDrop = (
    tab: WorkspacePanelId,
    x: number,
    y: number,
    sourceFloatId?: string,
    sourcePaneId?: string,
  ) => {
    const before = layoutRef.current;
    const owner = sourcePaneId
      ? [...panelPanes(before.dock), ...before.floats].find((pane) => pane.id === sourcePaneId)
      : undefined;
    const target = dropAt(
      x,
      y,
      sourceFloatId,
      owner ? workspacePaneTabSource(owner, tab).tabs : [tab],
      true,
    );
    const candidate = layoutAfterTabDrop(before, tab, target, x, y, sourceFloatId, sourcePaneId);
    dropPlan.current = { source: `tab:${tab}`, x, y, before, candidate, target };
    setPreview(
      candidate === before
        ? null
        : previewForLayout(
            candidate,
            target,
            tab,
            owner ? workspacePaneTabSource(owner, tab).tabs : [tab],
          ),
    );
  };
  const previewPaneDrop = (pane: WorkspacePanelPane, x: number, y: number) => {
    const target = dropAt(x, y, undefined, pane.tabs, true);
    const before = layoutRef.current;
    const candidate = layoutAfterPaneDrop(before, pane, target, x, y);
    dropPlan.current = { source: pane.id, x, y, before, candidate, target };
    setPreview(
      candidate === before ? null : previewForLayout(candidate, target, pane.active, pane.tabs),
    );
  };
  const beginPaneMove = (event: ReactPointerEvent<HTMLElement>, pane: WorkspacePanelPane) => {
    if (event.button !== 0) return;
    event.preventDefault();
    event.stopPropagation();
    event.currentTarget.setPointerCapture(event.pointerId);
    paneMove.current = {
      pane,
      pointer: event.pointerId,
      x: clientPoint(event).x,
      y: clientPoint(event).y,
      moved: false,
    };
  };
  const applyPaneMove = (event: PanelDragPoint) => {
    const drag = paneMove.current;
    if (!drag || drag.pointer !== event.pointerId) return;
    if (
      !drag.moved &&
      Math.hypot(clientPoint(event).x - drag.x, clientPoint(event).y - drag.y) <
        PANEL_DRAG_THRESHOLD
    )
      return;
    drag.moved = true;
    const host = root.current;
    const bounds = clientRect(host);
    if (host && bounds?.width && bounds.height)
      setDragHandle(clientToLocal(host, clientPoint(event)));
    if (drag.pane.tabs.length === 1)
      previewTabDrop(drag.pane.active, clientPoint(event).x, clientPoint(event).y);
    else previewPaneDrop(drag.pane, clientPoint(event).x, clientPoint(event).y);
  };
  const movePane = (event: ReactPointerEvent<HTMLElement>) => {
    if (paneMove.current?.pointer !== event.pointerId) return;
    const point = {
      pointerId: event.pointerId,
      clientX: clientPoint(event).x,
      clientY: clientPoint(event).y,
    };
    moveScheduler.schedule(() => applyPaneMove(point));
  };
  const endPaneMove = (event: ReactPointerEvent<HTMLElement>) => {
    // Some pointer implementations report the final position only on pointerup.
    // Process it before checking whether the drag crossed the movement threshold.
    movePane(event);
    moveScheduler.flush();
    const drag = paneMove.current;
    if (!drag || drag.pointer !== event.pointerId) return;
    paneMove.current = null;
    setDragHandle(null);
    if (event.currentTarget.hasPointerCapture(event.pointerId))
      event.currentTarget.releasePointerCapture(event.pointerId);
    if (drag.moved) {
      if (drag.pane.tabs.length === 1)
        applyTabDrop(drag.pane.active, clientPoint(event).x, clientPoint(event).y);
      else applyPaneDrop(drag.pane, clientPoint(event).x, clientPoint(event).y);
    } else setPreview(null);
  };
  const cancelPaneMove = () => {
    moveScheduler.cancel();
    paneMove.current = null;
    setDragHandle(null);
    clearDropGuidance();
    setPreview(null);
  };
  const cancelFloatingHeaderMove = () => {
    moveScheduler.cancel();
    const moved = floatMove.current?.moved;
    if (floatMove.current) replaceLayout(floatMove.current.original);
    floatMove.current = null;
    if (moved) endLayoutInteraction();
    clearDropGuidance();
    setPreview(null);
  };
  useEffect(() => {
    const cancel = () => {
      moveScheduler.cancel();
      const moved = floatMove.current?.moved;
      if (floatMove.current) replaceLayout(floatMove.current.original);
      paneMove.current = null;
      floatMove.current = null;
      if (moved) endLayoutInteraction();
      cancelBlankPress.current?.();
      dropPlan.current = null;
      setDragHandle(null);
      clearDropGuidance();
      setPreview(null);
    };
    const key = (event: KeyboardEvent) => {
      if (event.key === "Escape" && (paneMove.current || floatMove.current)) {
        event.preventDefault();
        cancel();
      }
    };
    window.addEventListener("blur", cancel);
    document.addEventListener("keydown", key);
    return () => {
      window.removeEventListener("blur", cancel);
      document.removeEventListener("keydown", key);
    };
  }, [replaceLayout, moveScheduler, endLayoutInteraction]);
  const beginBlankPress = (
    event: ReactPointerEvent<HTMLElement>,
    pane: WorkspacePanelPane,
    floating = false,
  ) => {
    if (!layoutEditing || event.button !== 0 || !(event.target instanceof Element)) return;
    const target = event.target;
    const edge = target.closest(".xse-workspace-pane-edge-handle");
    const interactive = target.closest(interactivePaneTarget);
    if (edge || interactive) return;
    if (event.pointerType !== "touch") return;
    lastBlankTouch.current = { x: clientPoint(event).x, y: clientPoint(event).y, at: Date.now() };
    cancelBlankPress.current?.();
    const host = event.currentTarget;
    const handle = host.querySelector<HTMLElement>(
      floating ? ".xse-floating-workspace-titlebar" : ".xse-workspace-pane-edge-handle",
    );
    if (!handle) return;
    const pointer = event.pointerId,
      x = clientPoint(event).x,
      y = clientPoint(event).y;
    let ready = false,
      cancelled = false;
    const cancel = () => {
      if (cancelled) return;
      cancelled = true;
      window.clearTimeout(timer);
      window.removeEventListener("pointermove", move);
      window.removeEventListener("pointerup", finish);
      window.removeEventListener("pointercancel", finish);
      window.removeEventListener("blur", cancel);
      host.removeEventListener("touchmove", stopScroll);
      if (cancelBlankPress.current === cancel) cancelBlankPress.current = null;
    };
    const move = (next: globalThis.PointerEvent) => {
      if (next.pointerId !== pointer) return;
      lastBlankTouch.current = { x: clientPoint(next).x, y: clientPoint(next).y, at: Date.now() };
      if (!ready && Math.hypot(clientPoint(next).x - x, clientPoint(next).y - y) >= 9) cancel();
    };
    const finish = (next: globalThis.PointerEvent) => {
      if (next.pointerId === pointer) cancel();
    };
    const stopScroll = (next: TouchEvent) => {
      if (ready) next.preventDefault();
    };
    const timer = window.setTimeout(() => {
      if (cancelled) return;
      try {
        handle.setPointerCapture(pointer);
      } catch {
        cancel();
        return;
      }
      ready = true;
      if (floating) {
        const source = pane as FloatingWorkspacePane;
        const rect = floatingWorkspaceRect(source, size, barThickness);
        floatMove.current = {
          id: source.id,
          pointer,
          x,
          y,
          left: rect.x,
          top: rect.y,
          docking: layoutEditing,
          moved: false,
          original: layoutRef.current,
        };
      } else paneMove.current = { pane, pointer, x, y, moved: false };
    }, 450);
    cancelBlankPress.current = cancel;
    window.addEventListener("pointermove", move);
    window.addEventListener("pointerup", finish);
    window.addEventListener("pointercancel", finish);
    window.addEventListener("blur", cancel);
    host.addEventListener("touchmove", stopScroll, { passive: false });
  };
  const suppressBlankContext = (event: ReactMouseEvent<HTMLElement>) => {
    if (!(event.target instanceof Element) || event.target.closest(interactivePaneTarget)) return;
    const originalEvent = event.nativeEvent as MouseEvent & {
      pointerType?: string;
      sourceCapabilities?: { firesTouchEvents?: boolean };
    };
    const recent = lastBlankTouch.current;
    if (
      cancelBlankPress.current ||
      originalEvent.pointerType === "touch" ||
      originalEvent.sourceCapabilities?.firesTouchEvents ||
      (recent &&
        Date.now() - recent.at < 1400 &&
        Math.hypot(
          clientPoint(originalEvent).x - recent.x,
          clientPoint(originalEvent).y - recent.y,
        ) < 32)
    )
      event.preventDefault();
  };
  const updateFloat = (
    id: string,
    update: (pane: FloatingWorkspacePane) => FloatingWorkspacePane,
  ) =>
    setLayout((current) => ({
      ...current,
      floats: current.floats.map((pane) => (pane.id === id ? update(pane) : pane)),
    }));

  const withPaneMenu = (
    pane: WorkspacePanelPane,
    floating: boolean,
    control: ReactElement,
    displayedPane: WorkspacePanelPane = visiblePane(
      pane,
      tilesetAvailable,
      hideTimeline,
      shortcutPanelVisible,
      contextPanelVisible,
    ) ?? pane,
  ): ReactNode => (
    <EditorContextMenu
      label="Panel layout"
      longPressActivation={LongPressActivation.Release}
      canOpenTouchMenu={(_, target) =>
        !target.closest('.xse-workspace-pane-edge-handle,[role="separator"]') &&
        !paneMove.current?.moved &&
        !tabDragActive.current &&
        !floatMove.current &&
        !floatResize.current
      }
      longPressTarget={
        displayedPane.tabs.length === 1
          ? ".xse-workspace-pane-edge-handle,.xse-workspace-float-action,[data-workspace-panel-launcher]"
          : "[data-ui-tab-value],.xse-workspace-float-action,[data-workspace-panel-launcher]"
      }
      onContextMenu={(event) => {
        const value =
          displayedPane.tabs.length === 1 ||
          (event.target as Element).closest(
            ".xse-workspace-float-action,[data-workspace-panel-launcher]",
          )
            ? displayedPane.active
            : (event.target as Element).closest<HTMLElement>("[data-ui-tab-value]")?.dataset
                .uiTabValue;
        if (!workspacePanelIds.includes(value as WorkspacePanelId)) {
          event.preventDefault();
          return;
        }
        layoutMenuTab.current = value as WorkspacePanelId;
      }}
      items={[
        {
          label:
            floating &&
            (pane as FloatingWorkspacePane).presentation === FloatingPanePresentation.Button
              ? "Keep panel open"
              : "Collapse to button",
          onSelect: () => {
            if (floating)
              updateFloat(pane.id, (current) =>
                toggleFloatingWorkspacePane(current, size, barThickness),
              );
            else
              setLayout((current) => ({
                dock: removeWorkspacePanelPane(current.dock, pane.id),
                floats: [
                  ...current.floats,
                  {
                    ...newFloatingPane(
                      pane,
                      (clientRect(root.current)?.left ?? 0) +
                        (clientRect(root.current)?.width ?? size.width) / 2,
                      (clientRect(root.current)?.top ?? 0) +
                        (clientRect(root.current)?.height ?? size.height) / 2,
                      current.floats,
                    ),
                    presentation: FloatingPanePresentation.Button,
                  },
                ],
              }));
          },
        },
        ...([DockEdge.Left, DockEdge.Right, DockEdge.Top, DockEdge.Bottom] as const)
          .filter((edge) => canDockWorkspacePanelsAtEdge(pane.tabs, edge))
          .map((edge) => ({
            label:
              floating || isWorkspaceBar(pane)
                ? tUi("ui.dock", { value1: tUiSource(edge) })
                : tUi("ui.split", { value1: tUiSource(edge) }),
            onSelect: () => {
              setLayout((current) =>
                isWorkspaceBar(pane)
                  ? {
                      dock: dockWorkspacePanelAtEdge(
                        current.dock,
                        pane.active,
                        edge,
                        splitRatioForPanel(pane.tabs, { kind: "workspace", edge }, edge),
                      ),
                      floats: current.floats.filter((item) => item.id !== pane.id),
                    }
                  : floating
                    ? {
                        dock: dockWorkspacePaneAtCanvas(
                          current.dock,
                          paneOnly(pane as FloatingWorkspacePane),
                          edge,
                          splitRatioForPanel(pane.tabs, { kind: "canvas", edge }, edge),
                        ),
                        floats: current.floats.filter((item) => item.id !== pane.id),
                      }
                    : {
                        ...current,
                        dock: splitWorkspacePanel(
                          current.dock,
                          layoutMenuTab.current,
                          pane.id,
                          edge,
                          splitRatioForPanel(
                            [layoutMenuTab.current],
                            { kind: "pane", paneId: pane.id, edge },
                            edge,
                          ),
                        ),
                      },
              );
              recordTimelineDrop(floating ? pane.tabs : [layoutMenuTab.current], edge);
            },
          })),
        ...(floating && isWorkspaceBar(pane) && pane.active !== "context"
          ? [
              {
                label:
                  workspaceBarOrientation(pane as FloatingWorkspacePane) ===
                  WorkspaceBarOrientation.Horizontal
                    ? "Vertical"
                    : "Horizontal",
                onSelect: () =>
                  updateFloat(pane.id, (current) => {
                    const { width, height } = floatingWorkspaceSize(current, size, barThickness);
                    return {
                      ...current,
                      width: height,
                      height: width,
                      barOrientation:
                        workspaceBarOrientation(current) === WorkspaceBarOrientation.Horizontal
                          ? WorkspaceBarOrientation.Vertical
                          : WorkspaceBarOrientation.Horizontal,
                    };
                  }),
              },
            ]
          : []),
        ...(!floating
          ? [
              {
                label: "Float panel",
                separator: true,
                onSelect: () =>
                  setLayout((current) => ({
                    dock: removeWorkspacePanelPane(current.dock, pane.id),
                    floats: [
                      ...current.floats,
                      newFloatingPane(
                        pane,
                        (clientRect(root.current)?.left ?? 0) +
                          (clientRect(root.current)?.width ?? size.width) / 2,
                        (clientRect(root.current)?.top ?? 0) +
                          (clientRect(root.current)?.height ?? size.height) / 2,
                        current.floats,
                      ),
                    ],
                  })),
              },
            ]
          : []),
        {
          label: "Reset panel layout",
          separator: true,
          onSelect: resetWorkspacePanelLayout,
        },
      ]}
    >
      {control}
    </EditorContextMenu>
  );

  const renderTabs = (
    pane: WorkspacePanelPane,
    floating = false,
    displayedPane: WorkspacePanelPane = visiblePane(
      pane,
      tilesetAvailable,
      hideTimeline,
      shortcutPanelVisible,
      contextPanelVisible,
    ) ?? pane,
  ): ReactNode => (
    <Tabs
      className="xse-workspace-panel-tabs"
      narrowTabWidth={75}
      tabs={displayedPane.tabs.map((tab) => ({
        id: tab,
        label: panelLabel(tab),
        translateLabel: true,
        closable: false,
      }))}
      value={displayedPane.active}
      width={displayedPane.tabs.length * 75 + 8}
      paneId={pane.id}
      dragEnabled={layoutEditing}
      ariaLabel="Panels"
      tabListLabel="Panels"
      onValueChange={(tab) => {
        if (floating)
          updateFloat(pane.id, (current) => ({ ...current, active: tab as WorkspacePanelId }));
        else
          setLayout((current) => ({
            ...current,
            dock: selectWorkspacePanel(current.dock, pane.id, tab as WorkspacePanelId),
          }));
      }}
      onReorder={
        layoutEditing
          ? (id, target) => {
              if (floating)
                updateFloat(pane.id, (current) => {
                  const from = displayedPane.tabs.indexOf(id as WorkspacePanelId),
                    to = displayedPane.tabs.indexOf(target as WorkspacePanelId);
                  if (from < 0 || to < 0) return current;
                  const visibleBefore =
                    from < to ? displayedPane.tabs[to + 1] : (target as WorkspacePanelId);
                  const source = workspacePaneTabSource(current, id as WorkspacePanelId);
                  const remaining = removeWorkspacePanePanels(current, source.tabs);
                  return remaining
                    ? mergeWorkspacePaneTabs(remaining, source, visibleBefore)
                    : current;
                });
              else
                setLayout((current) => {
                  const from = displayedPane.tabs.indexOf(id as WorkspacePanelId),
                    to = displayedPane.tabs.indexOf(target as WorkspacePanelId);
                  return from < 0 || to < 0
                    ? current
                    : {
                        ...current,
                        dock: moveWorkspacePanel(
                          current.dock,
                          id as WorkspacePanelId,
                          pane.id,
                          from < to ? displayedPane.tabs[to + 1] : (target as WorkspacePanelId),
                        ),
                      };
                });
            }
          : undefined
      }
      onDragMove={(id, point) => {
        if (!layoutEditing) return;
        tabDragActive.current = true;
        if (point.floating)
          previewTabDrop(
            id as WorkspacePanelId,
            point.x,
            point.y,
            floating ? pane.id : undefined,
            pane.id,
          );
        else {
          clearDropGuidance();
          dropPlan.current = null;
          setPreview(null);
        }
      }}
      onDragEnd={(id, point, cancelled) => {
        tabDragActive.current = false;
        clearDropGuidance();
        setPreview(null);
        if (layoutEditing && !cancelled && point.floating)
          applyTabDrop(
            id as WorkspacePanelId,
            point.x,
            point.y,
            floating ? pane.id : undefined,
            pane.id,
          );
      }}
    />
  );
  const renderTabContent = (
    node: WorkspacePanelTabNode,
    owner: WorkspacePanelPane,
    tab: WorkspacePanelId,
  ): ReactNode => {
    if (node.kind === "panel") {
      const pane: WorkspacePanelPane = {
        kind: "pane",
        id: `${owner.id}:${node.panel}`,
        tabs: [node.panel],
        active: node.panel,
      };
      return (
        <section
          key={node.panel}
          className="xse-workspace-panel-pane xse-workspace-tab-panel"
          data-workspace-tab-panel={node.panel}
          data-workspace-tab-owner={owner.id}
          data-workspace-tab-root={tab}
          data-workspace-pane-tabs={node.panel}
          onPointerDownCapture={layoutEditing ? (event) => beginBlankPress(event, pane) : undefined}
          onContextMenu={suppressBlankContext}
        >
          <button
            type="button"
            {...stylusPointerInputProps()}
            className="xse-workspace-pane-edge-handle"
            aria-label={tUi("ui.move.panel")}
            title={tUi("ui.move.panel")}
            onPointerDown={(event) => beginPaneMove(event, pane)}
            onPointerMove={movePane}
            onPointerUp={endPaneMove}
            onPointerCancel={cancelPaneMove}
            onLostPointerCapture={cancelPaneMove}
          >
            <UiIcon
              part="icon_layout"
              scale={2}
              color="var(--xse-workspace-pane-handle-icon-color, var(--xse-window-tooltip-text, #000000))"
            />
          </button>
          <div
            className="xse-workspace-panel-content"
            role="tabpanel"
            aria-label={tUiSource(panelLabel(node.panel))}
          >
            {panelContent.get(node.panel)}
          </div>
        </section>
      );
    }
    const horizontal = node.axis === "horizontal";
    return (
      <div
        key={node.id}
        className="xse-workspace-tab-split"
        data-axis={node.axis}
        style={
          horizontal
            ? {
                gridTemplateColumns: `minmax(0, ${node.ratio}fr) ${WORKSPACE_WINDOW_GAP}px minmax(0, ${1 - node.ratio}fr)`,
              }
            : {
                gridTemplateRows: `minmax(0, ${node.ratio}fr) ${WORKSPACE_WINDOW_GAP}px minmax(0, ${1 - node.ratio}fr)`,
              }
        }
      >
        {renderTabContent(node.first, owner, tab)}
        <Splitter
          className="xse-workspace-panel-splitter"
          axis={node.axis}
          aria-label={tUi("ui.resize.panels")}
          aria-valuemin={4}
          aria-valuemax={96}
          aria-valuenow={Math.round(node.ratio * 100)}
          onPointerDown={(event) => {
            if (event.button !== 0) return;
            event.preventDefault();
            event.stopPropagation();
            cancelBlankPress.current?.();
            const rect = clientRect(event.currentTarget.parentElement);
            const host = event.currentTarget.parentElement;
            if (!rect || !host || tabResize.current) return;
            const extent = horizontal ? layoutSize(host).width : layoutSize(host).height;
            const screenExtent = horizontal ? rect.width : rect.height;
            event.currentTarget.setPointerCapture(event.pointerId);
            tabResize.current = {
              pointer: event.pointerId,
              paneId: owner.id,
              splitId: node.id,
              horizontal,
              host,
              gesture: new PointerResizeGesture(event, {
                axis: horizontal ? PointerDragAxis.Horizontal : PointerDragAxis.Vertical,
                initialValue: node.ratio,
                pixelsPerUnit:
                  (Math.max(1, extent - WORKSPACE_WINDOW_GAP) * screenExtent) / Math.max(1, extent),
              }),
              ratio: node.ratio,
              moved: false,
            };
            beginLayoutInteraction();
          }}
          onPointerMove={moveTabResize}
          onPointerUp={finishTabResize}
          onPointerCancel={finishTabResize}
          onLostPointerCapture={finishTabResize}
          onKeyDown={(event) => {
            const direction = horizontal
              ? event.key === "ArrowRight"
                ? 1
                : event.key === "ArrowLeft"
                  ? -1
                  : 0
              : event.key === "ArrowDown"
                ? 1
                : event.key === "ArrowUp"
                  ? -1
                  : 0;
            if (!direction) return;
            event.preventDefault();
            setTabSplitRatio(
              owner.id,
              node.id,
              node.ratio + direction * (event.shiftKey ? 0.08 : 0.02),
            );
          }}
        />
        {renderTabContent(node.second, owner, tab)}
      </div>
    );
  };
  const renderPaneContent = (
    pane: WorkspacePanelPane,
    displayed: WorkspacePanelPane,
  ): ReactNode => {
    const content = workspacePaneTabLayout(displayed, displayed.active);
    return content.kind === "panel"
      ? panelContent.get(content.panel)
      : renderTabContent(content, pane, displayed.active);
  };
  const renderNode = (node: WorkspacePanelNode): ReactNode => {
    if (node.kind === "canvas")
      return (
        <section key={node.id} className="xse-workspace-canvas-dock" data-workspace-canvas-dock="">
          {canvasContent}
        </section>
      );
    if (node.kind === "split") {
      const horizontal = node.axis === "horizontal";
      const fixed = workspaceSplitSizing(node, barThickness);
      const fixedBar = fixed.first !== null || fixed.second !== null;
      const gap = fixed.gap;
      const toolPaneSide = nodeContainsTools(node.first)
        ? "first"
        : nodeContainsTools(node.second)
          ? "second"
          : undefined;
      const splitExtent = horizontal ? size.width : size.height;
      const limits = splitLimitsFor(node, splitExtent);
      const ratio = clamp(node.ratio, limits.min, limits.max);
      const startResize = (event: ReactPointerEvent<HTMLDivElement>) => {
        if (event.button !== 0) return;
        event.preventDefault();
        const target = event.currentTarget.parentElement;
        if (!target) return;
        const rect = clientRect(target);
        const extent = horizontal ? layoutSize(target).width : layoutSize(target).height;
        const screenExtent = horizontal ? rect.width : rect.height;
        const coordinateScale = screenExtent / Math.max(1, extent);
        const availableExtent = Math.max(1, extent - gap);
        const limits = splitLimitsFor(node, extent);
        let pendingRatio = ratio;
        const gesture = new PointerResizeGesture(event, {
          axis: horizontal ? PointerDragAxis.Horizontal : PointerDragAxis.Vertical,
          initialValue: ratio,
          pixelsPerUnit: availableExtent * coordinateScale,
        });
        let moved = false;
        const handle = event.currentTarget;
        const pointerId = event.pointerId;
        splitResizeDispose.current?.();
        handle.setPointerCapture(pointerId);
        beginLayoutInteraction();
        const apply = (nextRatio: number) => {
          if (nextRatio === pendingRatio) return;
          pendingRatio = nextRatio;
          moved = true;
          // Update geometry in this frame; resize observers update the affected
          // surfaces without rebuilding the entire dock on every pointer move.
          const tracks = `minmax(0, ${nextRatio}fr) ${gap}px minmax(0, ${1 - nextRatio}fr)`;
          if (horizontal) target.style.gridTemplateColumns = tracks;
          else target.style.gridTemplateRows = tracks;
        };
        const move = (pointer: globalThis.PointerEvent) => {
          if (pointer.pointerId !== pointerId) return;
          const candidate = gesture.valueAt(pointer);
          if (candidate === null) return;
          const nextRatio = clamp(candidate, limits.min, limits.max);
          resizeScheduler.schedule(() => apply(nextRatio));
        };
        const finish = () => {
          resizeScheduler.flush();
          if (moved) {
            setLayout((current) => {
              const dock = resizeWorkspacePanelSplit(current.dock, node.id, pendingRatio, limits);
              return dock === current.dock ? current : { ...current, dock };
            });
            if (node.resize) onSplitRatioChange?.(node.resize.target, pendingRatio, extent);
          }
          endLayoutInteraction();
          window.removeEventListener("pointermove", move);
          window.removeEventListener("pointerup", end);
          window.removeEventListener("pointercancel", end);
          handle.removeEventListener("lostpointercapture", finish);
          window.removeEventListener("blur", finish);
          splitResizeDispose.current = null;
          if (handle.hasPointerCapture(pointerId)) handle.releasePointerCapture(pointerId);
        };
        const end = (pointer: globalThis.PointerEvent) => {
          if (pointer.pointerId !== pointerId) return;
          if (pointer.type === "pointerup") move(pointer);
          finish();
        };
        splitResizeDispose.current = finish;
        window.addEventListener("pointermove", move);
        window.addEventListener("pointerup", end);
        window.addEventListener("pointercancel", end);
        handle.addEventListener("lostpointercapture", finish);
        window.addEventListener("blur", finish);
      };
      return (
        <div
          key={node.id}
          className="xse-workspace-panel-split"
          data-axis={node.axis}
          style={
            horizontal
              ? {
                  gridTemplateColumns: `${fixed.first !== null ? `${fixed.first}px` : `minmax(0, ${fixedBar ? 1 : ratio}fr)`} ${gap}px ${fixed.second !== null ? `${fixed.second}px` : `minmax(0, ${fixedBar ? 1 : 1 - ratio}fr)`}`,
                }
              : {
                  gridTemplateRows: `${fixed.first !== null ? `${fixed.first}px` : `minmax(0, ${fixedBar ? 1 : ratio}fr)`} ${gap}px ${fixed.second !== null ? `${fixed.second}px` : `minmax(0, ${fixedBar ? 1 : 1 - ratio}fr)`}`,
                }
          }
        >
          {renderNode(node.first)}
          {fixedBar ? (
            <div aria-hidden="true" />
          ) : (
            <Splitter
              className="xse-workspace-panel-splitter"
              axis={node.axis}
              data-tool-pane-side={toolPaneSide}
              aria-label={tUi("ui.resize.panels")}
              onPointerDown={startResize}
              onContextMenu={(event) => event.preventDefault()}
              onKeyDown={(event) => {
                const step = event.shiftKey ? 0.1 : 0.02;
                const delta = horizontal
                  ? event.key === "ArrowRight"
                    ? step
                    : event.key === "ArrowLeft"
                      ? -step
                      : 0
                  : event.key === "ArrowDown"
                    ? step
                    : event.key === "ArrowUp"
                      ? -step
                      : 0;
                if (delta) {
                  event.preventDefault();
                  const host = event.currentTarget.parentElement;
                  const extent = host
                    ? horizontal
                      ? layoutSize(host).width
                      : layoutSize(host).height
                    : splitExtent;
                  const limits = splitLimitsFor(node, extent);
                  const nextRatio = clamp(ratio + delta, limits.min, limits.max);
                  setLayout((current) => {
                    const dock = resizeWorkspacePanelSplit(
                      current.dock,
                      node.id,
                      nextRatio,
                      limits,
                    );
                    return dock === current.dock ? current : { ...current, dock };
                  });
                  if (host && node.resize)
                    onSplitRatioChange?.(node.resize.target, nextRatio, extent);
                }
              }}
            />
          )}
          {renderNode(node.second)}
        </div>
      );
    }
    const pane = panelPanes(layout.dock).find((item) => item.id === node.id) ?? node;
    const showTabs = node.tabs.length > 1;
    return (
      <section
        key={node.id}
        className="xse-workspace-panel-pane"
        data-workspace-panel-pane={node.id}
        data-workspace-pane-tabs={node.tabs.join(",")}
        data-tool-rail-pane={node.tabs.includes("tools") ? "true" : undefined}
        data-single-tab={node.tabs.length === 1 ? "true" : undefined}
        onPointerDownCapture={layoutEditing ? (event) => beginBlankPress(event, pane) : undefined}
        onContextMenu={node.tabs.length === 1 ? suppressBlankContext : undefined}
      >
        {showTabs
          ? withPaneMenu(
              pane,
              false,
              <div className="xse-workspace-panel-tab-row">{renderTabs(pane, false, node)}</div>,
              node,
            )
          : withPaneMenu(
              pane,
              false,
              <button
                type="button"
                {...stylusPointerInputProps()}
                className="xse-workspace-pane-edge-handle"
                aria-label={tUi("ui.move.panel")}
                title={tUi("ui.move.panel")}
                onPointerDown={(event) => beginPaneMove(event, pane)}
                onPointerMove={movePane}
                onPointerUp={endPaneMove}
                onPointerCancel={cancelPaneMove}
                onLostPointerCapture={cancelPaneMove}
              >
                <UiIcon
                  part="icon_layout"
                  scale={2}
                  color="var(--xse-workspace-pane-handle-icon-color, var(--xse-window-tooltip-text, #000000))"
                />
              </button>,
              node,
            )}
        {showTabs && (
          <button
            type="button"
            {...stylusPointerInputProps()}
            className="xse-workspace-pane-edge-handle"
            aria-label={tUi("ui.move.panel")}
            title={tUi("ui.move.panel")}
            onPointerDown={(event) => beginPaneMove(event, pane)}
            onPointerMove={movePane}
            onPointerUp={endPaneMove}
            onPointerCancel={cancelPaneMove}
            onLostPointerCapture={cancelPaneMove}
          >
            <UiIcon
              part="icon_layout"
              scale={2}
              color="var(--xse-workspace-pane-handle-icon-color, var(--xse-window-tooltip-text, #000000))"
            />
          </button>
        )}
        <div
          className="xse-workspace-panel-content"
          role="tabpanel"
          aria-label={tUiSource(panelLabel(node.active))}
        >
          {renderPaneContent(pane, node)}
        </div>
      </section>
    );
  };

  const moveFloatingHeader = (
    event: ReactPointerEvent<HTMLElement>,
    pane: FloatingWorkspacePane,
  ) => {
    if (
      event.button !== 0 ||
      (event.target as Element).closest(
        "[data-ui-tab-value],button:not(.xse-workspace-pane-edge-handle):not(.xse-workspace-float-action):not([data-workspace-panel-launcher]),[role=menu]",
      )
    )
      return;
    cancelBlankPress.current?.();
    dropPlan.current = null;
    clearDropGuidance();
    setPreview(null);
    event.preventDefault();
    floatClickSuppressed.current = false;
    event.currentTarget.setPointerCapture(event.pointerId);
    const rect = floatingWorkspaceRect(pane, size, barThickness);
    floatMove.current = {
      id: pane.id,
      pointer: event.pointerId,
      x: clientPoint(event).x,
      y: clientPoint(event).y,
      left: rect.x,
      top: rect.y,
      docking: layoutEditing,
      moved: false,
      original: layoutRef.current,
    };
  };
  const applyFloatingHeaderMove = (event: PanelDragPoint) => {
    const drag = floatMove.current;
    if (!drag || drag.pointer !== event.pointerId) return;
    if (
      !drag.moved &&
      Math.hypot(clientPoint(event).x - drag.x, clientPoint(event).y - drag.y) <
        PANEL_DRAG_THRESHOLD
    )
      return;
    if (!drag.moved) beginLayoutInteraction(false);
    drag.moved = true;
    const pane = layoutRef.current.floats.find((item) => item.id === drag.id);
    if (!pane) {
      endLayoutInteraction();
      return;
    }
    const footprint = floatingWorkspaceFootprint(pane, size, barThickness);
    const point = rootPoint(clientPoint(event).x, clientPoint(event).y);
    const origin = rootPoint(drag.x, drag.y);
    const position = floatPosition(
      drag.left + point.x - origin.x,
      drag.top + point.y - origin.y,
      footprint.width,
      footprint.height,
      layout.floats.filter((item) => item.id !== drag.id),
      pane,
    );
    updateFloat(drag.id, (current) => ({
      ...current,
      ...position,
    }));
    if (!drag.docking || !layoutEditing) return;
    const target = dropAt(clientPoint(event).x, clientPoint(event).y, drag.id, pane.tabs, true);
    const positioned = { ...pane, ...position };
    const candidate = transferWorkspacePanels(
      layoutRef.current,
      paneOnly(pane),
      target,
      positioned,
      "edge" in target && target.edge ? splitRatioForPanel(pane.tabs, target, target.edge) : 0.5,
    );
    dropPlan.current = {
      source: pane.id,
      x: clientPoint(event).x,
      y: clientPoint(event).y,
      before: layoutRef.current,
      candidate,
      target,
    };
    setPreview(
      candidate === layoutRef.current
        ? null
        : previewForLayout(candidate, target, pane.active, pane.tabs),
    );
  };
  const floatingHeaderMove = (event: ReactPointerEvent<HTMLElement>) => {
    if (floatMove.current?.pointer !== event.pointerId) return;
    const point = {
      pointerId: event.pointerId,
      clientX: clientPoint(event).x,
      clientY: clientPoint(event).y,
    };
    moveScheduler.schedule(() => applyFloatingHeaderMove(point));
  };
  const floatingHeaderEnd = (event: ReactPointerEvent<HTMLElement>) => {
    const drag = floatMove.current;
    if (!drag || drag.pointer !== event.pointerId) return;
    const moved =
      drag.moved ||
      Math.hypot(clientPoint(event).x - drag.x, clientPoint(event).y - drag.y) >=
        PANEL_DRAG_THRESHOLD;
    if (moved) floatingHeaderMove(event);
    moveScheduler.flush();
    floatMove.current = null;
    floatClickSuppressed.current = moved;
    if (event.currentTarget.hasPointerCapture(event.pointerId))
      event.currentTarget.releasePointerCapture(event.pointerId);
    clearDropGuidance();
    setPreview(null);
    if (!moved || !drag.docking || !layoutEditing) {
      dropPlan.current = null;
      if (drag.moved) endLayoutInteraction();
      return;
    }
    const pane = layoutRef.current.floats.find((item) => item.id === drag.id);
    if (!pane) {
      endLayoutInteraction();
      return;
    }
    const plan = dropPlan.current;
    const target =
      plan?.source === pane.id && plan.before === layoutRef.current
        ? plan.target
        : dropAt(clientPoint(event).x, clientPoint(event).y, drag.id, pane.tabs);
    const next =
      plan?.source === pane.id && plan.before === layoutRef.current
        ? plan.candidate
        : transferWorkspacePanels(
            layoutRef.current,
            paneOnly(pane),
            target,
            pane,
            "edge" in target && target.edge
              ? splitRatioForPanel(pane.tabs, target, target.edge)
              : 0.5,
          );
    const before = layoutRef.current;
    setLayout(next);
    endLayoutInteraction();
    dropPlan.current = null;
    if (next !== before && target.kind !== "tab" && "edge" in target)
      recordTimelineDrop(pane.tabs, target.edge);
  };

  const resizeFloating = (
    event: ReactPointerEvent<HTMLButtonElement>,
    pane: FloatingWorkspacePane,
  ) => {
    if (event.button !== 0) return;
    event.preventDefault();
    event.stopPropagation();
    splitResizeDispose.current?.();
    beginLayoutInteraction();
    event.currentTarget.setPointerCapture(event.pointerId);
    const point = rootPoint(clientPoint(event).x, clientPoint(event).y);
    floatResize.current = {
      id: pane.id,
      pointer: event.pointerId,
      activation: new PointerDragActivation(
        event,
        isWorkspaceBar(pane)
          ? workspaceBarOrientation(pane) === WorkspaceBarOrientation.Horizontal
            ? PointerDragAxis.Horizontal
            : PointerDragAxis.Vertical
          : PointerDragAxis.Both,
      ),
      ...point,
      pane: { ...pane, ...floatingWorkspaceRect(pane, size, barThickness) },
      moved: false,
    };
  };
  const resizeFloatingMove = (event: ReactPointerEvent<HTMLButtonElement>) => {
    const drag = floatResize.current;
    if (!drag || drag.pointer !== event.pointerId) return;
    if (!drag.activation.update(event)) return;
    const point = rootPoint(clientPoint(event).x, clientPoint(event).y);
    drag.moved ||= point.x !== drag.x || point.y !== drag.y;
    if (!drag.moved) return;
    resizeScheduler.schedule(() =>
      updateFloat(drag.id, (pane) => ({
        ...pane,
        ...resizeFloatingWorkspaceGeometry(drag.pane, size, barThickness, {
          x: point.x - drag.x,
          y: point.y - drag.y,
        }),
      })),
    );
  };
  const endFloatingResize = (event: ReactPointerEvent<HTMLButtonElement>) => {
    const drag = floatResize.current;
    if (!drag || drag.pointer !== event.pointerId) return;
    resizeScheduler.flush();
    floatResize.current = null;
    if (event.currentTarget.hasPointerCapture(event.pointerId))
      event.currentTarget.releasePointerCapture(event.pointerId);
    endLayoutInteraction();
  };
  const visibleDock =
    visiblePanelNode(
      layout.dock,
      tilesetAvailable,
      hideTimeline,
      shortcutPanelVisible,
      contextPanelVisible,
    ) ?? ({ kind: "canvas", id: "workspace-canvas" } satisfies WorkspacePanelNode);

  return (
    <div
      ref={root}
      className="xse-workspace-panel-dock"
      data-layout-editing={layoutEditing ? "true" : undefined}
      data-workspace-panel-layout=""
      data-pane-dragging={dragHandle ? "true" : undefined}
    >
      <div className="xse-workspace-panel-tree">{renderNode(visibleDock)}</div>
      {layout.floats.map((pane, index) => {
        const displayedPane = visiblePane(
          pane,
          tilesetAvailable,
          hideTimeline,
          shortcutPanelVisible,
          contextPanelVisible,
        );
        if (!displayedPane) return null;
        const bar = isWorkspaceBar(displayedPane);
        const orientation = workspaceBarOrientation(pane);
        const { x: left, y: top, width, height } = floatingWorkspaceRect(pane, size, barThickness);
        const anchor = pane.anchor ?? FloatingPaneAnchor.TopLeft;
        const sideAnchor =
          !bar && (anchor === FloatingPaneAnchor.Left || anchor === FloatingPaneAnchor.Right);
        const anchorOffset = floatingWorkspaceAnchorOffset(
          { ...pane, width, height },
          barThickness,
        );
        const resizeEdges = floatingWorkspaceResizeEdges(pane);
        const collapsed = pane.presentation === FloatingPanePresentation.Button;
        const iconPart = layoutEditing ? "icon_layout" : panelIcons[displayedPane.active];
        const iconGeometry = style.parts[iconPart];
        const iconScale = Math.max(
          1,
          Math.min(
            UI_SCALE,
            Math.floor(
              FLOATING_PANEL_ICON_MAX_SIZE / Math.max(iconGeometry.width, iconGeometry.height),
            ),
          ),
        );
        const floatingIcon = (
          <UiIcon
            part={iconPart}
            scale={iconScale}
            color={layoutEditing ? "var(--xse-window-tooltip-text)" : undefined}
            style={{ position: "relative" }}
          />
        );
        const floatingAction = (
          <Button
            variant={ButtonVariant.FlatIcon}
            className={
              layoutEditing
                ? "xse-workspace-float-action xse-workspace-pane-edge-handle"
                : "xse-workspace-float-action"
            }
            paintArtwork={false}
            pixelSize={{
              width: barThickness / UI_SCALE,
              height: barThickness / UI_SCALE,
            }}
            style={{
              ...(!sideAnchor && !bar ? { gridColumn: 2, gridRow: 1 } : {}),
              background: layoutEditing ? "var(--xse-window-tooltip-face)" : undefined,
            }}
            {...stylusPointerInputProps(layoutEditing)}
            aria-label={layoutEditing ? tUi("ui.move.panel") : tUiSource("Collapse to button")}
            title={layoutEditing ? tUi("ui.move.panel") : tUiSource("Collapse to button")}
            onPointerDown={(event) => {
              event.stopPropagation();
              moveFloatingHeader(event, pane);
            }}
            onPointerMove={floatingHeaderMove}
            onPointerUp={floatingHeaderEnd}
            onPointerCancel={cancelFloatingHeaderMove}
            onLostPointerCapture={cancelFloatingHeaderMove}
            onClick={() => {
              if (layoutEditing || floatClickSuppressed.current) {
                floatClickSuppressed.current = false;
                return;
              }
              updateFloat(pane.id, (current) =>
                toggleFloatingWorkspacePane(current, size, barThickness),
              );
            }}
          >
            {floatingIcon}
          </Button>
        );
        if (collapsed)
          return (
            <section
              key={pane.id}
              className="xse-workspace-panel-launcher"
              data-workspace-float-id={pane.id}
              style={{
                left: clamp(pane.x, 0, Math.max(0, size.width - barThickness)),
                top: clamp(pane.y, 0, Math.max(0, size.height - barThickness)),
                zIndex: 40 + index,
              }}
            >
              {withPaneMenu(
                pane,
                true,
                <Button
                  variant={layoutEditing ? ButtonVariant.FlatIcon : ButtonVariant.Tool}
                  className={
                    layoutEditing
                      ? "xse-workspace-float-action xse-workspace-pane-edge-handle"
                      : undefined
                  }
                  paintArtwork={false}
                  pixelSize={{ width: barThickness / UI_SCALE, height: barThickness / UI_SCALE }}
                  style={{
                    width: barThickness,
                    height: barThickness,
                    padding: 0,
                    background: layoutEditing ? "var(--xse-window-tooltip-face)" : undefined,
                  }}
                  {...stylusPointerInputProps(layoutEditing)}
                  data-workspace-panel-launcher={pane.id}
                  aria-label={
                    layoutEditing
                      ? tUi("ui.move.panel")
                      : tUiSource(panelLabel(displayedPane.active))
                  }
                  title={
                    layoutEditing
                      ? tUi("ui.move.panel")
                      : tUiSource(panelLabel(displayedPane.active))
                  }
                  aria-expanded={false}
                  aria-haspopup="dialog"
                  onPointerDown={(event) => moveFloatingHeader(event, pane)}
                  onPointerMove={floatingHeaderMove}
                  onPointerUp={floatingHeaderEnd}
                  onPointerCancel={cancelFloatingHeaderMove}
                  onLostPointerCapture={cancelFloatingHeaderMove}
                  onClick={() => {
                    if (layoutEditing || floatClickSuppressed.current) {
                      floatClickSuppressed.current = false;
                      return;
                    }
                    updateFloat(pane.id, (current) =>
                      toggleFloatingWorkspacePane(current, size, barThickness),
                    );
                  }}
                >
                  {floatingIcon}
                </Button>,
                displayedPane,
              )}
            </section>
          );
        const title =
          displayedPane.tabs.length === 1 ? (
            <span className="xse-floating-workspace-caption">
              <Text
                variant={TextVariant.PositionedPixel}
                text={tUiSource(panelLabel(displayedPane.active))}
                x={0}
                y={0}
                color={style.colors.window_titlebar_text}
                style={{ position: "relative" }}
              />
            </span>
          ) : (
            renderTabs(pane, true, displayedPane)
          );
        const titlebar = (side: boolean) =>
          withPaneMenu(
            pane,
            true,
            <div
              {...stylusPointerInputProps()}
              className={`xse-floating-workspace-titlebar ${
                side
                  ? "xse-floating-workspace-side-control"
                  : displayedPane.tabs.length === 1
                    ? "xse-floating-workspace-controls"
                    : "xse-workspace-panel-tab-row"
              }`}
              style={{
                ...(!side && !bar
                  ? {
                      gridTemplateColumns: `${anchorOffset.x}px ${barThickness}px minmax(0, 1fr)`,
                    }
                  : {}),
                ...(displayedPane.tabs.length === 1 && !bar
                  ? {
                      background: style.colors.window_titlebar_face,
                    }
                  : {}),
              }}
              onPointerDown={(event) => moveFloatingHeader(event, pane)}
              onPointerMove={floatingHeaderMove}
              onPointerUp={floatingHeaderEnd}
              onPointerCancel={cancelFloatingHeaderMove}
              onLostPointerCapture={cancelFloatingHeaderMove}
            >
              {floatingAction}
              {!side && (
                <div
                  className="xse-floating-workspace-title-slot"
                  style={
                    !bar ? { gridColumn: anchorOffset.x === 0 ? 3 : 1, gridRow: 1 } : undefined
                  }
                >
                  {title}
                </div>
              )}
            </div>,
            displayedPane,
          );
        return (
          <section
            key={pane.id}
            className="xse-floating-workspace-pane"
            data-workspace-bar={bar ? orientation : undefined}
            data-workspace-anchor={anchor}
            data-workspace-anchor-side={sideAnchor ? anchor : undefined}
            data-workspace-float-id={pane.id}
            data-workspace-pane-tabs={displayedPane.tabs.join(",")}
            data-single-tab={displayedPane.tabs.length === 1 ? "true" : undefined}
            role="dialog"
            aria-label={tUiSource(panelLabel(displayedPane.active))}
            onPointerDownCapture={
              layoutEditing ? (event) => beginBlankPress(event, pane, true) : undefined
            }
            onContextMenu={displayedPane.tabs.length === 1 ? suppressBlankContext : undefined}
            style={{
              left,
              top,
              width,
              height,
              zIndex: 40 + index,
            }}
          >
            {titlebar(sideAnchor)}
            <div className="xse-floating-workspace-body">
              {sideAnchor && <div className="xse-floating-workspace-side-title">{title}</div>}
              <div
                className="xse-workspace-panel-content"
                role="tabpanel"
                aria-label={tUiSource(panelLabel(displayedPane.active))}
              >
                {renderPaneContent(pane, displayedPane)}
              </div>
            </div>
            <button
              type="button"
              {...stylusPointerInputProps()}
              className="xse-floating-workspace-resize"
              data-resize-axis={bar ? orientation : undefined}
              data-resize-x={resizeEdges.x}
              data-resize-y={resizeEdges.y}
              aria-label={tUi("ui.resize.panel")}
              onPointerDown={(event) => resizeFloating(event, pane)}
              onPointerMove={resizeFloatingMove}
              onContextMenu={(event) => event.preventDefault()}
              onPointerUp={(event) => {
                resizeFloatingMove(event);
                endFloatingResize(event);
              }}
              onPointerCancel={endFloatingResize}
              onLostPointerCapture={endFloatingResize}
              onKeyDown={(event) => {
                const width = event.key === "ArrowRight" ? 12 : event.key === "ArrowLeft" ? -12 : 0;
                const height = event.key === "ArrowDown" ? 12 : event.key === "ArrowUp" ? -12 : 0;
                if (width || height) {
                  event.preventDefault();
                  updateFloat(pane.id, (current) => ({
                    ...current,
                    ...resizeFloatingWorkspaceGeometry(current, size, barThickness, {
                      x: width,
                      y: height,
                    }),
                  }));
                }
              }}
            />
          </section>
        );
      })}
      {dropGuidance && <WorkspaceDropGuides guidance={dropGuidance} />}
      {preview && (
        <div
          className="xse-workspace-drop-mask"
          data-preview-kind={preview.kind}
          data-preview-panel={preview.active}
          style={{
            left: preview.rect.left,
            top: preview.rect.top,
            width: preview.rect.width,
            height: preview.rect.height,
          }}
          aria-hidden="true"
        >
          <span className="xse-workspace-drop-label">
            <Text
              variant={TextVariant.PositionedPixel}
              text={workspaceDropTargetLabel(preview.target)}
              x={4}
              y={4}
              color="currentColor"
              font="mini"
            />
          </span>
        </div>
      )}
      {dragHandle && (
        <div
          className="xse-workspace-drag-handle-ghost"
          style={{ left: dragHandle.x, top: dragHandle.y }}
          aria-hidden="true"
        >
          <UiIcon
            part="icon_layout"
            scale={2}
            color="var(--xse-workspace-pane-handle-icon-color, var(--xse-window-tooltip-text, #000000))"
          />
        </div>
      )}
      <WorkspaceLayoutSelector
        layout={layout}
        open={layoutEditing}
        onLoadLayout={loadWorkspacePanelLayout}
        onSelectLayoutMode={selectWorkspacePanelLayoutMode}
        onResetDefaultLayout={resetWorkspacePanelLayout}
      />
    </div>
  );
}

export type { WorkspacePanelId };
