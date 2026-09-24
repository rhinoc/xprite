import { useStore } from "zustand";

import { useEditorManagerContext } from "$/managers/editor/editor-state-manager";

/** Workspace geometry is shared across documents and persisted by the UI manager. */
export function usePaletteBoxSizePreference() {
  const { uiStore } = useEditorManagerContext();
  return {
    boxSize: useStore(uiStore, (state) => state.panelLayoutPreferences.paletteBoxSize),
    setBoxSize: useStore(uiStore, (state) => state.setPaletteBoxSize),
  };
}

export function useTimelineLayerColumnWidthPreference() {
  const { uiStore } = useEditorManagerContext();
  return {
    requestedColumnWidth: useStore(
      uiStore,
      (state) => state.panelLayoutPreferences.timelineLayerColumnWidth,
    ),
    setColumnWidth: useStore(uiStore, (state) => state.setTimelineLayerColumnWidth),
    beginResize: useStore(uiStore, (state) => state.beginPanelLayoutResize),
  };
}
