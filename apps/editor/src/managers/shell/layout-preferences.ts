import { useMemo } from "react";

import { useEditorPlatformPorts } from "$/managers/platform/editor-platform-context";
import {
  validWorkspacePanelLayout,
  MAX_WORKSPACE_PANEL_LAYOUT_NAME_LENGTH,
  parseWorkspaceLayoutConfiguration,
  type SavedWorkspacePanelLayout,
  type WorkspacePanelLayout,
  type WorkspacePanelArrangement,
  type WorkspaceLayoutMode,
  type WorkspaceLayoutSelection,
} from "$/managers/workspace/workspace-panel-layout";

const DEFAULT_COLORBAR_WIDTH = 154;
const MIN_COLORBAR_WIDTH = 110;
const MAX_COLORBAR_WIDTH = 410;
const DEFAULT_COLORBAR_SPLIT_POSITION = 80;
const COLORBAR_WIDTH_KEY = "xse.layout.colorbar-width.v2";
const COLORBAR_SPLIT_POSITION_KEY = "xse.layout.colorbar-split-position.v1";
const WORKSPACE_LAYOUTS_KEY = "xse.layout.workspace-panels.v5";
const WORKSPACE_LAYOUT_SELECTION_KEY = "xse.layout.workspace-panel-selection.v3";
const SAVED_WORKSPACE_LAYOUTS_KEY = "xse.layout.saved-workspace-panels.v3";

const clamp = (value: number, low: number, high: number) => Math.max(low, Math.min(high, value));
const workspaceLayoutMode = (value: unknown): WorkspaceLayoutMode | null =>
  value === "auto" || value === "saved" || value === "compact" || value === "wide" ? value : null;

export function useEditorLayoutPreferences() {
  const storage = useEditorPlatformPorts()?.preferences;
  const readNumber = (key: string, fallback: number, min: number, max: number) => {
    if (!storage) return fallback;
    try {
      const stored = storage.getItem(key);
      if (stored === null) return fallback;
      const value = Number(stored);
      return Number.isFinite(value) ? Math.round(clamp(value, min, max)) : fallback;
    } catch {
      return fallback;
    }
  };
  const writeNumber = (key: string, value: number) => {
    try {
      storage?.setItem(key, String(value));
    } catch {
      // Layout remains usable when browser storage is unavailable.
    }
  };
  return useMemo(
    () => ({
      readColorbarWidth: () =>
        readNumber(
          COLORBAR_WIDTH_KEY,
          DEFAULT_COLORBAR_WIDTH,
          MIN_COLORBAR_WIDTH,
          MAX_COLORBAR_WIDTH,
        ),
      readColorbarSplitPosition: () =>
        readNumber(COLORBAR_SPLIT_POSITION_KEY, DEFAULT_COLORBAR_SPLIT_POSITION, 0, 100),
      writeColorbarWidth: (value: number) => writeNumber(COLORBAR_WIDTH_KEY, value),
      writeColorbarSplitPosition: (value: number) =>
        writeNumber(COLORBAR_SPLIT_POSITION_KEY, value),
      readWorkspacePanelLayoutSelection(): WorkspaceLayoutSelection {
        try {
          const saved = JSON.parse(storage?.getItem(WORKSPACE_LAYOUT_SELECTION_KEY) ?? "null");
          if (saved && typeof saved === "object") {
            const mode = workspaceLayoutMode(saved.mode);
            const configuration =
              mode === "saved" ? parseWorkspaceLayoutConfiguration(saved.configuration) : undefined;
            const savedLayoutId =
              mode === "saved" && typeof saved.savedLayoutId === "string"
                ? saved.savedLayoutId
                : undefined;
            if (mode && (mode !== "saved" || (savedLayoutId && configuration)))
              return {
                mode,
                ...(savedLayoutId ? { savedLayoutId } : {}),
                ...(configuration ? { configuration } : {}),
              };
          }
        } catch {
          // Start in automatic mode when there is no usable selection.
        }
        return { mode: "auto" };
      },
      writeWorkspacePanelLayoutSelection(value: WorkspaceLayoutSelection) {
        try {
          storage?.setItem(WORKSPACE_LAYOUT_SELECTION_KEY, JSON.stringify(value));
        } catch {
          // The current layout remains available for this session.
        }
      },
      readWorkspacePanelLayout(
        arrangement: WorkspacePanelArrangement,
        fallback: WorkspacePanelLayout,
      ): WorkspacePanelLayout {
        try {
          const saved = JSON.parse(storage?.getItem(WORKSPACE_LAYOUTS_KEY) ?? "null");
          if (
            saved &&
            typeof saved === "object" &&
            !Array.isArray(saved) &&
            validWorkspacePanelLayout(saved[arrangement])
          )
            return saved[arrangement];
        } catch {
          // Fall back to the current default arrangement.
        }
        return fallback;
      },
      writeWorkspacePanelLayout(
        arrangement: WorkspacePanelArrangement,
        value: WorkspacePanelLayout,
      ) {
        try {
          const saved = JSON.parse(storage?.getItem(WORKSPACE_LAYOUTS_KEY) ?? "null");
          const layouts: Partial<Record<WorkspacePanelArrangement, WorkspacePanelLayout>> = {};
          if (saved && typeof saved === "object" && !Array.isArray(saved)) {
            if (validWorkspacePanelLayout(saved.stacked)) layouts.stacked = saved.stacked;
            if (validWorkspacePanelLayout(saved.docked)) layouts.docked = saved.docked;
          }
          layouts[arrangement] = value;
          storage?.setItem(WORKSPACE_LAYOUTS_KEY, JSON.stringify(layouts));
        } catch {
          // The current layout remains available for this session.
        }
      },
      readSavedWorkspacePanelLayouts(): SavedWorkspacePanelLayout[] {
        try {
          const saved = JSON.parse(storage?.getItem(SAVED_WORKSPACE_LAYOUTS_KEY) ?? "[]");
          if (!Array.isArray(saved)) return [];
          const ids = new Set<string>();
          const names = new Set<string>();
          return saved.flatMap((candidate): SavedWorkspacePanelLayout[] => {
            if (!candidate || typeof candidate !== "object") return [];
            const layout = candidate as Record<string, unknown>;
            if (
              typeof layout.id !== "string" ||
              !layout.id ||
              ids.has(layout.id) ||
              typeof layout.name !== "string" ||
              !layout.name.trim() ||
              layout.name.trim().length > MAX_WORKSPACE_PANEL_LAYOUT_NAME_LENGTH ||
              !validWorkspacePanelLayout(layout.layout)
            )
              return [];
            const configuration = parseWorkspaceLayoutConfiguration(layout.configuration);
            if (!configuration) return [];
            const normalizedName = layout.name.trim().toLowerCase();
            if (names.has(normalizedName)) return [];
            ids.add(layout.id);
            names.add(normalizedName);
            return [
              {
                id: layout.id,
                name: layout.name,
                layout: layout.layout,
                configuration,
              },
            ];
          });
        } catch {
          return [];
        }
      },
      writeSavedWorkspacePanelLayouts(value: readonly SavedWorkspacePanelLayout[]) {
        try {
          storage?.setItem(SAVED_WORKSPACE_LAYOUTS_KEY, JSON.stringify(value));
        } catch {
          // Saved layouts remain available for this session when browser storage is unavailable.
        }
      },
    }),
    [storage],
  );
}
