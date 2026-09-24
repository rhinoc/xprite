import { DockEdge } from "$/managers/workspace/dock-edge";

export enum WorkspaceBarOrientation {
  Horizontal = "horizontal",
  Vertical = "vertical",
}
export enum WorkspaceContextPresentation {
  Docked = "docked",
  ToolPopup = "tool-popup",
}
export enum FloatingPanePresentation {
  Window = "window",
  Button = "button",
}
export enum FloatingPaneAnchor {
  TopLeft = "top-left",
  Top = "top",
  TopRight = "top-right",
  Right = "right",
  BottomRight = "bottom-right",
  Bottom = "bottom",
  BottomLeft = "bottom-left",
  Left = "left",
}

export const workspacePanelIds = [
  "palette",
  "timeline",
  "picker",
  "tileset",
  "tools",
  "context",
  "shortcuts",
] as const;
export const isWorkspaceBarId = (id: WorkspacePanelId) =>
  id === "tools" || id === "context" || id === "shortcuts";
export type WorkspacePanelId = (typeof workspacePanelIds)[number];
export function canDockWorkspacePanelsAtEdge(
  tabs: readonly WorkspacePanelId[],
  edge: DockEdge,
): boolean {
  return !tabs.includes("context") || edge === DockEdge.Top || edge === DockEdge.Bottom;
}

export type TimelineDockPosition = "top" | "bottom" | "left" | "right";

export type WorkspacePanelTabNode =
  | { kind: "panel"; panel: WorkspacePanelId }
  | {
      kind: "split";
      id: string;
      axis: "horizontal" | "vertical";
      ratio: number;
      first: WorkspacePanelTabNode;
      second: WorkspacePanelTabNode;
    };

export type WorkspacePanelPane = {
  kind: "pane";
  id: string;
  tabs: WorkspacePanelId[];
  active: WorkspacePanelId;
  /** Split contents belonging to one tab; tabs still lists every contained panel exactly once. */
  tabLayouts?: Partial<Record<WorkspacePanelId, WorkspacePanelTabNode>>;
};

export function workspaceTabPanels(node: WorkspacePanelTabNode): WorkspacePanelId[] {
  return node.kind === "panel"
    ? [node.panel]
    : [...workspaceTabPanels(node.first), ...workspaceTabPanels(node.second)];
}

export function workspacePaneTabIds(pane: WorkspacePanelPane): WorkspacePanelId[] {
  const members = new Set(
    Object.entries(pane.tabLayouts ?? {}).flatMap(([tab, node]) =>
      workspaceTabPanels(node).filter((panel) => panel !== tab),
    ),
  );
  return pane.tabs.filter((tab) => !members.has(tab));
}

export function workspacePaneTabLayout(
  pane: WorkspacePanelPane,
  tab: WorkspacePanelId,
): WorkspacePanelTabNode {
  const group = Object.entries(pane.tabLayouts ?? {}).find(([, node]) =>
    workspaceTabPanels(node).includes(tab),
  );
  return group?.[1] ?? { kind: "panel", panel: tab };
}

export function workspacePaneTabSource(
  pane: WorkspacePanelPane,
  tab: WorkspacePanelId,
): WorkspacePanelPane {
  const node = workspacePaneTabLayout(pane, tab);
  const root = Object.entries(pane.tabLayouts ?? {}).find(
    ([, candidate]) => candidate === node,
  )?.[0] as WorkspacePanelId | undefined;
  return {
    kind: "pane",
    id: uniqueId("workspace-tab"),
    tabs: workspaceTabPanels(node),
    active: root ?? tab,
    ...(node.kind === "split" ? { tabLayouts: { [root ?? tab]: node } } : {}),
  };
}

function pruneTabNode(
  node: WorkspacePanelTabNode,
  removed: ReadonlySet<WorkspacePanelId>,
): WorkspacePanelTabNode | null {
  if (node.kind === "panel") return removed.has(node.panel) ? null : node;
  const first = pruneTabNode(node.first, removed),
    second = pruneTabNode(node.second, removed);
  if (!first) return second;
  if (!second) return first;
  return first === node.first && second === node.second ? node : { ...node, first, second };
}

export function removeWorkspacePanePanels<T extends WorkspacePanelPane>(
  pane: T,
  removed: readonly WorkspacePanelId[],
): T | null {
  const remaining = pane.tabs.filter((tab) => !removed.includes(tab));
  if (remaining.length === pane.tabs.length) return pane;
  if (!remaining.length) return null;
  const tabLayouts: WorkspacePanelPane["tabLayouts"] = {};
  let active = pane.active;
  for (const [key, node] of Object.entries(pane.tabLayouts ?? {})) {
    const next = pruneTabNode(node, new Set(removed));
    if (!next) continue;
    const root = remaining.includes(key as WorkspacePanelId)
      ? (key as WorkspacePanelId)
      : workspaceTabPanels(next)[0];
    if (key === active) active = root;
    if (next.kind === "split") tabLayouts[root] = next;
  }
  const { tabLayouts: _oldLayouts, ...rest } = pane;
  const next = {
    ...rest,
    tabs: remaining,
    active,
    ...(Object.keys(tabLayouts).length ? { tabLayouts } : {}),
  } as T;
  const visible = workspacePaneTabIds(next);
  return visible.includes(active) ? next : { ...next, active: visible[0] };
}

