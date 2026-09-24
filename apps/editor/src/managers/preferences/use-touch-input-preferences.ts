import { useSyncExternalStore } from "react";

import { DEFAULT_TOUCH_INPUT_PREFERENCES } from "$/managers/preferences/touch-input-preferences";
import { useOptionalEditorRuntimeManagerContext } from "$/managers/workspace/editor-runtime-context";

const subscribeEmpty = () => () => {};
const getDefaults = () => DEFAULT_TOUCH_INPUT_PREFERENCES;

/** Workspace preferences are canonical; components only read a stable snapshot. */
export function useTouchInputPreferences() {
  const runtime = useOptionalEditorRuntimeManagerContext();
  return useSyncExternalStore(
    runtime?.workspace.subscribe ?? subscribeEmpty,
    runtime?.workspace.getTouchInputPreferences ?? getDefaults,
    getDefaults,
  );
}
