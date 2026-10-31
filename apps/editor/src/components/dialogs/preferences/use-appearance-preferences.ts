import { useCallback, useEffect, useRef } from "react";

import {
  beginAppearancePreferences,
  updateAppearancePreferences,
  type AppearancePreferencesAction,
  type AppearancePreferencesTransaction,
} from "$/managers/preferences/appearance-preferences";
import type { AppearanceMode, AppearanceTheme } from "@xprite/editor-ui/appearance";

/** The appearance mode and the theme preview together and commit together. */
export interface AppearanceSelection {
  mode: AppearanceMode;
  theme: AppearanceTheme;
}
export interface AppearancePreferencesBindings {
  open: boolean;
  value: AppearanceSelection;
  onValueChange: (value: AppearanceSelection) => void;
  onOpenChange: (open: boolean) => void;
  onApply?: () => void;
  onAccept?: () => void;
  onCancel?: () => void;
}
/** Shared adapter for the editor and web components; transaction rules stay in the pure core. */
export function useAppearancePreferences(bindings: AppearancePreferencesBindings) {
  const latest = useRef(bindings);
  latest.current = bindings;
  const transaction = useRef<AppearancePreferencesTransaction<AppearanceSelection> | null>(null);
  useEffect(() => {
    if (bindings.open) transaction.current = beginAppearancePreferences(latest.current.value);
    else if (transaction.current) {
      latest.current.onValueChange(transaction.current.committed);
      transaction.current = null;
    }
  }, [bindings.open]);
  useEffect(
    () => () => {
      if (transaction.current) latest.current.onValueChange(transaction.current.committed);
    },
    [],
  );
  const dispatch = useCallback((action: AppearancePreferencesAction<AppearanceSelection>) => {
    const props = latest.current;
    if (!props.open) return;
    const state = transaction.current ?? beginAppearancePreferences(props.value);
    const next = updateAppearancePreferences(state, action);
    transaction.current = next.open ? next : null;
    props.onValueChange(next.current);
    if (action.type === "apply") props.onApply?.();
    if (action.type === "accept") props.onAccept?.();
    if (action.type === "cancel") props.onCancel?.();
    if (!next.open) props.onOpenChange(false);
  }, []);
  return {
    preview: (value: AppearanceSelection) => dispatch({ type: "preview", mode: value }),
    apply: () => dispatch({ type: "apply" }),
    accept: () => dispatch({ type: "accept" }),
    cancel: () => dispatch({ type: "cancel" }),
  };
}