export function mergeWorkspacePaneTabs<T extends WorkspacePanelPane>(
  pane: T,
  source: WorkspacePanelPane,
  beforeTab?: WorkspacePanelId,
): T {
  const tabs = [...pane.tabs];
  const before = beforeTab ? tabs.indexOf(beforeTab) : -1;
  tabs.splice(before < 0 ? tabs.length : before, 0, ...source.tabs);
  const tabLayouts = { ...pane.tabLayouts, ...source.tabLayouts };
  return {
    ...pane,
    tabs,
    active: source.active,
    ...(Object.keys(tabLayouts).length ? { tabLayouts } : {}),
  };
}

export function splitWorkspacePaneTab<T extends WorkspacePanelPane>(
  pane: T,
  tab: WorkspacePanelId,
  source: WorkspacePanelPane,
  edge: DockEdge,
  ratio = 0.5,
  targetPanel?: WorkspacePanelId,
): T {
  ratio = Math.min(0.96, Math.max(0.04, ratio));
  const axis = edge === DockEdge.Left || edge === DockEdge.Right ? "horizontal" : "vertical";
  const sourceNodes = workspacePaneTabIds(source).map((id) => workspacePaneTabLayout(source, id));
  const incoming = sourceNodes.slice(1).reduce<WorkspacePanelTabNode>(
    (first, second) => ({
      kind: "split",
      id: uniqueId("workspace-tab-split"),
      axis,
      ratio: 0.5,
      first,
      second,
    }),
    sourceNodes[0],
  );
  const root =
    (Object.entries(pane.tabLayouts ?? {}).find(([, node]) =>
      workspaceTabPanels(node).includes(tab),
    )?.[0] as WorkspacePanelId | undefined) ?? tab;
  const combine = (existing: WorkspacePanelTabNode): WorkspacePanelTabNode => ({
    kind: "split",
    id: uniqueId("workspace-tab-split"),
    axis,
    ratio: edge === DockEdge.Left || edge === DockEdge.Top ? ratio : 1 - ratio,
    first: edge === DockEdge.Left || edge === DockEdge.Top ? incoming : existing,
    second: edge === DockEdge.Left || edge === DockEdge.Top ? existing : incoming,
  });
  const append = (node: WorkspacePanelTabNode): WorkspacePanelTabNode =>
    !targetPanel || (node.kind === "panel" && node.panel === targetPanel)
      ? combine(node)
      : node.kind === "split"
        ? { ...node, first: append(node.first), second: append(node.second) }
        : node;
  return {
    ...pane,
    tabs: [...pane.tabs, ...source.tabs],
    active: root,
    tabLayouts: { ...pane.tabLayouts, [root]: append(workspacePaneTabLayout(pane, root)) },
  };
}

export function resizeWorkspacePaneTabSplit<T extends WorkspacePanelPane>(
  pane: T,
  id: string,
  ratio: number,
): T {
  const resize = (node: WorkspacePanelTabNode): WorkspacePanelTabNode => {
    if (node.kind === "panel") return node;
    if (node.id === id) {
      const nextRatio = Math.min(0.96, Math.max(0.04, ratio));
      return nextRatio === node.ratio ? node : { ...node, ratio: nextRatio };
    }
    const first = resize(node.first),
      second = resize(node.second);
    return first === node.first && second === node.second ? node : { ...node, first, second };
  };
  const tabLayouts = Object.fromEntries(
    Object.entries(pane.tabLayouts ?? {}).map(([tab, node]) => [tab, resize(node)]),
  );
  return Object.entries(tabLayouts).every(
    ([tab, node]) => node === pane.tabLayouts?.[tab as WorkspacePanelId],
  )
    ? pane
    : { ...pane, tabLayouts };
}
export type WorkspacePanelResizeTarget = "colorbar-width" | "colorbar-split-position";
interface WorkspacePanelSplitResize {
  target: WorkspacePanelResizeTarget;
  minimumFirstExtent?: number;
  minimumSecondExtent?: number;
  minimumFirstRatio?: number;
  maximumFirstRatio?: number;
}
export type WorkspacePanelNode =
  | { kind: "canvas"; id: "workspace-canvas" }
  | WorkspacePanelPane
  | {
      kind: "split";
      id: string;
      axis: "horizontal" | "vertical";
      ratio: number;
      resize?: WorkspacePanelSplitResize;
      first: WorkspacePanelNode;
      second: WorkspacePanelNode;
    };
