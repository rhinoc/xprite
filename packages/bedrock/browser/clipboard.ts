export type ClipboardItemPayload = Record<string, Blob | Promise<Blob>>;

export interface BrowserClipboard {
  canRead(): boolean;
  /** true = image type present; false = readable but no image; null = cannot tell (no API / denied). */
  peekImage(acceptedTypes?: readonly string[]): Promise<boolean | null>;
  read(acceptedTypes?: readonly string[]): Promise<Blob | null>;
  write(item: ClipboardItemPayload): Promise<boolean>;
  clear(): Promise<void>;
}

function accepts(type: string, acceptedTypes: readonly string[]): boolean {
  return acceptedTypes.some((accepted) => {
    if (accepted === "*") return true;
    if (accepted.endsWith("/*")) return type.startsWith(accepted.slice(0, -1));
    return type === accepted;
  });
}

export const browserClipboard: BrowserClipboard = {
  canRead: () => typeof globalThis.navigator?.clipboard?.read === "function",
  async peekImage(acceptedTypes = ["image/png", "image/*"]) {
    const clipboard = globalThis.navigator?.clipboard;
    if (typeof clipboard?.read !== "function") return null;
    try {
      const items = await clipboard.read();
      for (const item of items) {
        if (item.types.some((candidate) => accepts(candidate, acceptedTypes))) return true;
      }
      return false;
    } catch {
      return null;
    }
  },
  async read(acceptedTypes = []) {
    const clipboard = globalThis.navigator?.clipboard;
    if (typeof clipboard?.read !== "function") return null;
    const items = await clipboard.read();
    for (const item of items) {
      const type = item.types.find(
        (candidate) => !acceptedTypes.length || accepts(candidate, acceptedTypes),
      );
      if (type) return item.getType(type);
    }
    return null;
  },
  async write(item) {
    const clipboard = globalThis.navigator?.clipboard;
    if (typeof clipboard?.write !== "function" || typeof ClipboardItem === "undefined")
      return false;
    // Pass promises through ClipboardItem so callers can start encoding without
    // yielding the user-activation stack before navigator.clipboard.write().
    await clipboard.write([new ClipboardItem(item)]);
    return true;
  },
  async clear() {
    const clipboard = globalThis.navigator?.clipboard;
    if (typeof clipboard?.writeText !== "function") throw new Error("Clipboard access unavailable");
    await clipboard.writeText("");
  },
};
