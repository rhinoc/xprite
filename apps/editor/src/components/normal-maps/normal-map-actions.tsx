import {
  createContext,
  Suspense,
  useCallback,
  useContext,
  useEffect,
  useMemo,
  useRef,
  useState,
  type ReactNode,
} from "react";

import { lazyChunk } from "$/components/shared/lazy-chunk";
import { useNormalMapManager } from "$/managers/normal-maps/normal-map-manager";

const GenerationDialog = lazyChunk(() =>
  import("$/components/normal-maps/normal-map-generation-dialog").then((module) => ({
    default: module.NormalMapGenerationDialog,
  })),
);
const LightingPreview = lazyChunk(() =>
  import("$/components/normal-maps/normal-map-lighting-preview").then((module) => ({
    default: module.NormalMapLightingPreview,
  })),
);
interface Actions {
  openGeneration(): void;
  openMaskGeneration(): void;
  openLighting(): void;
  canOpen: boolean;
}
interface Registry {
  actions: Actions | null;
  register(actions: Actions): () => void;
}
const Context = createContext<Registry | null>(null);
export function NormalMapActionsProvider({ children }: { children: ReactNode }) {
  const [actions, setActions] = useState<Actions | null>(null);
  const register = useCallback((next: Actions) => {
    setActions(next);
    return () => setActions((current) => (current === next ? null : current));
  }, []);
  const value = useMemo(() => ({ actions, register }), [actions, register]);
  return <Context.Provider value={value}>{children}</Context.Provider>;
}
export const useNormalMapActions = () => useContext(Context)?.actions ?? null;
export function NormalMapDialogsHost({ enabled }: { enabled: boolean }) {
  const registry = useContext(Context);
  const manager = useNormalMapManager(enabled);
  const latest = useRef(manager);
  latest.current = manager;
  useEffect(
    () =>
      registry?.register({
        openGeneration: () => latest.current.openGeneration(),
        openMaskGeneration: () => latest.current.openGeneration(true),
        openLighting: () => latest.current.openLighting(),
        canOpen: manager.canOpen,
      }),
    [registry?.register, manager.canOpen],
  );
  return (
    <Suspense fallback={null}>
      {manager.lightingOpen && <LightingPreview manager={manager} />}
      {manager.generationOpen && <GenerationDialog manager={manager} />}
    </Suspense>
  );
}
