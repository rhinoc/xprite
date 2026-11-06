import { createContext, useCallback, useContext, useEffect, useRef, type ReactNode } from "react";

import type {
  NormalMapProcessingFactory,
  NormalMapProcessingInput,
  NormalMapProcessingPort,
} from "$/managers/ports/normal-map-processing";
import type { NormalMapLightRendererFactory } from "$/managers/ports/normal-map-rendering";

const Context = createContext<NormalMapProcessingFactory | null>(null);
const RenderingContext = createContext<NormalMapLightRendererFactory | null>(null);
export function NormalMapProcessingProvider({
  createProcessor,
  createLightRenderer,
  children,
}: {
  createProcessor: NormalMapProcessingFactory;
  createLightRenderer: NormalMapLightRendererFactory;
  children: ReactNode;
}) {
  return (
    <Context.Provider value={createProcessor}>
      <RenderingContext.Provider value={createLightRenderer}>{children}</RenderingContext.Provider>
    </Context.Provider>
  );
}
export const useNormalMapLightRendererFactory = () => useContext(RenderingContext);
export function useNormalMapProcessor(enabled: boolean) {
  const create = useContext(Context);
  const processor = useRef<NormalMapProcessingPort | null>(null);
  const failure = useRef<unknown>(null);
  useEffect(() => {
    if (!enabled) return;
    try {
      failure.current = null;
      processor.current = create?.() ?? null;
    } catch (error) {
      failure.current = error;
    }
    return () => {
      processor.current?.dispose();
      processor.current = null;
    };
  }, [create, enabled]);
  return useCallback((input: NormalMapProcessingInput) => {
    if (failure.current) return Promise.reject(failure.current);
    return (
      processor.current?.process(input) ??
      Promise.reject(new Error("Normal map processing is unavailable"))
    );
  }, []);
}
