import { useStore } from "zustand";

import { useEditorManagerContext } from "$/managers/editor/editor-state-manager";

export function useColorSelectorPreferences() {
  const { uiStore } = useEditorManagerContext();
  return {
    ...useStore(uiStore, (state) => state.colorSelectorPreferences),
    setPreferences: useStore(uiStore, (state) => state.setColorSelectorPreferences),
  };
}
