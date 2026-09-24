import { createContext, useContext, useSyncExternalStore, type ReactNode } from "react";

import type { EditorChromePreferencesManager } from "$/managers/shell/editor-chrome-preferences";

const EditorChromePreferencesContext = createContext<EditorChromePreferencesManager | null>(null);

export function EditorChromePreferencesProvider({
  manager,
  children,
}: {
  manager: EditorChromePreferencesManager;
  children: ReactNode;
}) {
  return (
    <EditorChromePreferencesContext.Provider value={manager}>
      {children}
    </EditorChromePreferencesContext.Provider>
  );
}

export function useEditorChromePreferences() {
  const manager = useContext(EditorChromePreferencesContext);
  if (!manager) throw new Error("Editor chrome preferences manager is not available");
  const preferences = useSyncExternalStore(
    manager.subscribe,
    manager.getSnapshot,
    manager.getSnapshot,
  );
  return {
    ...preferences,
    setPreferences: manager.setPreferences,
    patchPreferences: manager.patchPreferences,
    previewUiElementScale: manager.previewUiElementScale,
    commitUiElementScale: manager.commitUiElementScale,
    activateWorkspaceLayout: manager.activateWorkspaceLayout,
  };
}
