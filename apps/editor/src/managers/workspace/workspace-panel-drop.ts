import { DockEdge } from "$/managers/workspace/dock-edge";
import {
  dockWorkspacePaneAtCanvas,
  dockWorkspacePaneAtEdge,
  canDockWorkspacePanelsAtEdge,
  panelPanes,
  removeWorkspacePanelTab,
  splitWorkspacePane,
  workspaceTabPanels,
  workspacePaneTabLayout,
  removeWorkspacePanePanels,
  mergeWorkspacePaneTabs,
  splitWorkspacePaneTab,
  type FloatingWorkspacePane,
  type WorkspacePanelId,
  type WorkspacePanelLayout,
  type WorkspacePanelPane,
} from "$/managers/workspace/workspace-panel-layout";

export type WorkspacePanelDrop =
  | { kind: "tab"; paneId: string; tab: WorkspacePanelId; edge: DockEdge; panel?: WorkspacePanelId }
  | { kind: "pane"; paneId: string; edge?: DockEdge; beforeTab?: WorkspacePanelId }
  | { kind: "canvas"; edge?: DockEdge }
  | { kind: "workspace"; edge: DockEdge }
  | { kind: "float"; paneId: string; beforeTab?: WorkspacePanelId }
  | { kind: "none" }
  | { kind: "outside" };

export interface WorkspaceDropRect {
  left: number;
  top: number;
  width: number;
  height: number;
}
const PANEL_EDGE_FRACTION = 0.25;
const MINIMUM_PANEL_EDGE_BAND = 16;
const MAXIMUM_PANEL_EDGE_BAND = 80;

/** Relative edge bands leave a large central tab target, including on narrow panes. */
export function workspacePanelDropEdge(
  rect: WorkspaceDropRect,
  x: number,
  y: number,
): DockEdge | undefined {
  const horizontalBand = Math.min(
    rect.width / 3,
    Math.max(
      MINIMUM_PANEL_EDGE_BAND,
      Math.min(MAXIMUM_PANEL_EDGE_BAND, rect.width * PANEL_EDGE_FRACTION),
    ),
  );
  const verticalBand = Math.min(
    rect.height / 3,
    Math.max(
      MINIMUM_PANEL_EDGE_BAND,
      Math.min(MAXIMUM_PANEL_EDGE_BAND, rect.height * PANEL_EDGE_FRACTION),
    ),
  );
  const distances = [
    { edge: DockEdge.Left, distance: (x - rect.left) / horizontalBand },
    { edge: DockEdge.Right, distance: (rect.left + rect.width - x) / horizontalBand },
    { edge: DockEdge.Top, distance: (y - rect.top) / verticalBand },
    { edge: DockEdge.Bottom, distance: (rect.top + rect.height - y) / verticalBand },
  ].sort((first, second) => first.distance - second.distance);
  return distances[0].distance < 1 ? distances[0].edge : undefined;
}

/** One transfer operation serves tab, group, floating-window previews and commits. */
export function transferWorkspacePanels(
  current: WorkspacePanelLayout,
  source: WorkspacePanelPane,
  target: WorkspacePanelDrop,
  floating: FloatingWorkspacePane,
  ratio = 0.5,
): WorkspacePanelLayout {
  if (target.kind === "none") return current;
  const targetPane =
    target.kind === "pane"
      ? panelPanes(current.dock).find((pane) => pane.id === target.paneId)
      : target.kind === "float" || target.kind === "tab"
        ? [...panelPanes(current.dock), ...current.floats].find((pane) => pane.id === target.paneId)
        : undefined;
  if (
    "edge" in target &&
    target.edge &&
    !canDockWorkspacePanelsAtEdge(
      [
        ...source.tabs,
        ...(target.kind === "tab" && targetPane
          ? target.panel
            ? [target.panel]
            : workspaceTabPanels(workspacePaneTabLayout(targetPane, target.tab))
          : (targetPane?.tabs ?? [])),
      ],
      target.edge,
    )
  )
    return current;
  if (
    (target.kind === "pane" || target.kind === "float" || target.kind === "tab") &&
    (!targetPane || targetPane.tabs.every((tab) => source.tabs.includes(tab)))
  )
    return current;
  if (
    target.kind === "tab" &&
    (!targetPane?.tabs.includes(target.tab) ||
      (target.panel !== undefined &&
        !workspaceTabPanels(workspacePaneTabLayout(targetPane, target.tab)).includes(
          target.panel,
        )) ||
      (target.panel
        ? [target.panel]
        : workspaceTabPanels(workspacePaneTabLayout(targetPane, target.tab))
      ).some((tab) => source.tabs.includes(tab)))
  )
    return current;
  if (
    target.kind === "pane" &&
    !target.edge &&
    target.beforeTab &&
    source.tabs.includes(target.beforeTab)
  )
    return current;

  const dock = source.tabs.reduce((tree, tab) => removeWorkspacePanelTab(tree, tab), current.dock);
  const floats = current.floats.flatMap((pane) => {
    const next = removeWorkspacePanePanels(pane, source.tabs);
    return next ? [next] : [];
  });
  const merge = (pane: WorkspacePanelPane): WorkspacePanelPane => {
    const before =
      (target.kind === "pane" || target.kind === "float") && target.beforeTab
        ? target.beforeTab
        : undefined;
    return mergeWorkspacePaneTabs(pane, source, before);
  };
  if (target.kind === "tab") {
    const combine = (pane: WorkspacePanelPane) =>
      splitWorkspacePaneTab(
        pane,
        target.panel ?? target.tab,
        source,
        target.edge,
        ratio,
        target.panel,
      );
    const combineDock = (node: typeof dock): typeof dock =>
      node.kind === "split"
        ? { ...node, first: combineDock(node.first), second: combineDock(node.second) }
        : node.kind === "pane" && node.id === target.paneId
          ? combine(node)
          : node;
    return {
      dock: combineDock(dock),
      floats: floats.map((pane) =>
        pane.id === target.paneId ? { ...pane, ...combine(pane) } : pane,
      ),
    };
  }
  if (target.kind === "workspace")
    return { dock: dockWorkspacePaneAtEdge(dock, source, target.edge, ratio), floats };
  if (target.kind === "canvas" && target.edge)
    return { dock: dockWorkspacePaneAtCanvas(dock, source, target.edge, ratio), floats };
  if (target.kind === "pane") {
    if (target.edge)
      return {
        dock: splitWorkspacePane(
          dock,
          source.id === target.paneId
            ? {
                ...source,
                id: `workspace-pane-${globalThis.crypto?.randomUUID?.() ?? Math.random().toString(36).slice(2)}`,
              }
            : source,
          target.paneId,
          target.edge,
          ratio,
        ),
        floats,
      };
    const mergeDock = (node: typeof dock): typeof dock =>
      node.kind === "split"
        ? { ...node, first: mergeDock(node.first), second: mergeDock(node.second) }
        : node.kind === "pane" && node.id === target.paneId
          ? merge(node)
          : node;
    return { dock: mergeDock(dock), floats };
  }
  if (target.kind === "float")
    return {
      dock,
      floats: floats.map((pane) =>
        pane.id === target.paneId ? { ...pane, ...merge(pane) } : pane,
      ),
    };
  return { dock, floats: [...floats, { ...floating, ...source }] };
}