export type FloatingWorkspacePane = WorkspacePanelPane & {
  presentation?: FloatingPanePresentation;
  anchor?: FloatingPaneAnchor;
  barOrientation?: WorkspaceBarOrientation;
  x: number;
  y: number;
  width: number;
  height: number;
};
export type WorkspacePanelLayout = { dock: WorkspacePanelNode; floats: FloatingWorkspacePane[] };
export type WorkspaceLayoutPresetId = "compact" | "wide";
export type WorkspacePanelArrangement = "stacked" | "docked";
export type WorkspaceLayoutMode = WorkspaceLayoutPresetId | "auto" | "saved";
export interface WorkspaceLayoutSelection {
  mode: WorkspaceLayoutMode;
  savedLayoutId?: string;
  configuration?: WorkspaceLayoutConfiguration;
}
export interface WorkspaceLayoutConfiguration {
  panelLayout: {
    defaultArrangement: WorkspacePanelArrangement;
  };
  surface: {
    workspaceColumnGap: number;
    workspaceOverflow: "auto" | "hidden";
    documentDockTrailingMargin: number;
    sideTimelineDirection: "row" | "column";
    panelTabHeight: number;
  };
  chrome: {
    showEditorMenuBar: boolean;
    showShortcutToolbar: boolean;
    showCanvasScrollbars: boolean;
    contextBarPresentation: WorkspaceContextPresentation;
    workspaceOnHome: boolean;
    tabsAdjacentToMenu: boolean;
    showDocumentNameInStatus: boolean;
  };
  colorbar: {
    resizeEnabled: boolean;
  };
  palette: {
    splitTileset: boolean;
    headerHeight: number;
  };
  timeline: {
    fitLayerColumn: boolean;
    layerColumnMinimumWidth: number;
    frameAreaReserve: number;
  };
  home: {
    headerVisibleThreshold: number;
    headerTopWithBanner: number;
    actionButtonHeight: number;
    openActionTop: number;
    recoverActionTop: number;
    fileRowHeight: number;
    contentHeight: "rows" | "viewport";
    scrollbarGutter: number;
    showScrollbar: boolean;
  };
  recovery: {
    toolbarLayout: "desktop" | "stacked";
    minimumWidth: number;
    listRowHeight: number;
  };
}
export interface SavedWorkspacePanelLayout {
  id: string;
  name: string;
  layout: WorkspacePanelLayout;
  configuration: WorkspaceLayoutConfiguration;
}
export const MAX_WORKSPACE_PANEL_LAYOUT_NAME_LENGTH = 48;
const MAX_WORKSPACE_PANEL_LAYOUT_DEPTH = 9;
const WORKSPACE_CONTEXT_PANEL_RATIO = 0.06;
const COMPACT_COLOR_PANEL_RATIO = 0.5;
const WIDE_PALETTE_TILESET_RATIO = 0.5;
// Preserve space for the color fields and palette selector when their split is resized.
const MIN_COLOR_FIELDS_PANEL_HEIGHT = 144;
const MIN_PALETTE_PANEL_HEIGHT = 48;

export const COMPACT_WORKSPACE_LAYOUT_CONFIGURATION: WorkspaceLayoutConfiguration = {
  panelLayout: { defaultArrangement: "stacked" },
  surface: {
    workspaceColumnGap: 0,
    workspaceOverflow: "hidden",
    documentDockTrailingMargin: 0,
    sideTimelineDirection: "column",
    panelTabHeight: 34,
  },
  chrome: {
    showEditorMenuBar: false,
    showShortcutToolbar: true,
    showCanvasScrollbars: false,
    contextBarPresentation: WorkspaceContextPresentation.ToolPopup,
    workspaceOnHome: true,
    tabsAdjacentToMenu: false,
    showDocumentNameInStatus: false,
  },
  colorbar: { resizeEnabled: false },
  palette: { splitTileset: false, headerHeight: 36 },
  timeline: {
    fitLayerColumn: true,
    layerColumnMinimumWidth: 120,
    frameAreaReserve: 72,
  },
  home: {
    headerVisibleThreshold: 120,
    headerTopWithBanner: 82,
    actionButtonHeight: 14,
    openActionTop: 19,
    recoverActionTop: 30,
    fileRowHeight: 22,
    contentHeight: "rows",
    scrollbarGutter: 0,
    showScrollbar: false,
  },
  recovery: { toolbarLayout: "stacked", minimumWidth: 2, listRowHeight: 40 },
};

const WIDE_WORKSPACE_LAYOUT_CONFIGURATION: WorkspaceLayoutConfiguration = {
  panelLayout: { defaultArrangement: "docked" },
  surface: {
    workspaceColumnGap: 4,
    workspaceOverflow: "auto",
    documentDockTrailingMargin: 0,
    sideTimelineDirection: "row",
    panelTabHeight: 30,
  },
  chrome: {
    showEditorMenuBar: true,
    showShortcutToolbar: false,
    showCanvasScrollbars: true,
    contextBarPresentation: WorkspaceContextPresentation.Docked,
    workspaceOnHome: false,
    tabsAdjacentToMenu: true,
    showDocumentNameInStatus: true,
  },
  colorbar: { resizeEnabled: true },
  palette: { splitTileset: true, headerHeight: 36 },
  timeline: {
    fitLayerColumn: false,
    layerColumnMinimumWidth: 120,
    frameAreaReserve: 72,
  },
  home: {
    headerVisibleThreshold: 200,
    headerTopWithBanner: 49,
    actionButtonHeight: 14,
    openActionTop: 19,
    recoverActionTop: 30,
    fileRowHeight: 22,
    contentHeight: "viewport",
    scrollbarGutter: 12,
    showScrollbar: true,
  },
  recovery: { toolbarLayout: "desktop", minimumWidth: 320, listRowHeight: 26 },
};

export function workspaceLayoutConfigurationForPreset(
  presetId: WorkspaceLayoutPresetId,
): WorkspaceLayoutConfiguration {
  return presetId === "compact"
    ? COMPACT_WORKSPACE_LAYOUT_CONFIGURATION
    : WIDE_WORKSPACE_LAYOUT_CONFIGURATION;
}

