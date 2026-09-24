import { useState } from "react";

import { EffectDialogPreferences } from "$/managers/preferences/effect-dialog-preferences";
import { useOptionalEditorRuntimeManagerContext } from "$/managers/workspace/editor-runtime-context";

export function useEffectDialogPreferences() {
  const runtime = useOptionalEditorRuntimeManagerContext();
  const [preview] = useState(() => new EffectDialogPreferences());
  return runtime?.workspace.effectPreferences ?? preview;
}
