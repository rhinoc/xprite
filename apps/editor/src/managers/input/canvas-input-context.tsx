import { createContext, useContext, type ReactNode } from "react";

import type { CanvasPointerController } from "$/managers/input/controllers/pointer-controller";

const CanvasInputContext = createContext<CanvasPointerController | null>(null);

/** Shares input policy across document canvases without adding DOM or controls. */
export function CanvasInputProvider({
  controller,
  children,
}: {
  controller: CanvasPointerController;
  children: ReactNode;
}) {
  return <CanvasInputContext.Provider value={controller}>{children}</CanvasInputContext.Provider>;
}

export function useCanvasInputController() {
  return useContext(CanvasInputContext);
}
