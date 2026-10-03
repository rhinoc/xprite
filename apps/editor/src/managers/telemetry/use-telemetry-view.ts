import { useEffect } from "react";
import { useStore } from "zustand";

import { useEditorManagerContext } from "$/managers/editor/editor-state-manager";
import { editorViewForState } from "$/managers/editor/editor-ui-store";
import { useTelemetry } from "$/managers/telemetry/telemetry-context";

/** Observe committed views rather than clicks or intermediate workflow updates. */
export function useTelemetryView(): void {
  const { uiStore } = useEditorManagerContext();
  const telemetry = useTelemetry();
  const view = useStore(uiStore, editorViewForState);
  const transition = useStore(uiStore, (state) => state.viewTransition);
  useEffect(() => {
    if (!telemetry.enabled) return;
    let active = true;
    // Allow the parent startup fallback and workflow effects to settle first.
    void Promise.resolve().then(() => {
      if (!active) return;
      const current = uiStore.getState();
      if (editorViewForState(current) !== view || current.viewTransition !== transition) return;
      telemetry.viewChanged(view, transition);
    });
    return () => {
      active = false;
    };
  }, [telemetry, uiStore, view, transition]);
}
