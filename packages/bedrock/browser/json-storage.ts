export enum JsonWriteResult {
  Saved = "saved",
  Unchanged = "unchanged",
  Unavailable = "unavailable",
}

export interface JsonStoragePort {
  readJson<T = Record<string, unknown>>(key: string): T | null;
  writeJson(key: string, value: unknown, options?: { force?: boolean }): JsonWriteResult;
}

interface TextStorage {
  getItem(key: string): string | null;
  /** Native Storage returns void; non-throwing adapters can return false on failure. */
  setItem(key: string, value: string): unknown;
}

/** JSON transport and successful-write deduplication; schemas and defaults belong to callers. */
export function createJsonStorage(storage: TextStorage): TextStorage & JsonStoragePort {
  const serialized = new Map<string, string>();
  return {
    ...storage,
    getItem: (key: string) => storage.getItem(key),
    setItem: (key: string, value: string) => {
      const result = storage.setItem(key, value);
      if (result !== false) serialized.delete(key);
      return result;
    },
    readJson<T>(key: string): T | null {
      try {
        const text = storage.getItem(key);
        if (text === null) {
          serialized.delete(key);
          return null;
        }
        const value = JSON.parse(text) as T;
        serialized.set(key, text);
        return value;
      } catch {
        serialized.delete(key);
        return null;
      }
    },
    writeJson(key: string, value: unknown, { force = false } = {}) {
      try {
        const text = JSON.stringify(value);
        if (text === undefined) return JsonWriteResult.Unavailable;
        if (!force && serialized.get(key) === text && storage.getItem(key) === text)
          return JsonWriteResult.Unchanged;
        if (storage.setItem(key, text) === false) {
          return JsonWriteResult.Unavailable;
        }
        serialized.set(key, text);
        return JsonWriteResult.Saved;
      } catch {
        return JsonWriteResult.Unavailable;
      }
    },
  };
}
