import { createContext, useContext, useEffect, useSyncExternalStore, type ReactNode } from "react";

import { ReplayManager } from "$/managers/replay/replay-manager";

const Context = createContext<ReplayManager | null>(null);
export function ReplayProvider({
  manager,
  children,
}: {
  manager: ReplayManager;
  children: ReactNode;
}) {
  useEffect(() => manager.connect(), [manager]);
  return <Context.Provider value={manager}>{children}</Context.Provider>;
}
function useReplayManager() {
  const manager = useContext(Context);
  if (!manager) throw new Error("Replay requires ReplayProvider");
  return manager;
}
export function useReplay() {
  const manager = useReplayManager();
  const snapshot = useSyncExternalStore(
    manager.subscribe,
    manager.getSnapshot,
    manager.getSnapshot,
  );
  return { manager, snapshot };
}
export function useReplayCommands() {
  const manager = useReplayManager();
  const snapshot = useSyncExternalStore(
    manager.subscribe,
    manager.getCommandSnapshot,
    manager.getCommandSnapshot,
  );
  return { manager, snapshot };
}
export function useReplayMotion() {
  const manager = useReplayManager();
  const motion = useSyncExternalStore(
    manager.subscribeMotion,
    manager.getMotionSnapshot,
    manager.getMotionSnapshot,
  );
  return { manager, motion };
}

export type { ReplayCursorPresentation } from "$/managers/ports/replay";
