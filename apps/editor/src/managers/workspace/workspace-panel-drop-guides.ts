import { DockEdge } from "$/managers/workspace/dock-edge";
import type {
  WorkspaceDropRect,
  WorkspacePanelDrop,
} from "$/managers/workspace/workspace-panel-drop";
import {
  canDockWorkspacePanelsAtEdge,
  type WorkspacePanelId,
} from "$/managers/workspace/workspace-panel-layout";

export enum WorkspaceDropGuideScope {
  Workspace = "workspace",
  Panel = "panel",
  Canvas = "canvas",
  Floating = "floating",
}

export interface WorkspaceDropSurface {
  scope: Exclude<WorkspaceDropGuideScope, WorkspaceDropGuideScope.Workspace>;
  id: string;
  rect: WorkspaceDropRect;
  tabs: readonly WorkspacePanelId[];
  paneId?: string;
  tab?: WorkspacePanelId;
  panel?: WorkspacePanelId;
}
export interface WorkspaceDropGuide {
  id: string;
  scope: WorkspaceDropGuideScope;
  target: WorkspacePanelDrop;
  rect: WorkspaceDropRect;
  band?: WorkspaceDropRect;
}
export interface WorkspaceDropGuidance {
  guides: WorkspaceDropGuide[];
  selected: WorkspaceDropGuide | null;
  surface: WorkspaceDropSurface | null;
  workspace: WorkspaceDropRect;
}

const WORKSPACE_EDGE_BAND = 28;
const WORKSPACE_MARKER_WIDTH = 96;
const MARKER_HEIGHT = 28;
const PANEL_MARKER_WIDTH = 44;
const MIN_PANEL_MARKER_EXTENT = 18;
const MARKER_GAP = 4;
const MARKER_INSET = 4;
const NEARBY_SURFACE_DISTANCE = 48;
const MARKER_HIT_MARGIN = 5;
const OUTSIDE_EDGE_MARGIN = 8;
const edges = [DockEdge.Left, DockEdge.Right, DockEdge.Top, DockEdge.Bottom] as const;
const clamp = (value: number, low: number, high: number) => Math.max(low, Math.min(high, value));
const contains = (rect: WorkspaceDropRect, x: number, y: number, margin = 0) =>
  x >= rect.left - margin &&
  x <= rect.left + rect.width + margin &&
  y >= rect.top - margin &&
  y <= rect.top + rect.height + margin;
const distanceToRect = (rect: WorkspaceDropRect, x: number, y: number) =>
  Math.hypot(
    Math.max(rect.left - x, 0, x - rect.left - rect.width),
    Math.max(rect.top - y, 0, y - rect.top - rect.height),
  );
const edgeDistance = (rect: WorkspaceDropRect, edge: DockEdge, x: number, y: number) =>
  edge === DockEdge.Left
    ? Math.abs(x - rect.left)
    : edge === DockEdge.Right
      ? Math.abs(rect.left + rect.width - x)
      : edge === DockEdge.Top
        ? Math.abs(y - rect.top)
        : Math.abs(rect.top + rect.height - y);

