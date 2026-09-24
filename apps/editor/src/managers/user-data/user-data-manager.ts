import { useCallback, useEffect, useState } from "react";

import { UserDataVisibilityScope } from "$/managers/preferences/user-data-preferences";
import { useEditorRuntimeManagerContext } from "$/managers/workspace/editor-runtime-context";
import type { AsepriteUserData } from "@xprite/editor-core";

export type { AsepriteUserData } from "@xprite/editor-core";
export { UserDataVisibilityScope } from "$/managers/preferences/user-data-preferences";

export function useUserDataVisibility(scope: UserDataVisibilityScope) {
  const { workspace } = useEditorRuntimeManagerContext();
  const [visible, setVisible] = useState(() => workspace.getUserDataVisibility(scope));
  useEffect(() => setVisible(workspace.getUserDataVisibility(scope)), [scope, workspace]);
  const updateVisibility = useCallback(
    (next: boolean) => {
      workspace.setUserDataVisibility(scope, next);
      setVisible(next);
    },
    [scope, workspace],
  );
  return [visible, updateVisibility] as const;
}

/** Replace the native User Data text and color while preserving extension metadata. */
export function updateUserDataFields(
  data: AsepriteUserData | null | undefined,
  text: string,
  color: readonly [number, number, number, number],
): AsepriteUserData | undefined {
  const next: AsepriteUserData = { ...data };
  if (text.length > 0) next.text = text;
  else delete next.text;
  if (color[3] > 0) next.color = [...color] as [number, number, number, number];
  else delete next.color;
  return next.text !== undefined || next.color !== undefined || next.properties !== undefined
    ? next
    : undefined;
}
