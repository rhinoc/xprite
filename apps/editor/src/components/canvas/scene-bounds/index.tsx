import { createContext, useContext } from "react";

import { type SurfaceBounds } from "@xprite/ui";
import { UI_SCALE_X } from "@xprite/ui/canvas";
import { viewportSize } from "@xprite/ui/utils";

/** Available scene extent, independent of the fixed bitmap rendering scale. */
export const SceneBoundsContext = createContext<SurfaceBounds>({
  x: 0,
  y: 0,
  width: typeof window === "undefined" ? 0 : viewportSize(window).width / UI_SCALE_X,
  height: typeof window === "undefined" ? 0 : viewportSize(window).height / UI_SCALE_X,
});
export const useSceneBounds = () => useContext(SceneBoundsContext);