function isWorkspaceLayoutConfiguration(value: unknown): value is WorkspaceLayoutConfiguration {
  if (!value || typeof value !== "object") return false;
  const config = value as Partial<WorkspaceLayoutConfiguration>;
  return (
    !!config.panelLayout &&
    (config.panelLayout.defaultArrangement === "stacked" ||
      config.panelLayout.defaultArrangement === "docked") &&
    !!config.surface &&
    Number.isFinite(config.surface.workspaceColumnGap) &&
    (config.surface.workspaceOverflow === "auto" ||
      config.surface.workspaceOverflow === "hidden") &&
    Number.isFinite(config.surface.documentDockTrailingMargin) &&
    (config.surface.sideTimelineDirection === "row" ||
      config.surface.sideTimelineDirection === "column") &&
    Number.isFinite(config.surface.panelTabHeight) &&
    !!config.chrome &&
    typeof config.chrome.showEditorMenuBar === "boolean" &&
    typeof config.chrome.showShortcutToolbar === "boolean" &&
    typeof config.chrome.showCanvasScrollbars === "boolean" &&
    (config.chrome.contextBarPresentation === WorkspaceContextPresentation.Docked ||
      config.chrome.contextBarPresentation === WorkspaceContextPresentation.ToolPopup) &&
    typeof config.chrome.workspaceOnHome === "boolean" &&
    typeof config.chrome.tabsAdjacentToMenu === "boolean" &&
    typeof config.chrome.showDocumentNameInStatus === "boolean" &&
    !!config.colorbar &&
    typeof config.colorbar.resizeEnabled === "boolean" &&
    !!config.palette &&
    typeof config.palette.splitTileset === "boolean" &&
    Number.isFinite(config.palette.headerHeight) &&
    !!config.timeline &&
    typeof config.timeline.fitLayerColumn === "boolean" &&
    Number.isFinite(config.timeline.layerColumnMinimumWidth) &&
    Number.isFinite(config.timeline.frameAreaReserve) &&
    !!config.home &&
    Number.isFinite(config.home.headerVisibleThreshold) &&
    Number.isFinite(config.home.headerTopWithBanner) &&
    Number.isFinite(config.home.actionButtonHeight) &&
    Number.isFinite(config.home.openActionTop) &&
    Number.isFinite(config.home.recoverActionTop) &&
    Number.isFinite(config.home.fileRowHeight) &&
    (config.home.contentHeight === "rows" || config.home.contentHeight === "viewport") &&
    Number.isFinite(config.home.scrollbarGutter) &&
    typeof config.home.showScrollbar === "boolean" &&
    !!config.recovery &&
    (config.recovery.toolbarLayout === "desktop" || config.recovery.toolbarLayout === "stacked") &&
    Number.isFinite(config.recovery.minimumWidth) &&
    Number.isFinite(config.recovery.listRowHeight)
  );
}

export function parseWorkspaceLayoutConfiguration(
  value: unknown,
): WorkspaceLayoutConfiguration | null {
  if (!isWorkspaceLayoutConfiguration(value)) return null;
  const config = value as WorkspaceLayoutConfiguration;
  return {
    panelLayout: { ...config.panelLayout },
    surface: { ...config.surface },
    chrome: { ...config.chrome },
    colorbar: { ...config.colorbar },
    palette: { ...config.palette },
    timeline: { ...config.timeline },
    home: { ...config.home },
    recovery: { ...config.recovery },
  };
}

export const defaultStackedPanelNode = (shortScreen = false): WorkspacePanelNode =>
  createSplit(
    "compact-shortcuts-split",
    "horizontal",
    WORKSPACE_SHORTCUT_PANEL_RATIO,
    createPane("compact-shortcuts", ["shortcuts"], "shortcuts"),
    createSplit(
      "compact-tools-split",
      "vertical",
      WORKSPACE_CONTEXT_PANEL_RATIO,
      createPane("compact-tools", ["tools"], "tools"),
      createSplit(
        "compact-context-split",
        "vertical",
        WORKSPACE_CONTEXT_PANEL_RATIO,
        createPane("compact-context", ["context"], "context"),
        {
          kind: "split",
          id: "compact-root-split",
          axis: "vertical",
          ratio: shortScreen ? 0.83 : 0.58,
          first: { kind: "canvas", id: "workspace-canvas" },
          second: {
            kind: "pane",
            id: "compact-panel-root",
            tabs: ["palette", "picker", "timeline", "tileset"],
            active: "palette",
            tabLayouts: {
              palette: {
                kind: "split",
                id: "compact-color-tab-split",
                axis: "horizontal",
                ratio: COMPACT_COLOR_PANEL_RATIO,
                first: { kind: "panel", panel: "palette" },
                second: { kind: "panel", panel: "picker" },
              },
            },
          },
        },
      ),
    ),
  );
const defaultStackedWorkspacePanelLayout = (shortScreen = false): WorkspacePanelLayout => ({
  dock: defaultStackedPanelNode(shortScreen),
  floats: [],
});

export interface WorkspacePanelLayoutDefaults {
  timelinePosition?: TimelineDockPosition;
  colorbarRatio?: number;
  colorbarSplitPosition?: number;
  timelineRatio?: number;
}

const createPane = (id: string, tabs: WorkspacePanelId[], active: WorkspacePanelId) => ({
  kind: "pane" as const,
  id,
  tabs,
  active,
});

const WORKSPACE_SHORTCUT_PANEL_RATIO = 0.04;

const createSplit = (
  id: string,
  axis: "horizontal" | "vertical",
  ratio: number,
  first: WorkspacePanelNode,
  second: WorkspacePanelNode,
  resize?: WorkspacePanelSplitResize,
): WorkspacePanelNode => ({
  kind: "split",
  id,
  axis,
  ratio,
  first,
  second,
  ...(resize ? { resize } : {}),
});

