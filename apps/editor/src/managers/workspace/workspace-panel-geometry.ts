import { DockEdge } from "$/managers/workspace/dock-edge";
import {
  FloatingPaneAnchor,
  WorkspaceBarOrientation,
  FloatingPanePresentation,
  isWorkspaceBarId,
  type FloatingWorkspacePane,
  type WorkspacePanelNode,
  type WorkspacePanelId,
  type WorkspacePanelPane,
  type WorkspacePanelTabNode,
  workspacePaneTabLayout,
} from "$/managers/workspace/workspace-panel-layout";

// X applies beside bars; Y applies between windows. Shared by layout and drag previews.
export const WORKSPACE_BAR_GAP = 4;
export const WORKSPACE_WINDOW_GAP = 8;
const MIN_FLOATING_WINDOW_WIDTH = 120;
const MIN_FLOATING_WINDOW_HEIGHT = 100;
const DEFAULT_FLOATING_WINDOW_AREA_FRACTION = 0.85;
const FLOATING_ANCHOR_FACTORS: Record<FloatingPaneAnchor, { x: number; y: number }> = {
  [FloatingPaneAnchor.TopLeft]: { x: 0, y: 0 },
  [FloatingPaneAnchor.TopRight]: { x: 1, y: 0 },
  [FloatingPaneAnchor.BottomLeft]: { x: 0, y: 1 },
  [FloatingPaneAnchor.BottomRight]: { x: 1, y: 1 },
  [FloatingPaneAnchor.Top]: { x: 0.5, y: 0 },
  [FloatingPaneAnchor.Bottom]: { x: 0.5, y: 1 },
  [FloatingPaneAnchor.Left]: { x: 0, y: 0.5 },
  [FloatingPaneAnchor.Right]: { x: 1, y: 0.5 },
};
const clamp = (value: number, low: number, high: number) => Math.max(low, Math.min(high, value));

export function floatingWorkspaceAnchorOffset(
  pane: Pick<FloatingWorkspacePane, "anchor" | "width" | "height">,
  barThickness: number,
) {
  const factors = FLOATING_ANCHOR_FACTORS[pane.anchor ?? FloatingPaneAnchor.TopLeft];
  return {
    x: Math.max(0, pane.width - barThickness) * factors.x,
    y: Math.max(0, pane.height - barThickness) * factors.y,
  };
}

export function floatingWorkspaceRect(
  pane: FloatingWorkspacePane,
  area: { width: number; height: number },
  barThickness: number,
) {
  const extent = floatingWorkspaceFootprint(pane, area, barThickness);
  if (pane.anchor && pane.presentation !== FloatingPanePresentation.Button) {
    const savedOffset = floatingWorkspaceAnchorOffset(pane, barThickness);
    const visibleOffset = floatingWorkspaceAnchorOffset({ ...pane, ...extent }, barThickness);
    return {
      ...extent,
      x: clamp(pane.x + savedOffset.x, 0, Math.max(0, area.width - barThickness)) - visibleOffset.x,
      y:
        clamp(pane.y + savedOffset.y, 0, Math.max(0, area.height - barThickness)) - visibleOffset.y,
    };
  }
  return {
    ...extent,
    x: clamp(pane.x, 0, Math.max(0, area.width - extent.width)),
    y: clamp(pane.y, 0, Math.max(0, area.height - extent.height)),
  };
}

function anchoredExtent(position: number, areaExtent: number, thickness: number, factor: number) {
  if (factor === 0) return areaExtent - position;
  if (factor === 1) return position + thickness;
  return Math.min(position + thickness / 2, areaExtent - position - thickness / 2) * 2;
}