/** Visible markers, enlarged hit zones and pointer snapping share these layout-local rectangles. */
export function workspacePanelDropGuidance({
  workspace,
  surfaces,
  sourceTabs,
  sourceFloatId,
  x,
  y,
  previousGuideId,
  previousSurfaceId,
  movement,
}: {
  workspace: WorkspaceDropRect;
  surfaces: readonly WorkspaceDropSurface[];
  sourceTabs: readonly WorkspacePanelId[];
  sourceFloatId?: string;
  x: number;
  y: number;
  previousGuideId?: string;
  previousSurfaceId?: string;
  movement?: { x: number; y: number };
}): WorkspaceDropGuidance {
  const guides: WorkspaceDropGuide[] = [];
  const horizontalBand = Math.min(WORKSPACE_EDGE_BAND, workspace.width / 4);
  const verticalBand = Math.min(WORKSPACE_EDGE_BAND, workspace.height / 4);
  const width = Math.min(WORKSPACE_MARKER_WIDTH, workspace.width);
  const height = Math.min(MARKER_HEIGHT, workspace.height);
  for (const edge of edges) {
    if (!canDockWorkspacePanelsAtEdge(sourceTabs, edge)) continue;
    const horizontal = edge === DockEdge.Left || edge === DockEdge.Right;
    const band = horizontal
      ? {
          left:
            edge === DockEdge.Left
              ? workspace.left
              : workspace.left + workspace.width - horizontalBand,
          top: workspace.top,
          width: horizontalBand,
          height: workspace.height,
        }
      : {
          left: workspace.left,
          top:
            edge === DockEdge.Top ? workspace.top : workspace.top + workspace.height - verticalBand,
          width: workspace.width,
          height: verticalBand,
        };
    guides.push({
      id: `workspace:${edge}`,
      scope: WorkspaceDropGuideScope.Workspace,
      target: { kind: "workspace", edge },
      band,
      rect: {
        left:
          edge === DockEdge.Left
            ? workspace.left
            : edge === DockEdge.Right
              ? workspace.left + workspace.width - horizontalBand
              : workspace.left + (workspace.width - width) / 2,
        top:
          edge === DockEdge.Top
            ? workspace.top
            : edge === DockEdge.Bottom
              ? workspace.top + workspace.height - height
              : workspace.top +
                (workspace.height - Math.min(WORKSPACE_MARKER_WIDTH, workspace.height)) / 2,
        width: horizontal ? horizontalBand : width,
        height: horizontal ? Math.min(WORKSPACE_MARKER_WIDTH, workspace.height) : height,
      },
    });
  }

  const eligible = surfaces.filter(
    (surface) =>
      surface.id !== sourceFloatId &&
      (surface.scope === WorkspaceDropGuideScope.Canvas ||
        !surface.tabs.every((tab) => sourceTabs.includes(tab))),
  );
  const localGuidesFor = (surface: WorkspaceDropSurface): WorkspaceDropGuide[] => {
    const safe = {
      left: workspace.left + horizontalBand + MARKER_GAP,
      top: workspace.top + verticalBand + MARKER_GAP,
      width: Math.max(0, workspace.width - (horizontalBand + MARKER_GAP) * 2),
      height: Math.max(0, workspace.height - (verticalBand + MARKER_GAP) * 2),
    };
    const left = Math.max(surface.rect.left, safe.left),
      top = Math.max(surface.rect.top, safe.top);
    const rect = {
      left,
      top,
      width: Math.max(
        0,
        Math.min(surface.rect.left + surface.rect.width, safe.left + safe.width) - left,
      ),
      height: Math.max(
        0,
        Math.min(surface.rect.top + surface.rect.height, safe.top + safe.height) - top,
      ),
    };
    const markerWidth = Math.min(
      PANEL_MARKER_WIDTH,
      (rect.width - MARKER_INSET * 2 - MARKER_GAP * 2) / 3,
    );
    const markerHeight = Math.min(
      MARKER_HEIGHT,
      (rect.height - MARKER_INSET * 2 - MARKER_GAP * 2) / 3,
    );
    const cross =
      surface.scope !== WorkspaceDropGuideScope.Floating &&
      markerWidth >= MIN_PANEL_MARKER_EXTENT &&
      markerHeight >= MIN_PANEL_MARKER_EXTENT;
    const centerWidth = cross
      ? markerWidth
      : Math.max(
          0,
          Math.min(PANEL_MARKER_WIDTH, surface.rect.width - MARKER_INSET * 2, safe.width),
        );
    const centerHeight = cross
      ? markerHeight
      : Math.max(0, Math.min(MARKER_HEIGHT, surface.rect.height - MARKER_INSET * 2, safe.height));
    const center = {
      left: clamp(
        (cross ? rect.left : surface.rect.left) +
          ((cross ? rect.width : surface.rect.width) - centerWidth) / 2,
        safe.left,
        safe.left + safe.width - centerWidth,
      ),
      top: clamp(
        (cross ? rect.top : surface.rect.top) +
          ((cross ? rect.height : surface.rect.height) - centerHeight) / 2,
        safe.top,
        safe.top + safe.height - centerHeight,
      ),
      width: centerWidth,
      height: centerHeight,
    };
    const local: WorkspaceDropGuide[] = [];
    if (centerWidth >= MIN_PANEL_MARKER_EXTENT && centerHeight >= MIN_PANEL_MARKER_EXTENT)
      local.push({
        id: `${surface.scope}:${surface.id}:center`,
        scope: surface.scope,
        rect: center,
        target:
          surface.scope === WorkspaceDropGuideScope.Canvas
            ? { kind: "outside" }
            : surface.scope === WorkspaceDropGuideScope.Floating
              ? { kind: "float", paneId: surface.paneId ?? surface.id }
              : { kind: "pane", paneId: surface.paneId ?? surface.id },
      });
    if (cross)
      for (const edge of edges) {
        if (!canDockWorkspacePanelsAtEdge([...sourceTabs, ...surface.tabs], edge)) continue;
        local.push({
          id: `${surface.scope}:${surface.id}:${edge}`,
          scope: surface.scope,
          rect: {
            ...center,
            left:
              center.left +
              (edge === DockEdge.Left
                ? -markerWidth - MARKER_GAP
                : edge === DockEdge.Right
                  ? markerWidth + MARKER_GAP
                  : 0),
            top:
              center.top +
              (edge === DockEdge.Top
                ? -markerHeight - MARKER_GAP
                : edge === DockEdge.Bottom
                  ? markerHeight + MARKER_GAP
                  : 0),
          },
          target:
            surface.scope === WorkspaceDropGuideScope.Canvas
              ? { kind: "canvas", edge }
              : surface.tab
                ? {
                    kind: "tab",
                    paneId: surface.paneId ?? surface.id,
                    tab: surface.tab,
                    panel: surface.panel,
                    edge,
                  }
                : { kind: "pane", paneId: surface.id, edge },
        });
      }
    return local;
  };
  // A narrow bar's merge marker can sit just beside it. Keep that surface while approaching its marker.
  const previousSurface = eligible.find((surface) => surface.id === previousSurfaceId);
  const previousMarkers = previousSurface ? localGuidesFor(previousSurface) : [];
  const retainedSurface =
    previousSurface &&
    previousMarkers.some((guide) => contains(guide.rect, x, y, MARKER_HIT_MARGIN))
      ? previousSurface
      : null;
  // Floats sit above the dock; the last rendered float is closest to the pointer.
  const floating = [...eligible]
    .reverse()
    .find(
      (surface) =>
        surface.scope === WorkspaceDropGuideScope.Floating && contains(surface.rect, x, y),
    );
  const nearby = eligible
    .filter((surface) => distanceToRect(surface.rect, x, y) <= NEARBY_SURFACE_DISTANCE)
    .sort((first, second) => distanceToRect(first.rect, x, y) - distanceToRect(second.rect, x, y));
  const nested = eligible.find((surface) => surface.panel && contains(surface.rect, x, y));
  const surface = nested ?? floating ?? retainedSurface ?? nearby[0] ?? null;
  if (surface) guides.push(...localGuidesFor(surface));
  const inWorkspace = contains(workspace, x, y, OUTSIDE_EDGE_MARGIN);
  const outer = inWorkspace
    ? guides.filter(
        (guide) =>
          guide.scope === WorkspaceDropGuideScope.Workspace &&
          (contains(guide.rect, x, y) ||
            (guide.band &&
              contains(guide.band, x, y, contains(workspace, x, y) ? 0 : OUTSIDE_EDGE_MARGIN))),
      )
    : [];
  outer.sort((first, second) => {
    const firstMarker = contains(first.rect, x, y),
      secondMarker = contains(second.rect, x, y);
    if (firstMarker !== secondMarker) return firstMarker ? -1 : 1;
    // A toolbar usually starts at a corner. Horizontal travel should still reach a side dock.
    if (movement && Math.abs(movement.x) !== Math.abs(movement.y)) {
      const horizontalTravel = Math.abs(movement.x) > Math.abs(movement.y);
      const firstSide =
        first.target.kind === "workspace" &&
        (first.target.edge === DockEdge.Left || first.target.edge === DockEdge.Right);
      const secondSide =
        second.target.kind === "workspace" &&
        (second.target.edge === DockEdge.Left || second.target.edge === DockEdge.Right);
      if (firstSide !== secondSide) return firstSide === horizontalTravel ? -1 : 1;
    }
    return (
      edgeDistance(workspace, (first.target as { edge: DockEdge }).edge, x, y) -
      edgeDistance(workspace, (second.target as { edge: DockEdge }).edge, x, y)
    );
  });
  const local = guides.filter((guide) => guide.scope !== WorkspaceDropGuideScope.Workspace);
  const previous = local.find(
    (guide) => guide.id === previousGuideId && contains(guide.rect, x, y, MARKER_HIT_MARGIN),
  );
  const selected =
    outer[0] ??
    local.find((guide) => contains(guide.rect, x, y)) ??
    previous ??
    local
      .filter((guide) => contains(guide.rect, x, y, MARKER_HIT_MARGIN))
      .sort(
        (first, second) =>
          Math.hypot(
            x - first.rect.left - first.rect.width / 2,
            y - first.rect.top - first.rect.height / 2,
          ) -
          Math.hypot(
            x - second.rect.left - second.rect.width / 2,
            y - second.rect.top - second.rect.height / 2,
          ),
      )[0] ??
    null;
  return { workspace, guides, surface, selected };
}
