import { createContext, useContext, type ReactNode } from "react";

const TooltipDelayContext = createContext<number | undefined>(undefined);

export function TooltipProvider({ delay, children }: { delay: number; children: ReactNode }) {
  return <TooltipDelayContext.Provider value={delay}>{children}</TooltipDelayContext.Provider>;
}

export const useTooltipDelay = () => useContext(TooltipDelayContext);
