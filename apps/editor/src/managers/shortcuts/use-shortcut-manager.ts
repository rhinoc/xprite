import { useSyncExternalStore } from "react";

import { useOptionalEditorRuntimeManagerContext } from "$/managers/workspace/editor-runtime-context";

const emptySnapshot = {};
const subscribeEmpty = () => () => {};
const getEmptySnapshot = () => emptySnapshot;

/** Preferences and held-key state belong to the workspace shortcut manager. */
export function useShortcutManager() {
  const manager = useOptionalEditorRuntimeManagerContext()?.workspace.shortcuts ?? null;
  useSyncExternalStore(
    manager?.subscribe ?? subscribeEmpty,
    manager?.getSnapshot ?? getEmptySnapshot,
    manager?.getSnapshot ?? getEmptySnapshot,
  );
  return manager;
}
