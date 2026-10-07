import { createContext, useContext, useSyncExternalStore, type ReactNode } from "react";

import type { PwaManager, PwaState } from "$/managers/pwa/pwa-manager";

const PwaContext = createContext<PwaManager | null>(null);
const subscribeUnavailable = (): (() => void) => () => {};
const unavailableState = (): null => null;

export function PwaProvider({ manager, children }: { manager: PwaManager; children: ReactNode }) {
  return <PwaContext.Provider value={manager}>{children}</PwaContext.Provider>;
}

export function usePwaManager(): PwaManager | null {
  return useContext(PwaContext);
}

export function usePwaState(): PwaState | null {
  const manager = usePwaManager();
  return useSyncExternalStore<PwaState | null>(
    manager?.subscribe ?? subscribeUnavailable,
    manager?.getState ?? unavailableState,
    manager?.getState ?? unavailableState,
  );
}