/** Wide work areas stack palette, tileset and picker beside the canvas and timeline. */
export function defaultDockedWorkspacePanelLayout({
  timelinePosition = "bottom",
  colorbarRatio = 0.16,
  colorbarSplitPosition = 0.8,
  timelineRatio = 0.78,
}: WorkspacePanelLayoutDefaults = {}): WorkspacePanelLayout {
  const colors = createSplit(
    "wide-color-split",
    "vertical",
    Math.min(0.9, Math.max(0.1, colorbarSplitPosition)),
    createSplit(
      "wide-palette-tileset-split",
      "vertical",
      WIDE_PALETTE_TILESET_RATIO,
      createPane("wide-palette", ["palette"], "palette"),
      createPane("wide-tileset", ["tileset"], "tileset"),
    ),
    createPane("wide-picker", ["picker"], "picker"),
    {
      target: "colorbar-split-position",
      minimumFirstExtent: MIN_PALETTE_PANEL_HEIGHT,
      minimumSecondExtent: MIN_COLOR_FIELDS_PANEL_HEIGHT,
      minimumFirstRatio: 0.1,
      maximumFirstRatio: 0.9,
    },
  );
  const canvas: WorkspacePanelNode = { kind: "canvas", id: "workspace-canvas" };
  const timeline = createPane("wide-timeline", ["timeline"], "timeline");
  const timelineSize = Math.min(0.45, Math.max(0.15, 1 - timelineRatio));
  const workArea =
    timelinePosition === "top"
      ? createSplit("wide-timeline-split", "vertical", timelineSize, timeline, canvas)
      : timelinePosition === "left"
        ? createSplit("wide-timeline-split", "horizontal", timelineSize, timeline, canvas)
        : timelinePosition === "right"
          ? createSplit("wide-timeline-split", "horizontal", 1 - timelineSize, canvas, timeline)
          : createSplit("wide-timeline-split", "vertical", timelineRatio, canvas, timeline);
  return {
    dock: createSplit(
      "wide-shortcuts-split",
      "horizontal",
      WORKSPACE_SHORTCUT_PANEL_RATIO,
      createPane("wide-shortcuts", ["shortcuts"], "shortcuts"),
      createSplit(
        "wide-workspace-split",
        "horizontal",
        Math.min(0.35, Math.max(0.1, colorbarRatio)),
        colors,
        createSplit(
          "wide-tools-split",
          "horizontal",
          0.96,
          createSplit(
            "wide-context-split",
            "vertical",
            WORKSPACE_CONTEXT_PANEL_RATIO,
            createPane("wide-context", ["context"], "context"),
            workArea,
          ),
          createPane("wide-tools", ["tools"], "tools"),
        ),
        { target: "colorbar-width" },
      ),
    ),
    floats: [],
  };
}

export function defaultWorkspacePanelLayout(
  configuration: WorkspaceLayoutConfiguration,
  shortScreen = false,
  defaults: WorkspacePanelLayoutDefaults = {},
): WorkspacePanelLayout {
  return configuration.panelLayout.defaultArrangement === "stacked"
    ? defaultStackedWorkspacePanelLayout(shortScreen)
    : defaultDockedWorkspacePanelLayout(defaults);
}

const uniqueId = (prefix: string) =>
  `${prefix}-${globalThis.crypto?.randomUUID?.() ?? Math.random().toString(36).slice(2)}`;
export function panelPanes(tree: WorkspacePanelNode): WorkspacePanelPane[] {
  return tree.kind === "canvas"
    ? []
    : tree.kind === "pane"
      ? [tree]
      : [...panelPanes(tree.first), ...panelPanes(tree.second)];
}
const hasTab = (tree: WorkspacePanelNode, tab: WorkspacePanelId) =>
  panelPanes(tree).some((pane) => pane.tabs.includes(tab));
const containsCanvas = (tree: WorkspacePanelNode): boolean =>
  tree.kind === "canvas" ||
  (tree.kind === "split" && (containsCanvas(tree.first) || containsCanvas(tree.second)));

/** Finds the edge that places the timeline beside the canvas in a saved tree. */
export function workspacePanelTimelinePosition(
  tree: WorkspacePanelNode,
): TimelineDockPosition | null {
  if (tree.kind !== "split") return null;
  const firstHasCanvas = containsCanvas(tree.first);
  const secondHasCanvas = containsCanvas(tree.second);
  const firstHasTimeline = hasTab(tree.first, "timeline");
  const secondHasTimeline = hasTab(tree.second, "timeline");
  if (firstHasCanvas && secondHasTimeline) return tree.axis === "horizontal" ? "right" : "bottom";
  if (secondHasCanvas && firstHasTimeline) return tree.axis === "horizontal" ? "left" : "top";
  if (firstHasCanvas) return workspacePanelTimelinePosition(tree.first);
  if (secondHasCanvas) return workspacePanelTimelinePosition(tree.second);
  return null;
}

function mapPane(
  tree: WorkspacePanelNode,
  paneId: string,
  update: (pane: WorkspacePanelPane) => WorkspacePanelNode,
): WorkspacePanelNode {
  if (tree.kind === "canvas") return tree;
  if (tree.kind === "pane") return tree.id === paneId ? update(tree) : tree;
  return {
    ...tree,
    first: mapPane(tree.first, paneId, update),
    second: mapPane(tree.second, paneId, update),
  };
}
function mapCanvas(
  tree: WorkspacePanelNode,
  update: (canvas: Extract<WorkspacePanelNode, { kind: "canvas" }>) => WorkspacePanelNode,
): WorkspacePanelNode {
  if (tree.kind === "canvas") return update(tree);
  if (tree.kind === "pane") return tree;
  return { ...tree, first: mapCanvas(tree.first, update), second: mapCanvas(tree.second, update) };
}

