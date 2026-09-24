/** Clone structured data while retaining shared references inside the graph. */
export function cloneGraph<T>(value: T): T {
  return cloneValue(value, new WeakMap<object, unknown>());
}

function cloneValue<T>(value: T, seen: WeakMap<object, unknown>): T {
  if (value === null || typeof value !== "object") return value;
  const object = value as unknown as object;
  const existing = seen.get(object);
  if (existing !== undefined) return existing as T;
  if (value instanceof Uint8ClampedArray) {
    const copy = new Uint8ClampedArray(value);
    seen.set(object, copy);
    return copy as T;
  }
  if (value instanceof Uint8Array) {
    const copy = new Uint8Array(value);
    seen.set(object, copy);
    return copy as T;
  }
  if (value instanceof Uint16Array) {
    const copy = new Uint16Array(value);
    seen.set(object, copy);
    return copy as T;
  }
  if (value instanceof Uint32Array) {
    const copy = new Uint32Array(value);
    seen.set(object, copy);
    return copy as T;
  }
  if (value instanceof Int8Array) {
    const copy = new Int8Array(value);
    seen.set(object, copy);
    return copy as T;
  }
  if (value instanceof Int16Array) {
    const copy = new Int16Array(value);
    seen.set(object, copy);
    return copy as T;
  }
  if (value instanceof Int32Array) {
    const copy = new Int32Array(value);
    seen.set(object, copy);
    return copy as T;
  }
  if (value instanceof Float32Array) {
    const copy = new Float32Array(value);
    seen.set(object, copy);
    return copy as T;
  }
  if (value instanceof Float64Array) {
    const copy = new Float64Array(value);
    seen.set(object, copy);
    return copy as T;
  }
  if (value instanceof ArrayBuffer) {
    const copy = value.slice(0);
    seen.set(object, copy);
    return copy as T;
  }
  if (Array.isArray(value)) {
    const copy: unknown[] = [];
    seen.set(object, copy);
    for (const item of value) copy.push(cloneValue(item, seen));
    return copy as T;
  }
  if (value instanceof Date) return new Date(value.getTime()) as T;
  const copy: Record<string, unknown> = {};
  seen.set(object, copy);
  for (const key of Object.keys(value as Record<string, unknown>))
    copy[key] = cloneValue((value as Record<string, unknown>)[key], seen);
  return copy as T;
}
