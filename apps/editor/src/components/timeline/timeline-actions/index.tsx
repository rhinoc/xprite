import { createContext, useCallback, useContext, useMemo, useState, type ReactNode } from "react";

export interface TimelineActionHandlers {
  openLayerPropertiesDialog: () => void;
  openFramePropertiesDialog: (target?: "current" | "all") => void;
  openCelPropertiesDialog?: () => void;
  openSpritePropertiesDialog?: () => void;
  flushPendingLayerProperties?: () => void;
  openTagPropertiesDialog?: (index?: number) => void;
  newTagDialog?: () => void;
  deleteCurrentTag?: () => void;
  openGotoFrameDialog?: () => void;
}

interface TimelineActionRegistry {
  register: (handlers: Partial<TimelineActionHandlers>) => () => void;
  handlers: TimelineActionHandlers | null;
}

const Context = createContext<TimelineActionRegistry | null>(null);

export function TimelineActionsProvider({ children }: { children: ReactNode }) {
  const [registrations, setRegistrations] = useState<
    ReadonlyMap<object, Partial<TimelineActionHandlers>>
  >(new Map());
  const register = useCallback((next: Partial<TimelineActionHandlers>) => {
    const token = {};
    setRegistrations((current) => new Map(current).set(token, next));
    return () =>
      setRegistrations((current) => {
        if (!current.has(token)) return current;
        const updated = new Map(current);
        updated.delete(token);
        return updated;
      });
  }, []);
  const handlers = useMemo(() => {
    if (!registrations.size) return null;
    const merged: TimelineActionHandlers = {
      openLayerPropertiesDialog: () => {},
      openFramePropertiesDialog: () => {},
    };
    for (const registration of registrations.values()) Object.assign(merged, registration);
    return merged;
  }, [registrations]);
  const value = useMemo(() => ({ register, handlers }), [register, handlers]);
  return <Context.Provider value={value}>{children}</Context.Provider>;
}

export function useTimelineActions() {
  return useContext(Context)?.handlers ?? null;
}

export function useRegisterTimelineActions() {
  return useContext(Context)?.register ?? null;
}
