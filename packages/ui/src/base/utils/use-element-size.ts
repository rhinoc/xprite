import { useEffect, useLayoutEffect, useState, type RefObject } from "react";

import { layoutSize, observeResize } from "$/base/utils/dom-geometry";

const useClientLayoutEffect = typeof window === "undefined" ? useEffect : useLayoutEffect;

/** Observe layout units; presentation zoom and DPR do not change this measurement. */
export function useElementSize<T extends HTMLElement>(
  ref: RefObject<T | null>,
  { retainPositiveSize = false }: { retainPositiveSize?: boolean } = {},
) {
  const [size, setSize] = useState({ width: 0, height: 0, ready: false });
  useClientLayoutEffect(() => {
    const node = ref.current;
    if (!node) return;
    const measure = () => {
      const { width, height } = layoutSize(node);
      if (retainPositiveSize && (width <= 0 || height <= 0)) return;
      setSize((current) =>
        current.ready && current.width === width && current.height === height
          ? current
          : { width, height, ready: true },
      );
    };
    measure();
    return observeResize([node], measure);
  }, [ref, retainPositiveSize]);
  return size;
}
