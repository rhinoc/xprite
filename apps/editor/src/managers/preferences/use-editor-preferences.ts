import { useSyncExternalStore } from "react";

import { useEditorRuntimeManagerContext } from "$/managers/workspace/editor-runtime-context";

export function useEditorPreferences() {
  const { workspace } = useEditorRuntimeManagerContext();
  return useSyncExternalStore(
    workspace.subscribe,
    workspace.getEditorPreferences,
    workspace.getEditorPreferences,
  );
}