function removeTab(tree: WorkspacePanelNode, tab: WorkspacePanelId): WorkspacePanelNode | null {
  if (tree.kind === "canvas") return tree;
  if (tree.kind === "pane") {
    return removeWorkspacePanePanels(tree, [tab]);
  }
  const first = removeTab(tree.first, tab),
    second = removeTab(tree.second, tab);
  if (!first) return second;
  if (!second) return first;
  return { ...tree, first, second };
}
export function removeWorkspacePanelTab(
  tree: WorkspacePanelNode,
  tab: WorkspacePanelId,
): WorkspacePanelNode {
  return removeTab(tree, tab) ?? tree;
}
export function removeWorkspacePanelPane(
  tree: WorkspacePanelNode,
  paneId: string,
): WorkspacePanelNode {
  if (tree.kind === "canvas") return tree;
  if (tree.kind === "pane") return tree;
  const remove = (node: WorkspacePanelNode): WorkspacePanelNode | null => {
    if (node.kind === "pane") return node.id === paneId ? null : node;
    if (node.kind === "canvas") return node;
    const first = remove(node.first),
      second = remove(node.second);
    if (!first) return second;
    if (!second) return first;
    return { ...node, first, second };
  };
  return remove(tree) ?? tree;
}

export function selectWorkspacePanel(
  tree: WorkspacePanelNode,
  paneId: string,
  tab: WorkspacePanelId,
): WorkspacePanelNode {
  return mapPane(tree, paneId, (pane) =>
    pane.tabs.includes(tab)
      ? {
          ...pane,
          active:
            (Object.entries(pane.tabLayouts ?? {}).find(([, node]) =>
              workspaceTabPanels(node).includes(tab),
            )?.[0] as WorkspacePanelId | undefined) ?? tab,
        }
      : pane,
  );
}
export function moveWorkspacePanel(
  tree: WorkspacePanelNode,
  tab: WorkspacePanelId,
  paneId: string,
  beforeTab?: WorkspacePanelId,
): WorkspacePanelNode {
  if (beforeTab === tab || !panelPanes(tree).some((pane) => pane.id === paneId)) return tree;
  const owner = panelPanes(tree).find((pane) => pane.tabs.includes(tab));
  const source =
    owner && workspacePaneTabIds(owner).includes(tab)
      ? workspacePaneTabSource(owner, tab)
      : createPane(uniqueId("workspace-pane"), [tab], tab);
  const remaining = source.tabs.reduce((node, panel) => removeWorkspacePanelTab(node, panel), tree);
  if (!panelPanes(remaining).some((pane) => pane.id === paneId)) return tree;
  return mapPane(remaining, paneId, (pane) => {
    return mergeWorkspacePaneTabs(pane, source, beforeTab);
  });
}

export function splitWorkspacePanel(
  tree: WorkspacePanelNode,
  tab: WorkspacePanelId,
  paneId: string,
  edge: DockEdge,
  paneRatio = 0.5,
): WorkspacePanelNode {
  const target = panelPanes(tree).find((pane) => pane.id === paneId);
  if (!canDockWorkspacePanelsAtEdge([tab, ...(target?.tabs ?? [])], edge)) return tree;
  const before = edge === DockEdge.Left || edge === DockEdge.Top;
  const paneFraction = Math.min(0.96, Math.max(0.04, paneRatio));
  const source = panelPanes(tree).find((pane) => pane.tabs.includes(tab));
  if (source?.id === paneId && source.tabs.length === 1) return tree;
  const content =
    source && workspacePaneTabIds(source).includes(tab)
      ? workspacePaneTabSource(source, tab)
      : createPane(uniqueId("workspace-pane"), [tab], tab);
  const remaining = source
    ? content.tabs.reduce((node, panel) => removeWorkspacePanelTab(node, panel), tree)
    : tree;
  if (!panelPanes(remaining).some((pane) => pane.id === paneId)) return tree;
  const created: WorkspacePanelPane = {
    ...content,
    id: uniqueId("workspace-pane"),
  };
  return mapPane(remaining, paneId, (pane) => ({
    kind: "split",
    id: uniqueId("workspace-split"),
    axis: edge === DockEdge.Left || edge === DockEdge.Right ? "horizontal" : "vertical",
    ratio: before ? paneFraction : 1 - paneFraction,
    first: edge === DockEdge.Left || edge === DockEdge.Top ? created : pane,
    second: edge === DockEdge.Right || edge === DockEdge.Bottom ? created : pane,
  }));
}

export function splitWorkspacePane(
  tree: WorkspacePanelNode,
  pane: WorkspacePanelPane,
  paneId: string,
  edge: DockEdge,
  paneRatio = 0.5,
): WorkspacePanelNode {
  const target = panelPanes(tree).find((item) => item.id === paneId);
  if (!canDockWorkspacePanelsAtEdge([...pane.tabs, ...(target?.tabs ?? [])], edge)) return tree;
  const before = edge === DockEdge.Left || edge === DockEdge.Top;
  const paneFraction = Math.min(0.96, Math.max(0.04, paneRatio));
  if (pane.id === paneId) return tree;
  const remaining = panelPanes(tree).some((item) => item.id === pane.id)
    ? removeWorkspacePanelPane(tree, pane.id)
    : tree;
  if (!panelPanes(remaining).some((item) => item.id === paneId)) return tree;
  return mapPane(remaining, paneId, (target) => ({
    kind: "split",
    id: uniqueId("workspace-split"),
    axis: edge === DockEdge.Left || edge === DockEdge.Right ? "horizontal" : "vertical",
    ratio: before ? paneFraction : 1 - paneFraction,
    first: edge === DockEdge.Left || edge === DockEdge.Top ? pane : target,
    second: edge === DockEdge.Right || edge === DockEdge.Bottom ? pane : target,
  }));
}

