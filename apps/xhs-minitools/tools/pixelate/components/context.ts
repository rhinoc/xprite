import { createContext, useContext } from "react";

import { TextContext } from "$/shared/ui/controls";
import type { MiniToolRenderer } from "$/tools/pixelate/managers/ports";
import type { MiniToolText } from "$/tools/pixelate/managers/text";

export const RendererContext = createContext<MiniToolRenderer | null>(null);

/** The app provides the pixelate text, which covers the shared keys and its own. */
export const useText = () => useContext(TextContext) as MiniToolText;

export function useRenderer(): MiniToolRenderer {
  const renderer = useContext(RendererContext);
  if (!renderer) throw new Error("The mini tool renderer is missing.");
  return renderer;
}