/** Select an opening direction once, keeping the launcher at the same world position. */
export function toggleFloatingWorkspacePane(
  pane: FloatingWorkspacePane,
  area: { width: number; height: number },
  barThickness: number,
): FloatingWorkspacePane {
  const rect = floatingWorkspaceRect(pane, area, barThickness);
  if (pane.presentation !== FloatingPanePresentation.Button) {
    const offset = floatingWorkspaceAnchorOffset({ ...pane, ...rect }, barThickness);
    return {
      ...pane,
      x: rect.x + offset.x,
      y: rect.y + offset.y,
      presentation: FloatingPanePresentation.Button,
    };
  }
  const preferred = floatingWorkspaceSize(pane, area, barThickness);
  const bar = isWorkspaceBar(pane);
  const horizontal = workspaceBarOrientation(pane) === WorkspaceBarOrientation.Horizontal;
  const anchors = Object.keys(FLOATING_ANCHOR_FACTORS) as FloatingPaneAnchor[];
  if (pane.anchor) anchors.unshift(pane.anchor);
  let selected = FloatingPaneAnchor.TopLeft;
  let selectedScale = -1;
  for (const anchor of anchors) {
    const factors = FLOATING_ANCHOR_FACTORS[anchor];
    if (bar && (factors.x === 0.5 || factors.y === 0.5)) continue;
    const maxWidth = anchoredExtent(rect.x, area.width, barThickness, factors.x);
    const maxHeight = anchoredExtent(rect.y, area.height, barThickness, factors.y);
    const scale = Math.min(
      1,
      bar && !horizontal ? 1 : maxWidth / preferred.width,
      bar && horizontal ? 1 : maxHeight / preferred.height,
    );
    if (scale > selectedScale) {
      selected = anchor;
      selectedScale = scale;
    }
    if (scale >= 1) break;
  }
  const extent = {
    width:
      bar && !horizontal
        ? barThickness
        : Math.max(
            bar ? 1 : MIN_FLOATING_WINDOW_WIDTH,
            Math.round(preferred.width * selectedScale),
          ),
    height:
      bar && horizontal
        ? barThickness
        : Math.max(
            bar ? 1 : MIN_FLOATING_WINDOW_HEIGHT,
            Math.round(preferred.height * selectedScale),
          ),
  };
  const offset = floatingWorkspaceAnchorOffset({ ...extent, anchor: selected }, barThickness);
  return {
    ...pane,
    ...extent,
    x: rect.x - offset.x,
    y: rect.y - offset.y,
    anchor: selected,
    presentation: FloatingPanePresentation.Window,
  };
}

export function floatingWorkspaceResizeEdges(pane: FloatingWorkspacePane) {
  const factors = FLOATING_ANCHOR_FACTORS[pane.anchor ?? FloatingPaneAnchor.TopLeft];
  return {
    x: factors.x === 1 ? DockEdge.Left : DockEdge.Right,
    y: factors.y === 1 ? DockEdge.Top : DockEdge.Bottom,
  };
}

/** Resize from the captured frame, keeping its anchor and opening direction fixed. */
export function resizeFloatingWorkspaceGeometry(
  pane: FloatingWorkspacePane,
  area: { width: number; height: number },
  barThickness: number,
  delta: { x: number; y: number },
) {
  const rect = floatingWorkspaceRect(pane, area, barThickness);
  const factors = FLOATING_ANCHOR_FACTORS[pane.anchor ?? FloatingPaneAnchor.TopLeft];
  const offset = floatingWorkspaceAnchorOffset({ ...pane, ...rect }, barThickness);
  const anchorX = rect.x + offset.x;
  const anchorY = rect.y + offset.y;
  const bar = isWorkspaceBar(pane);
  const horizontal = workspaceBarOrientation(pane) === WorkspaceBarOrientation.Horizontal;
  const maxWidth = Math.max(
    bar ? 0 : MIN_FLOATING_WINDOW_WIDTH,
    anchoredExtent(anchorX, area.width, barThickness, factors.x),
  );
  const maxHeight = Math.max(
    bar ? 0 : MIN_FLOATING_WINDOW_HEIGHT,
    anchoredExtent(anchorY, area.height, barThickness, factors.y),
  );
  const resizeScale = (factor: number) => (factor === 1 ? -1 : factor === 0.5 ? 2 : 1);
  const extent = {
    width:
      bar && !horizontal
        ? barThickness
        : clamp(
            rect.width + delta.x * resizeScale(factors.x),
            Math.min(MIN_FLOATING_WINDOW_WIDTH, maxWidth),
            maxWidth,
          ),
    height:
      bar && horizontal
        ? barThickness
        : clamp(
            rect.height + delta.y * resizeScale(factors.y),
            Math.min(MIN_FLOATING_WINDOW_HEIGHT, maxHeight),
            maxHeight,
          ),
  };
  const nextOffset = floatingWorkspaceAnchorOffset({ ...pane, ...extent }, barThickness);
  return { ...extent, x: anchorX - nextOffset.x, y: anchorY - nextOffset.y };
}
const DEFAULT_FLOATING_PANEL_SIZES: Record<WorkspacePanelId, { width: number; height: number }> = {
  palette: { width: 320, height: 420 },
  timeline: { width: 640, height: 280 },
  picker: { width: 320, height: 360 },
  tileset: { width: 360, height: 360 },
  tools: { width: 320, height: 420 },
  context: { width: 640, height: 240 },
  shortcuts: { width: 320, height: 360 },
};
function preferredTabSize(node: WorkspacePanelTabNode): { width: number; height: number } {
  if (node.kind === "panel") return DEFAULT_FLOATING_PANEL_SIZES[node.panel];
  const first = preferredTabSize(node.first),
    second = preferredTabSize(node.second);
  return node.axis === "horizontal"
    ? {
        width: first.width + second.width + WORKSPACE_WINDOW_GAP,
        height: Math.max(first.height, second.height),
      }
    : {
        width: Math.max(first.width, second.width),
        height: first.height + second.height + WORKSPACE_WINDOW_GAP,
      };
}