export function dockWorkspacePaneAtCanvas(
  tree: WorkspacePanelNode,
  pane: WorkspacePanelPane,
  edge: DockEdge,
  paneRatio = 0.5,
): WorkspacePanelNode {
  if (!canDockWorkspacePanelsAtEdge(pane.tabs, edge)) return tree;
  const before = edge === DockEdge.Left || edge === DockEdge.Top;
  const paneFraction = Math.min(0.96, Math.max(0.04, paneRatio));
  const remaining = panelPanes(tree).some((item) => item.id === pane.id)
    ? removeWorkspacePanelPane(tree, pane.id)
    : tree;
  return mapCanvas(remaining, (canvas) => ({
    kind: "split",
    id: uniqueId("workspace-split"),
    axis: edge === DockEdge.Left || edge === DockEdge.Right ? "horizontal" : "vertical",
    ratio: before ? paneFraction : 1 - paneFraction,
    first: edge === DockEdge.Left || edge === DockEdge.Top ? pane : canvas,
    second: edge === DockEdge.Right || edge === DockEdge.Bottom ? pane : canvas,
  }));
}
export function dockWorkspacePanelAtCanvas(
  tree: WorkspacePanelNode,
  tab: WorkspacePanelId,
  edge: DockEdge,
  paneRatio = 0.5,
): WorkspacePanelNode {
  if (!canDockWorkspacePanelsAtEdge([tab], edge)) return tree;
  const remaining = hasTab(tree, tab) ? removeWorkspacePanelTab(tree, tab) : tree;
  return dockWorkspacePaneAtCanvas(
    remaining,
    { kind: "pane", id: uniqueId("workspace-pane"), tabs: [tab], active: tab },
    edge,
    paneRatio,
  );
}

/** Dock outside the entire work area, including its timeline and color panels. */
export function dockWorkspacePaneAtEdge(
  tree: WorkspacePanelNode,
  pane: WorkspacePanelPane,
  edge: DockEdge,
  paneRatio = 0.3,
): WorkspacePanelNode {
  if (!canDockWorkspacePanelsAtEdge(pane.tabs, edge)) return tree;
  const remaining = removeWorkspacePanelPane(tree, pane.id);
  const before = edge === DockEdge.Left || edge === DockEdge.Top;
  const fraction = Math.min(0.96, Math.max(0.04, paneRatio));
  return createSplit(
    uniqueId("workspace-edge-split"),
    edge === DockEdge.Left || edge === DockEdge.Right ? "horizontal" : "vertical",
    before ? fraction : 1 - fraction,
    before ? pane : remaining,
    before ? remaining : pane,
  );
}

export function dockWorkspacePanelAtEdge(
  tree: WorkspacePanelNode,
  tab: WorkspacePanelId,
  edge: DockEdge,
  paneRatio = 0.3,
): WorkspacePanelNode {
  if (!canDockWorkspacePanelsAtEdge([tab], edge)) return tree;
  const source = panelPanes(tree).find((pane) => pane.tabs.includes(tab));
  const pane =
    source?.tabs.length === 1 ? source : createPane(uniqueId("workspace-pane"), [tab], tab);
  return dockWorkspacePaneAtEdge(removeWorkspacePanelTab(tree, tab), pane, edge, paneRatio);
}

export function resizeWorkspacePanelSplit(
  tree: WorkspacePanelNode,
  splitId: string,
  ratio: number,
  limits: { min: number; max: number } = { min: 0.04, max: 0.96 },
): WorkspacePanelNode {
  if (tree.kind === "pane")
    return tree.tabLayouts ? resizeWorkspacePaneTabSplit(tree, splitId, ratio) : tree;
  if (tree.kind !== "split") return tree;
  if (tree.id === splitId) {
    const nextRatio = Math.min(limits.max, Math.max(limits.min, ratio));
    return nextRatio === tree.ratio ? tree : { ...tree, ratio: nextRatio };
  }
  const first = resizeWorkspacePanelSplit(tree.first, splitId, ratio, limits);
  const second = resizeWorkspacePanelSplit(tree.second, splitId, ratio, limits);
  return first === tree.first && second === tree.second ? tree : { ...tree, first, second };
}

function validTabLayouts(pane: Record<string, unknown>, ids: string[]): boolean {
  if (pane.tabLayouts === undefined) return true;
  if (!pane.tabLayouts || typeof pane.tabLayouts !== "object" || Array.isArray(pane.tabLayouts))
    return false;
  const grouped: WorkspacePanelId[] = [];
  for (const [tab, value] of Object.entries(pane.tabLayouts)) {
    const members: WorkspacePanelId[] = [];
    const visit = (node: unknown, depth: number): boolean => {
      if (!node || typeof node !== "object" || depth > MAX_WORKSPACE_PANEL_LAYOUT_DEPTH)
        return false;
      const item = node as Record<string, unknown>;
      if (item.kind === "panel") {
        if (!(pane.tabs as WorkspacePanelId[]).includes(item.panel as WorkspacePanelId))
          return false;
        members.push(item.panel as WorkspacePanelId);
        return true;
      }
      if (
        item.kind !== "split" ||
        typeof item.id !== "string" ||
        ids.includes(item.id) ||
        (item.axis !== "horizontal" && item.axis !== "vertical") ||
        typeof item.ratio !== "number" ||
        !Number.isFinite(item.ratio) ||
        item.ratio < 0.04 ||
        item.ratio > 0.96
      )
        return false;
      ids.push(item.id);
      return visit(item.first, depth + 1) && visit(item.second, depth + 1);
    };
    if (
      !visit(value, 0) ||
      !members.includes(tab as WorkspacePanelId) ||
      new Set(members).size !== members.length ||
      members.some((panel) => grouped.includes(panel))
    )
      return false;
    grouped.push(...members);
  }
  return workspacePaneTabIds(pane as unknown as WorkspacePanelPane).includes(
    pane.active as WorkspacePanelId,
  );
}

