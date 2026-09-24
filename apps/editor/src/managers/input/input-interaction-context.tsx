import { createContext, useContext, useEffect, type ReactNode } from "react";
import { useStore } from "zustand";

import { useEditorManagerContext } from "$/managers/editor/editor-state-manager";

export type InputInteractionMode = "pointer" | "touch";
const InputInteractionContext = createContext<InputInteractionMode>("pointer");

/** The provider owns modifier lifecycle; the manager UI store owns its state. */
export function InputInteractionProvider({
  mode,
  children,
}: {
  mode: InputInteractionMode;
  children: ReactNode;
}) {
  const { core, uiStore } = useEditorManagerContext();
  useEffect(() => {
    const reset = () => uiStore.getState().resetTouchModifiers();
    reset();
    let tool = core?.getSnapshot().settings.tool;
    const unsubscribe = core?.subscribe(() => {
      const next = core.getSnapshot().settings.tool;
      if (next !== tool) {
        tool = next;
        reset();
      }
    });
    return () => {
      unsubscribe?.();
      reset();
    };
  }, [core, uiStore]);
  return (
    <InputInteractionContext.Provider value={mode}>{children}</InputInteractionContext.Provider>
  );
}

export const useInputInteractionMode = () => useContext(InputInteractionContext);

export function useTouchInteractionPreferences() {
  const { uiStore } = useEditorManagerContext();
  const touchConstrain = useStore(uiStore, (state) => state.touchConstrain);
  const touchDuplicate = useStore(uiStore, (state) => state.touchDuplicate);
  const touchFromCenter = useStore(uiStore, (state) => state.touchFromCenter);
  const setTouchConstrain = useStore(uiStore, (state) => state.setTouchConstrain);
  const setTouchDuplicate = useStore(uiStore, (state) => state.setTouchDuplicate);
  const setTouchFromCenter = useStore(uiStore, (state) => state.setTouchFromCenter);
  return {
    touchConstrain,
    touchDuplicate,
    touchFromCenter,
    setTouchConstrain,
    setTouchDuplicate,
    setTouchFromCenter,
  };
}
