export interface LocalStoragePort {
  getItem(key: string): string | null;
  setItem(key: string, value: string): void;
  removeItem(key: string): void;
}

/** Access to browser storage can throw in restricted or privacy modes. */
export function optionalLocalStorage(): Storage | undefined {
  try {
    return globalThis.localStorage;
  } catch {
    return undefined;
  }
}

export function readLocalStorage(key: string): string | null {
  try {
    return optionalLocalStorage()?.getItem(key) ?? null;
  } catch {
    return null;
  }
}

export function writeLocalStorage(key: string, value: string): boolean {
  const storage = optionalLocalStorage();
  if (!storage) return false;
  try {
    storage.setItem(key, value);
    return true;
  } catch {
    return false;
  }
}

export function removeLocalStorage(key: string): boolean {
  const storage = optionalLocalStorage();
  if (!storage) return false;
  try {
    storage.removeItem(key);
    return true;
  } catch {
    return false;
  }
}

/** Non-throwing Storage-compatible facade for app preference services. */
export const browserLocalStorage: LocalStoragePort = {
  getItem: readLocalStorage,
  setItem: (key, value) => {
    writeLocalStorage(key, value);
  },
  removeItem: (key) => {
    removeLocalStorage(key);
  },
};
