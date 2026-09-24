/** Selector bridge for an already-derived manager view. Canonical editor models
 * remain in the core; this source publishes only the committed React view. */
export class EditorStateSource<T extends object> {
  private listeners = new Set<() => void>();
  private changed = false;

  constructor(private value: T) {}

  getSnapshot = () => this.value;
  subscribe = (listener: () => void) => {
    this.listeners.add(listener);
    return () => {
      this.listeners.delete(listener);
    };
  };

  setSnapshot(value: T) {
    if (sameEditorFields(this.value, value)) return;
    this.value = value;
    this.changed = true;
  }

  publish() {
    if (!this.changed) return;
    this.changed = false;
    for (const listener of this.listeners) listener();
  }
}

export function sameEditorFields<T extends object>(a: T, b: T): boolean {
  const keys = Object.keys(a) as (keyof T)[];
  return keys.length === Object.keys(b).length && keys.every((key) => Object.is(a[key], b[key]));
}
