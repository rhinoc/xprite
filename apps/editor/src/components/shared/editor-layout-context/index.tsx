import { createContext, useContext, useEffect, useMemo, useState, type ReactNode } from "react";

import { SceneBoundsContext } from "$/components/canvas/scene-bounds";
import { useEditorLayoutPreferences } from "$/managers/shell/layout-preferences";
import { editorSceneLayout, isShortEditorHeight } from "$/managers/workspace/editor-layout";
import type {
  WorkspaceLayoutConfiguration,
  WorkspaceLayoutMode,
  WorkspaceLayoutSelection,
} from "$/managers/workspace/workspace-panel-layout";
import { COMPACT_WORKSPACE_LAYOUT_CONFIGURATION } from "$/managers/workspace/workspace-panel-layout";
import { UI_SCALE_X, UI_SCALE_Y } from "@xprite/ui/canvas";

const DEFAULT_COLORBAR_WIDTH = 154;
export const MIN_COLORBAR_WIDTH = 110;
export const MAX_COLORBAR_WIDTH = 410;
const DEFAULT_COLORBAR_SPLIT_POSITION = 80;
export const DEFAULT_COLORBAR_SELECTOR_HEIGHT = 242;
const defaultLayoutSettings = {
  shortScreen: true,
  workspaceLayoutMode: "auto" as WorkspaceLayoutMode,
  savedWorkspaceLayoutId: undefined as string | undefined,
  workspaceLayoutConfiguration: COMPACT_WORKSPACE_LAYOUT_CONFIGURATION,
  setWorkspaceLayoutMode: (
    _mode: WorkspaceLayoutMode,
    _configuration?: WorkspaceLayoutConfiguration,
    _savedLayoutId?: string,
  ) => COMPACT_WORKSPACE_LAYOUT_CONFIGURATION,
  colorbarWidth: DEFAULT_COLORBAR_WIDTH,
  colorbarDeltaScene: 0,
  colorbarSplitPosition: DEFAULT_COLORBAR_SPLIT_POSITION,
  setColorbarWidth: (_value: number | ((current: number) => number)) => {},
  setColorbarSplitPosition: (_value: number | ((current: number) => number)) => {},
};
const EditorLayoutSettingsContext = createContext(defaultLayoutSettings);
const EditorLayoutContext = createContext({ ...editorSceneLayout(), ...defaultLayoutSettings });
const WorkspaceLayoutConfigurationContext = createContext(COMPACT_WORKSPACE_LAYOUT_CONFIGURATION);
export const useWorkspaceLayoutConfiguration = () =>
  useContext(WorkspaceLayoutConfigurationContext);
/** Shared by Aseprite chrome primitives; demos only compose these primitives. */
export function EditorLayoutProvider({
  width,
  height,
  workspaceLayoutSelection,
  workspaceLayoutConfiguration: activeWorkspaceLayoutConfiguration,
  onWorkspaceLayoutModeChange,
  children,
}: {
  width: number;
  height: number;
  workspaceLayoutSelection: WorkspaceLayoutSelection;
  workspaceLayoutConfiguration: WorkspaceLayoutConfiguration;
  onWorkspaceLayoutModeChange: (
    mode: WorkspaceLayoutMode,
    configuration?: WorkspaceLayoutConfiguration,
    savedLayoutId?: string,
  ) => WorkspaceLayoutConfiguration;
  children: ReactNode;
}) {
  const layout = useMemo(() => editorSceneLayout(width, height), [width, height]);
  const sceneBounds = useMemo(
    () => ({
      x: 0,
      y: 0,
      width: Math.floor(width / UI_SCALE_X),
      height: Math.floor(height / UI_SCALE_Y),
    }),
    [width, height],
  );
  const preferences = useEditorLayoutPreferences();
  const [colorbarWidth, setColorbarWidth] = useState(preferences.readColorbarWidth);
  const [colorbarSplitPosition, setColorbarSplitPosition] = useState(
    preferences.readColorbarSplitPosition,
  );
  useEffect(() => {
    const timer = window.setTimeout(() => {
      try {
        preferences.writeColorbarWidth(colorbarWidth);
      } catch {
        // Resizing still works when storage is unavailable.
      }
    }, 200);
    return () => window.clearTimeout(timer);
  }, [colorbarWidth]);
  useEffect(() => {
    const timer = window.setTimeout(() => {
      try {
        preferences.writeColorbarSplitPosition(colorbarSplitPosition);
      } catch {
        // Resizing still works when storage is unavailable.
      }
    }, 200);
    return () => window.clearTimeout(timer);
  }, [colorbarSplitPosition]);
  const shortScreen = isShortEditorHeight(height);
  const settings = useMemo(
    () => ({
      shortScreen,
      workspaceLayoutMode: workspaceLayoutSelection.mode,
      savedWorkspaceLayoutId: workspaceLayoutSelection.savedLayoutId,
      workspaceLayoutConfiguration: activeWorkspaceLayoutConfiguration,
      setWorkspaceLayoutMode: onWorkspaceLayoutModeChange,
      colorbarWidth,
      colorbarSplitPosition,
      colorbarDeltaScene: activeWorkspaceLayoutConfiguration.colorbar.resizeEnabled
        ? Math.round((colorbarWidth - DEFAULT_COLORBAR_WIDTH) / UI_SCALE_X)
        : 0,
      setColorbarWidth,
      setColorbarSplitPosition,
    }),
    [
      shortScreen,
      workspaceLayoutSelection.mode,
      workspaceLayoutSelection.savedLayoutId,
      activeWorkspaceLayoutConfiguration,
      onWorkspaceLayoutModeChange,
      colorbarWidth,
      colorbarSplitPosition,
    ],
  );
  const value = useMemo(() => ({ ...layout, ...settings }), [layout, settings]);
  return (
    <EditorLayoutContext.Provider value={value}>
      <EditorLayoutSettingsContext.Provider value={settings}>
        <WorkspaceLayoutConfigurationContext.Provider value={activeWorkspaceLayoutConfiguration}>
          <SceneBoundsContext.Provider value={sceneBounds}>{children}</SceneBoundsContext.Provider>
        </WorkspaceLayoutConfigurationContext.Provider>
      </EditorLayoutSettingsContext.Provider>
    </EditorLayoutContext.Provider>
  );
}
export const useEditorLayout = () => useContext(EditorLayoutContext);
export const useEditorLayoutSettings = () => useContext(EditorLayoutSettingsContext);
