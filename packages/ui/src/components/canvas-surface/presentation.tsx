import { createContext, useContext, useEffect, useMemo, useState, type ReactNode } from "react";

import { displayPixelRatio } from "$/base/utils/dom-geometry";

const PresentationScaleContext = createContext({
  scale: 1,
  offsetX: 0,
  offsetY: 0,
  pixelRatio: 1,
  observesPixels: false,
});
/** Notify painters when presentation scale, physical pixel density or layer alignment changes. */
interface CanvasScaleProviderProps {
  scale?: number;
  pixelOffset?: { x: number; y: number };
  children: ReactNode;
}
export function CanvasScaleProvider({ scale, pixelOffset, children }: CanvasScaleProviderProps) {
  const parent = useContext(PresentationScaleContext);
  const [pixelRatio, setPixelRatio] = useState(() =>
    typeof window === "undefined" ? 1 : displayPixelRatio(window) || 1,
  );
  useEffect(() => {
    if (parent.observesPixels) return;
    let query: MediaQueryList | undefined;
    const update = () => {
      query?.removeEventListener("change", update);
      const ratio = displayPixelRatio(window) || 1;
      setPixelRatio(ratio);
      query = window.matchMedia(`(resolution: ${ratio}dppx)`);
      query.addEventListener("change", update);
    };
    update();
    window.addEventListener("resize", update);
    return () => {
      query?.removeEventListener("change", update);
      window.removeEventListener("resize", update);
    };
  }, [parent.observesPixels]);
  const x = pixelOffset?.x ?? 0;
  const y = pixelOffset?.y ?? 0;
  const value = useMemo(
    () => ({
      scale: scale ?? parent.scale,
      offsetX: parent.offsetX + x,
      offsetY: parent.offsetY + y,
      pixelRatio: parent.observesPixels ? parent.pixelRatio : pixelRatio,
      observesPixels: true,
    }),
    [parent, scale, x, y, pixelRatio],
  );
  return (
    <PresentationScaleContext.Provider value={value}>{children}</PresentationScaleContext.Provider>
  );
}
export const usePresentationMetrics = () => useContext(PresentationScaleContext);
export const useCanvasScale = () => usePresentationMetrics().scale;
