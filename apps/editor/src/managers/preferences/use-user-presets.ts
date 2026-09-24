import { useEffect, useState, useSyncExternalStore } from "react";

import {
  UserPresetsManager,
  restoreUserShade,
  type UserShadeEntry,
} from "$/managers/preferences/user-presets";
import { useOptionalEditorRuntimeManagerContext } from "$/managers/workspace/editor-runtime-context";

export function useUserPresets() {
  const runtime = useOptionalEditorRuntimeManagerContext();
  const [preview] = useState(() => new UserPresetsManager());
  const manager = runtime?.workspace.userPresets ?? preview;
  const snapshot = useSyncExternalStore(
    manager.subscribe,
    manager.getSnapshot,
    manager.getSnapshot,
  );
  useEffect(() => {
    void manager.initialize();
  }, [manager]);
  return {
    manager,
    ...snapshot,
    restoreShade: (entries: readonly UserShadeEntry[]) =>
      restoreUserShade(entries, runtime?.active.core.getSnapshot().palette),
  };
}
