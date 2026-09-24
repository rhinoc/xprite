import { useInsertionEffect, useRef } from "react";

import { sameEditorFields } from "$/managers/editor/editor-state-source";

function sameValue(a: unknown, b: unknown): boolean {
  if (Object.is(a, b)) return true;
  if (Array.isArray(a) || Array.isArray(b))
    return (
      Array.isArray(a) &&
      Array.isArray(b) &&
      a.length === b.length &&
      a.every((item, index) => sameValue(item, b[index]))
    );
  return !!a && !!b && typeof a === "object" && typeof b === "object" && sameEditorFields(a, b);
}

/** Stable UI actions dispatch through the latest committed workflow, including dialog geometry. */
export function useWorkflowActionSnapshot<T extends object>(value: T): T {
  const committed = useRef(value);
  const handlers = useRef(new Map<keyof T, (...args: unknown[]) => unknown>());
  const snapshot = useRef<T | null>(null);
  useInsertionEffect(() => {
    committed.current = value;
  });
  const next = { ...value };
  for (const key of Object.keys(value) as (keyof T)[]) {
    if (typeof value[key] === "function") {
      let handler = handlers.current.get(key);
      if (!handler) {
        handler = (...args) =>
          (committed.current[key] as (...values: unknown[]) => unknown)(...args);
        handlers.current.set(key, handler);
      }
      Object.assign(next, { [key]: handler });
    } else if (snapshot.current && sameValue(snapshot.current[key], value[key])) {
      next[key] = snapshot.current[key];
    }
  }
  if (snapshot.current && sameEditorFields(snapshot.current, next)) return snapshot.current;
  snapshot.current = next;
  return next;
}
