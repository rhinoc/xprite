import type * as React from "react";

import {
  surfaceLayout,
  type SurfaceBounds,
  type SurfaceViewport,
} from "$/components/canvas-surface";
import type { Placement } from "$/components/slider/types";

export function position(
  bounds: SurfaceBounds,
  relativeTo: Placement["relativeTo"],
  viewport: SurfaceViewport,
  positioned: boolean,
): React.CSSProperties {
  const layout = surfaceLayout(bounds, viewport);
  return {
    position: positioned ? "absolute" : "relative",
    ...(positioned
      ? {
          left:
            layout.left - Math.floor(((relativeTo?.x ?? 0) * viewport.width) / viewport.sceneWidth),
          top:
            layout.top -
            Math.floor(((relativeTo?.y ?? 0) * viewport.height) / viewport.sceneHeight),
        }
      : {}),
    width: layout.width,
    height: layout.height,
    outline: "none",
    touchAction: "none",
    userSelect: "none",
  };
}
