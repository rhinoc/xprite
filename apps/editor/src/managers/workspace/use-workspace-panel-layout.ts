import {
  useCallback,
  useEffect,
  useLayoutEffect,
  useRef,
  useState,
  type SetStateAction,
} from "react";

import { TelemetryFeature, TelemetryFeatureAction } from "$/managers/ports/telemetry";
import { useEditorChromePreferences } from "$/managers/shell/editor-chrome-preferences-context";
import { useEditorLayoutPreferences } from "$/managers/shell/layout-preferences";
import { useTelemetry } from "$/managers/telemetry/telemetry-context";
import { DockEdge } from "$/managers/workspace/dock-edge";
import {
  defaultWorkspacePanelLayout,
  dockWorkspacePanelAtCanvas,
  removeWorkspacePanelTab,
  removeWorkspacePanePanels,
  workspacePanelTimelinePosition,
  workspaceLayoutConfigurationForPreset,
  type FloatingWorkspacePane,
  type WorkspacePanelNode,
  type WorkspacePanelId,
  type WorkspacePanelLayout,
  type WorkspaceLayoutConfiguration,
  type WorkspaceLayoutMode,
  type WorkspacePanelLayoutDefaults,
  type TimelineDockPosition,
} from "$/managers/workspace/workspace-panel-layout";

const layoutArrangement = (layout: WorkspacePanelLayout) => {
  const omitActiveTab = (node: WorkspacePanelNode): unknown => {
    if (node.kind === "canvas") return node;
    if (node.kind === "pane")
      return { kind: node.kind, id: node.id, tabs: node.tabs, tabLayouts: node.tabLayouts };
    return {
      kind: node.kind,
      id: node.id,
      axis: node.axis,
      ratio: node.ratio,
      resize: node.resize,
      first: omitActiveTab(node.first),
      second: omitActiveTab(node.second),
    };
  };
  return JSON.stringify({
    dock: omitActiveTab(layout.dock),
    floats: layout.floats.map(({ active: _active, ...pane }) => pane),
  });
};
const withoutFloatTab = (floats: FloatingWorkspacePane[], id: string, tab: WorkspacePanelId) =>
  floats.flatMap((pane) => {
    if (pane.id !== id) return [pane];
    const next = removeWorkspacePanePanels(pane, [tab]);
    return next ? [next] : [];
  });
const edgeForTimelinePosition = (position: TimelineDockPosition) =>
  position === "top"
    ? DockEdge.Top
    : position === "bottom"
      ? DockEdge.Bottom
      : position === "left"
        ? DockEdge.Left
        : DockEdge.Right;
const timelinePositionForEdge = (edge: DockEdge): TimelineDockPosition =>
  edge === DockEdge.Top
    ? "top"
    : edge === DockEdge.Bottom
      ? "bottom"
      : edge === DockEdge.Left
        ? "left"
        : "right";
const workspacePanelLayoutWithTimelineAtEdge = (
  current: WorkspacePanelLayout,
  edge: DockEdge,
): WorkspacePanelLayout => ({
  dock: dockWorkspacePanelAtCanvas(
    removeWorkspacePanelTab(current.dock, "timeline"),
    "timeline",
    edge,
  ),
  floats: current.floats.flatMap((pane) => withoutFloatTab([pane], pane.id, "timeline")),
});

