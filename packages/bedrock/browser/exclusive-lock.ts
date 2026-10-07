export type ExclusiveOperation = <T>(operation: () => Promise<T>) => Promise<T>;

/** Cross-context exclusion. Absence is explicit so callers do not assume a local
 * promise queue protects data being changed by another browser tab. */
export function createExclusiveLock(name: string): ExclusiveOperation | undefined {
  const locks = typeof navigator === "undefined" ? undefined : navigator.locks;
  if (!locks || typeof locks.request !== "function") return undefined;
  return <T>(operation: () => Promise<T>) => locks.request(name, { mode: "exclusive" }, operation);
}
