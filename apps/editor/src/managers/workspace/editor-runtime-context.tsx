import { createContext, useContext, useMemo, type ReactNode } from "react";
import type { StoreApi } from "zustand/vanilla";

import type { EditorUiState } from "$/managers/editor/editor-ui-store";
import type { DocumentSlot, DocumentWorkspace } from "$/managers/workspace/document-workspace";

export interface EditorRuntimeManagerContextValue {
  workspace: DocumentWorkspace;
  active: DocumentSlot;
  uiStore: StoreApi<EditorUiState>;
}

const EditorRuntimeManagerContext = createContext<EditorRuntimeManagerContextValue | null>(null);

/** Keeps workspace handles available to manager hooks without exposing them to UI components. */
export function EditorRuntimeManagerProvider({
  value,
  children,
}: {
  value: EditorRuntimeManagerContextValue;
  children: ReactNode;
}) {
  const handles = useMemo(
    () => ({ workspace: value.workspace, active: value.active, uiStore: value.uiStore }),
    [value.workspace, value.active, value.uiStore],
  );
  return (
    <EditorRuntimeManagerContext.Provider value={handles}>
      {children}
    </EditorRuntimeManagerContext.Provider>
  );
}

export function useEditorRuntimeManagerContext() {
  const value = useContext(EditorRuntimeManagerContext);
  if (!value) throw new Error("Workspace manager hooks require EditorRuntimeManagerProvider");
  return value;
}

export function useOptionalEditorRuntimeManagerContext() {
  return useContext(EditorRuntimeManagerContext);
}
