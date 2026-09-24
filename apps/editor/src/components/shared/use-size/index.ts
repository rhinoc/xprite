import { useLayoutEffect, useState, type RefObject } from "react";

import { layoutSize, observeResize } from "@xprite/ui/utils";

/** Measure only the layout box. Browser zoom / DPR affect raster backing, not layout. */
export function useElementSize<T extends HTMLElement>(ref: RefObject<T | null>) {
  const [size, setSize] = useState({ width: 0, height: 0 });
  useLayoutEffect(() => {
    const node = ref.current;
    if (!node) return;
    const measure = () => {
      const width = layoutSize(node).width,
        height = layoutSize(node).height;
      setSize((old) => (old.width === width && old.height === height ? old : { width, height }));
    };
    measure();
    const observer = observeResize([node], measure);

    return () => observer();
  }, [ref]);
  return size;
}