/** First-time floats use the active panel's shape, independent of its docked extent. */
export function defaultFloatingWorkspaceGeometry(
  pane: WorkspacePanelPane,
  area: { width: number; height: number },
  barThickness: number,
  sourceSize?: { width: number; height: number },
) {
  const preferred = preferredTabSize(workspacePaneTabLayout(pane, pane.active));
  const availableWidth = Math.max(
    MIN_FLOATING_WINDOW_WIDTH,
    area.width > 0 ? area.width * DEFAULT_FLOATING_WINDOW_AREA_FRACTION : preferred.width,
  );
  const availableHeight = Math.max(
    MIN_FLOATING_WINDOW_HEIGHT,
    area.height > 0 ? area.height * DEFAULT_FLOATING_WINDOW_AREA_FRACTION : preferred.height,
  );
  if (isWorkspaceBar(pane)) {
    const barOrientation =
      pane.active === "context"
        ? WorkspaceBarOrientation.Horizontal
        : sourceSize
          ? sourceSize.width >= sourceSize.height
            ? WorkspaceBarOrientation.Horizontal
            : WorkspaceBarOrientation.Vertical
          : WorkspaceBarOrientation.Vertical;
    const horizontal = barOrientation === WorkspaceBarOrientation.Horizontal;
    const length = Math.min(
      Math.max(preferred.width, preferred.height),
      horizontal ? availableWidth : availableHeight,
    );
    return {
      width: horizontal ? Math.round(length) : barThickness,
      height: horizontal ? barThickness : Math.round(length),
      barOrientation,
    };
  }
  const scale = Math.min(1, availableWidth / preferred.width, availableHeight / preferred.height);
  return {
    width: Math.max(MIN_FLOATING_WINDOW_WIDTH, Math.round(preferred.width * scale)),
    height: Math.max(MIN_FLOATING_WINDOW_HEIGHT, Math.round(preferred.height * scale)),
  };
}

export function isWorkspaceBar(node: WorkspacePanelNode): boolean {
  return (
    node.kind === "pane" &&
    node.tabs.length === 1 &&
    !node.tabLayouts?.[node.active] &&
    isWorkspaceBarId(node.active)
  );
}

export function workspaceBarOrientation(pane: FloatingWorkspacePane): WorkspaceBarOrientation {
  if (pane.active === "context") return WorkspaceBarOrientation.Horizontal;
  return (
    pane.barOrientation ??
    (pane.width >= pane.height
      ? WorkspaceBarOrientation.Horizontal
      : WorkspaceBarOrientation.Vertical)
  );
}

/** A group made only of parallel bars also keeps its combined short extent fixed. */
function fixedBarExtent(
  node: WorkspacePanelNode,
  axis: "horizontal" | "vertical",
  thickness: number,
): number | null {
  if (isWorkspaceBar(node)) return thickness;
  if (node.kind !== "split" || node.axis !== axis) return null;
  const first = fixedBarExtent(node.first, axis, thickness);
  const second = fixedBarExtent(node.second, axis, thickness);
  return first !== null && second !== null ? first + WORKSPACE_BAR_GAP + second : null;
}

export function workspaceSplitSizing(
  node: Extract<WorkspacePanelNode, { kind: "split" }>,
  thickness: number,
) {
  const first = fixedBarExtent(node.first, node.axis, thickness);
  const second = fixedBarExtent(node.second, node.axis, thickness);
  return {
    first,
    second,
    gap: first !== null || second !== null ? WORKSPACE_BAR_GAP : WORKSPACE_WINDOW_GAP,
  };
}

export function workspaceSplitGeometry(
  node: Extract<WorkspacePanelNode, { kind: "split" }>,
  extent: number,
  barThickness: number,
  ratio = node.ratio,
) {
  const fixed = workspaceSplitSizing(node, barThickness);
  const gap = Math.min(extent, fixed.gap);
  const available = Math.max(0, extent - gap);
  const first =
    fixed.first !== null
      ? Math.min(fixed.first, available)
      : fixed.second !== null
        ? Math.max(0, available - fixed.second)
        : available * ratio;
  return { first, second: available - first, gap };
}

export function floatingWorkspaceSize(
  pane: FloatingWorkspacePane,
  area: { width: number; height: number },
  barThickness: number,
) {
  const bar = isWorkspaceBar(pane);
  const horizontal = workspaceBarOrientation(pane) === WorkspaceBarOrientation.Horizontal;
  return {
    width: bar && !horizontal ? barThickness : Math.min(pane.width, Math.max(0, area.width)),
    height: bar && horizontal ? barThickness : Math.min(pane.height, Math.max(0, area.height)),
  };
}

export function floatingWorkspaceFootprint(
  pane: FloatingWorkspacePane,
  area: { width: number; height: number },
  barThickness: number,
) {
  return pane.presentation === FloatingPanePresentation.Button
    ? { width: Math.min(barThickness, area.width), height: Math.min(barThickness, area.height) }
    : floatingWorkspaceSize(pane, area, barThickness);
}
