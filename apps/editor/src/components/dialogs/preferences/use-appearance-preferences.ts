import { useCallback, useEffect, useRef } from "react";

import {
  beginAppearancePreferences,
  updateAppearancePreferences,
  type AppearancePreferencesAction,
  type AppearancePreferencesTransaction,
} from "$/managers/preferences/appearance-preferences";
import type { AppearanceMode } from "@xprite/editor-ui/appearance";
export interface AppearancePreferencesBindings {
  open: boolean;
  mode: AppearanceMode;
  onModeChange: (mode: AppearanceMode) => void;
  onOpenChange: (open: boolean) => void;
  onApply?: () => void;
  onAccept?: () => void;
  onCancel?: () => void;
}
/** Shared adapter for the editor and gallery; transaction rules stay in the pure core. */
export function useAppearancePreferences(bindings: AppearancePreferencesBindings) {
  const latest = useRef(bindings);
  latest.current = bindings;
  const transaction = useRef<AppearancePreferencesTransaction | null>(null);
  useEffect(() => {
    if (bindings.open) transaction.current = beginAppearancePreferences(latest.current.mode);
    else if (transaction.current) {
      latest.current.onModeChange(transaction.current.committed);
      transaction.current = null;
    }
  }, [bindings.open]);
  useEffect(
    () => () => {
      if (transaction.current) latest.current.onModeChange(transaction.current.committed);
    },
    [],
  );
  const dispatch = useCallback((action: AppearancePreferencesAction) => {
    const props = latest.current;
    if (!props.open) return;
    const state = transaction.current ?? beginAppearancePreferences(props.mode);
    const next = updateAppearancePreferences(state, action);
    transaction.current = next.open ? next : null;
    props.onModeChange(next.current);
    if (action.type === "apply") props.onApply?.();
    if (action.type === "accept") props.onAccept?.();
    if (action.type === "cancel") props.onCancel?.();
    if (!next.open) props.onOpenChange(false);
  }, []);
  return {
    preview: (mode: AppearanceMode) => dispatch({ type: "preview", mode }),
    apply: () => dispatch({ type: "apply" }),
    accept: () => dispatch({ type: "accept" }),
    cancel: () => dispatch({ type: "cancel" }),
  };
}
