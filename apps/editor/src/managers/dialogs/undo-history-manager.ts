import { useCallback, useSyncExternalStore } from "react";

import { useEditorManagerContext } from "$/managers/editor/editor-state-manager";

const emptyHistory = {
  states: [] as readonly { index: number; label: string; saved?: boolean; current?: boolean }[],
  currentIndex: -1,
  initialSaved: false,
};
const emptySubscribe = () => () => {};

export interface UndoHistoryView {
  states: readonly { index: number; label: string; saved?: boolean; current?: boolean }[];
  currentIndex: number;
  initialSaved: boolean;
}

export function useUndoHistoryManager(): {
  history: UndoHistoryView;
  moveToState(index: number): void;
} {
  const { core } = useEditorManagerContext();
  const get = useCallback(() => core?.history.getSnapshot() ?? emptyHistory, [core]);
  const history = useSyncExternalStore(core?.subscribe ?? emptySubscribe, get, get);
  return {
    history,
    moveToState: (index) => core?.history.moveToState(index),
  };
}