/** Owns layout persistence, preset loading and timeline-setting synchronization. */
export function useWorkspacePanelLayout({
  workspaceLayoutConfiguration,
  savedWorkspaceLayoutId,
  shortScreen,
  layoutDefaults,
  timelinePosition,
  onTimelinePositionChange,
  setWorkspaceLayoutMode,
}: {
  workspaceLayoutConfiguration: WorkspaceLayoutConfiguration;
  savedWorkspaceLayoutId?: string;
  shortScreen: boolean;
  layoutDefaults?: WorkspacePanelLayoutDefaults;
  timelinePosition: TimelineDockPosition;
  onTimelinePositionChange?: (position: TimelineDockPosition) => void;
  setWorkspaceLayoutMode: (
    mode: WorkspaceLayoutMode,
    configuration?: WorkspaceLayoutConfiguration,
    savedLayoutId?: string,
  ) => WorkspaceLayoutConfiguration;
}) {
  const savedLayoutActive = Boolean(savedWorkspaceLayoutId);
  const panelArrangement = workspaceLayoutConfiguration.panelLayout.defaultArrangement;
  const preferences = useEditorLayoutPreferences();
  const telemetry = useTelemetry();
  const chromePreferences = useEditorChromePreferences();
  const [layout, setLayoutState] = useState(() => {
    const fallback = defaultWorkspacePanelLayout(
      workspaceLayoutConfiguration,
      shortScreen,
      layoutDefaults,
    );
    if (savedWorkspaceLayoutId) {
      const saved = preferences
        .readSavedWorkspacePanelLayouts()
        .find((candidate) => candidate.id === savedWorkspaceLayoutId);
      if (saved) return saved.layout;
    }
    return preferences.readWorkspacePanelLayout(panelArrangement, fallback);
  });
  const layoutSelectionKey = savedWorkspaceLayoutId
    ? `saved:${savedWorkspaceLayoutId}`
    : panelArrangement;
  const [appliedLayoutKey, setAppliedLayoutKey] = useState(layoutSelectionKey);
  const layoutRef = useRef(layout);
  const replaceLayout = useCallback((next: WorkspacePanelLayout) => {
    layoutRef.current = next;
    setLayoutState(next);
  }, []);
  const setLayout = useCallback((update: SetStateAction<WorkspacePanelLayout>) => {
    const current = layoutRef.current;
    const next = typeof update === "function" ? update(current) : update;
    if (next === current) return;
    layoutRef.current = next;
    setLayoutState(next);
  }, []);
  const timelinePositionRef = useRef<TimelineDockPosition>(timelinePosition);
  const resizing = useRef(false);
  const recordResize = useRef(false);
  const persistedLayout = useRef<{ key: string; layout: WorkspacePanelLayout } | null>(null);
  const beginLayoutInteraction = useCallback((resize = true) => {
    resizing.current = true;
    recordResize.current = resize;
  }, []);
  const persistLayout = useCallback(() => {
    if (savedLayoutActive || appliedLayoutKey !== layoutSelectionKey) return;
    if (
      persistedLayout.current?.key === layoutSelectionKey &&
      persistedLayout.current.layout === layoutRef.current
    )
      return;
    preferences.writeWorkspacePanelLayout(panelArrangement, layoutRef.current);
    persistedLayout.current = { key: layoutSelectionKey, layout: layoutRef.current };
  }, [savedLayoutActive, appliedLayoutKey, layoutSelectionKey, preferences, panelArrangement]);
  const endLayoutInteraction = useCallback(() => {
    const wasResizing = resizing.current && recordResize.current;
    resizing.current = false;
    recordResize.current = false;
    persistLayout();
    if (wasResizing) telemetry.featureUsed(TelemetryFeature.Layout, TelemetryFeatureAction.Resize);
  }, [persistLayout, telemetry]);
  useEffect(() => {
    if (!resizing.current) persistLayout();
  }, [
    appliedLayoutKey,
    layout,
    layoutSelectionKey,
    panelArrangement,
    preferences,
    savedLayoutActive,
    persistLayout,
  ]);
  useLayoutEffect(() => {
    if (savedLayoutActive) {
      if (appliedLayoutKey !== layoutSelectionKey) setAppliedLayoutKey(layoutSelectionKey);
      return;
    }
    if (appliedLayoutKey === layoutSelectionKey) return;
    const fallback = defaultWorkspacePanelLayout(
      workspaceLayoutConfiguration,
      shortScreen,
      layoutDefaults,
    );
    const next = preferences.readWorkspacePanelLayout(panelArrangement, fallback);
    if (layoutArrangement(layoutRef.current) !== layoutArrangement(next)) replaceLayout(next);
    setAppliedLayoutKey(layoutSelectionKey);
  }, [
    appliedLayoutKey,
    layoutDefaults,
    layoutSelectionKey,
    panelArrangement,
    preferences,
    replaceLayout,
    savedLayoutActive,
    shortScreen,
    workspaceLayoutConfiguration,
  ]);
  useEffect(() => {
    if (timelinePositionRef.current === timelinePosition) {
      timelinePositionRef.current = timelinePosition;
      return;
    }
    timelinePositionRef.current = timelinePosition;
    replaceLayout(
      workspacePanelLayoutWithTimelineAtEdge(
        layoutRef.current,
        edgeForTimelinePosition(timelinePosition),
      ),
    );
  }, [replaceLayout, timelinePosition]);
  const recordTimelineDrop = (tabs: readonly WorkspacePanelId[], edge?: DockEdge) => {
    if (!edge || !tabs.includes("timeline")) return;
    const position = timelinePositionForEdge(edge);
    timelinePositionRef.current = position;
    onTimelinePositionChange?.(position);
  };
  const syncTimelinePosition = (next: WorkspacePanelLayout) => {
    const position = workspacePanelTimelinePosition(next.dock);
    if (position) {
      timelinePositionRef.current = position;
      onTimelinePositionChange?.(position);
    }
  };
  const resetWorkspacePanelLayout = () => {
    const configuration = setWorkspaceLayoutMode("auto");
    const arrangement = configuration.panelLayout.defaultArrangement;
    const preset = arrangement === "stacked" ? "compact" : "wide";
    chromePreferences.activateWorkspaceLayout(
      preset,
      workspaceLayoutConfigurationForPreset(preset).chrome,
      true,
    );
    const next = defaultWorkspacePanelLayout(configuration, shortScreen, layoutDefaults);
    replaceLayout(next);
    preferences.writeWorkspacePanelLayout(arrangement, next);
    setAppliedLayoutKey(arrangement);
    syncTimelinePosition(next);
    telemetry.featureUsed(TelemetryFeature.Layout, TelemetryFeatureAction.Reset, {
      layout_mode: "auto",
    });
  };
  const selectWorkspacePanelLayoutMode = (mode: Exclude<WorkspaceLayoutMode, "saved">) => {
    const configuration = setWorkspaceLayoutMode(mode);
    const arrangement = configuration.panelLayout.defaultArrangement;
    const fallback = defaultWorkspacePanelLayout(configuration, shortScreen, layoutDefaults);
    const next = preferences.readWorkspacePanelLayout(arrangement, fallback);
    replaceLayout(next);
    setAppliedLayoutKey(arrangement);
    syncTimelinePosition(next);
    telemetry.featureUsed(TelemetryFeature.Layout, TelemetryFeatureAction.Select, {
      layout_mode: mode,
    });
  };
  const loadWorkspacePanelLayout = (
    next: WorkspacePanelLayout,
    configuration: WorkspaceLayoutConfiguration,
    savedLayoutId: string,
  ) => {
    replaceLayout(next);
    setWorkspaceLayoutMode("saved", configuration, savedLayoutId);
    syncTimelinePosition(next);
    telemetry.featureUsed(TelemetryFeature.Layout, TelemetryFeatureAction.Select, {
      layout_mode: "saved",
    });
  };
  return {
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
  };
}
