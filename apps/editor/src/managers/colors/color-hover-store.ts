/** Ephemeral color-selector hover; only the status row subscribes. */
export interface ColorHoverValue {
  hex: string;
  description?: string;
}

export function createColorHoverStore() {
  let color: ColorHoverValue | null = null;
  const listeners = new Set<() => void>();
  return {
    subscribe(listener: () => void) {
      listeners.add(listener);
      return () => {
        listeners.delete(listener);
      };
    },
    getSnapshot: () => color,
    set(next: ColorHoverValue | null) {
      if (next?.hex === color?.hex && next?.description === color?.description) return;
      color = next;
      listeners.forEach((listener) => listener());
    },
  };
}
