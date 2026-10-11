import {
  createContext,
  useCallback,
  useContext,
  useEffect,
  useMemo,
  useState,
  type ReactNode,
} from "react";

import { useReferenceLayerCommand } from "$/managers/timeline/reference-layer-command";
export interface LayerCommandActions {
  openReferenceLayer: () => void;
}
interface Registry {
  actions: LayerCommandActions | null;
  register: (value: LayerCommandActions) => () => void;
}
const Context = createContext<Registry | null>(null);
export function LayerCommandActionsProvider({ children }: { children: ReactNode }) {
  const [actions, setActions] = useState<LayerCommandActions | null>(null);
  const register = useCallback((value: LayerCommandActions) => {
    setActions(value);
    return () => setActions((current) => (current === value ? null : current));
  }, []);
  const value = useMemo(() => ({ actions, register }), [actions, register]);
  return <Context.Provider value={value}>{children}</Context.Provider>;
}
export const useLayerCommandActions = () => useContext(Context)?.actions ?? null;
/** Browser file selection stays in the shared feature adapter; the scene only
 * composes it. Decode is checked against the originating document before edit. */
export function LayerCommandHost({
  enabled = true,
  onError,
}: {
  enabled?: boolean;
  onError?: (message: string) => void;
}) {
  const registry = useContext(Context);
  const openReferenceLayer = useReferenceLayerCommand(enabled, onError);
  useEffect(
    () => registry?.register({ openReferenceLayer }),
    [registry?.register, openReferenceLayer],
  );
  return null;
}