function inspectTree(
  value: unknown,
): { tabs: WorkspacePanelId[]; canvas: number; ids: string[] } | null {
  const tabs: WorkspacePanelId[] = [],
    ids: string[] = [];
  let canvas = 0;
  const visit = (node: unknown, depth: number): boolean => {
    if (!node || typeof node !== "object" || depth > MAX_WORKSPACE_PANEL_LAYOUT_DEPTH) return false;
    const item = node as Record<string, unknown>;
    if (typeof item.id !== "string" || ids.includes(item.id)) return false;
    ids.push(item.id);
    if (item.kind === "canvas") {
      canvas++;
      return item.id === "workspace-canvas";
    }
    if (item.kind === "pane") {
      if (
        !Array.isArray(item.tabs) ||
        !item.tabs.length ||
        !item.tabs.every((tab) => workspacePanelIds.includes(tab as WorkspacePanelId)) ||
        !item.tabs.includes(item.active) ||
        !validTabLayouts(item, ids)
      )
        return false;
      tabs.push(...item.tabs);
      return true;
    }
    return (
      item.kind === "split" &&
      (item.axis === "horizontal" || item.axis === "vertical") &&
      typeof item.ratio === "number" &&
      item.ratio >= 0.04 &&
      item.ratio <= 0.96 &&
      (item.resize === undefined || isWorkspacePanelSplitResize(item.resize)) &&
      visit(item.first, depth + 1) &&
      visit(item.second, depth + 1)
    );
  };
  return visit(value, 0) ? { tabs, canvas, ids } : null;
}
function isWorkspacePanelSplitResize(value: unknown): value is WorkspacePanelSplitResize {
  if (!value || typeof value !== "object" || Array.isArray(value)) return false;
  const resize = value as Partial<WorkspacePanelSplitResize>;
  const validExtent = (extent: number | undefined) =>
    extent === undefined || (Number.isFinite(extent) && extent >= 0);
  const validRatio = (ratio: number | undefined) =>
    ratio === undefined || (Number.isFinite(ratio) && ratio >= 0 && ratio <= 1);
  return (
    (resize.target === "colorbar-width" || resize.target === "colorbar-split-position") &&
    validExtent(resize.minimumFirstExtent) &&
    validExtent(resize.minimumSecondExtent) &&
    validRatio(resize.minimumFirstRatio) &&
    validRatio(resize.maximumFirstRatio)
  );
}
export function validWorkspacePanelTree(value: unknown): value is WorkspacePanelNode {
  return validWorkspacePanelLayout({ dock: value, floats: [] });
}
export function validWorkspacePanelLayout(value: unknown): value is WorkspacePanelLayout {
  if (!value || typeof value !== "object") return false;
  const state = value as Record<string, unknown>,
    dock = inspectTree(state.dock);
  if (
    !dock ||
    dock.canvas !== 1 ||
    !Array.isArray(state.floats) ||
    state.floats.length > workspacePanelIds.length
  )
    return false;
  const tabs = [...dock.tabs],
    ids = new Set(dock.ids);
  for (const candidate of state.floats) {
    if (!candidate || typeof candidate !== "object") return false;
    const pane = candidate as Record<string, unknown>;
    if (
      pane.kind !== "pane" ||
      typeof pane.id !== "string" ||
      ids.has(pane.id) ||
      !Array.isArray(pane.tabs) ||
      !pane.tabs.length ||
      !pane.tabs.every((tab) => workspacePanelIds.includes(tab as WorkspacePanelId)) ||
      !pane.tabs.includes(pane.active) ||
      ![pane.x, pane.y, pane.width, pane.height].every(
        (n) => typeof n === "number" && Number.isFinite(n),
      ) ||
      (pane.barOrientation !== undefined &&
        pane.barOrientation !== WorkspaceBarOrientation.Horizontal &&
        pane.barOrientation !== WorkspaceBarOrientation.Vertical) ||
      (pane.presentation !== undefined &&
        pane.presentation !== FloatingPanePresentation.Window &&
        pane.presentation !== FloatingPanePresentation.Button) ||
      (pane.anchor !== undefined &&
        !Object.values(FloatingPaneAnchor).includes(pane.anchor as FloatingPaneAnchor)) ||
      (pane.width as number) <
        (pane.tabs.length === 1 && isWorkspaceBarId(pane.active as WorkspacePanelId) ? 1 : 120) ||
      (pane.height as number) <
        (pane.tabs.length === 1 && isWorkspaceBarId(pane.active as WorkspacePanelId) ? 1 : 100)
    )
      return false;
    const inspected = inspectTree(pane);
    if (!inspected || inspected.ids.some((id) => ids.has(id))) return false;
    for (const id of inspected.ids) ids.add(id);
    tabs.push(...inspected.tabs);
  }
  return (
    tabs.length === workspacePanelIds.length &&
    workspacePanelIds.every((tab) => tabs.filter((item) => item === tab).length === 1)
  );
}
