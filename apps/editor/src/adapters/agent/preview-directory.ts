import { IndexedDbDatabase } from "@xprite/bedrock/browser/indexeddb";

interface DirectoryHandlePermission {
  queryPermission(options: { mode: "read" | "readwrite" }): Promise<PermissionState>;
  requestPermission(options: { mode: "read" | "readwrite" }): Promise<PermissionState>;
}

export interface PreviewDirectoryHandle extends DirectoryHandlePermission {
  readonly name: string;
  getFileHandle(
    name: string,
    options: { create: true },
  ): Promise<{
    createWritable(): Promise<{ write(data: Uint8Array): Promise<void>; close(): Promise<void> }>;
  }>;
}

interface DirectoryPicker {
  showDirectoryPicker(options?: { mode?: "read" | "readwrite" }): Promise<PreviewDirectoryHandle>;
}

const STORE = "xse.agent-preview-directory.v1";
const KEY = "preview-directory";
const DATABASE = "xse.idb.agent-preview.v1";

interface StoredHandle {
  key: string;
  handle: PreviewDirectoryHandle;
}

let shared: AgentPreviewDirectory | undefined;

/** Browser-wide instance shared by the agent tools port and platform ports. */
export function sharedAgentPreviewDirectory(): AgentPreviewDirectory {
  return (shared ??= new AgentPreviewDirectory());
}

/**
 * The user-granted preview directory handle. Persisted in IndexedDB so a
 * one-time grant keeps working across sessions while permission lasts.
 */
export class AgentPreviewDirectory {
  private readonly database = new IndexedDbDatabase({
    databaseName: DATABASE,
    version: 1,
    stores: [{ name: STORE, options: { keyPath: "key" } }],
  });

  private get picker(): DirectoryPicker["showDirectoryPicker"] | undefined {
    return (globalThis as Partial<DirectoryPicker>).showDirectoryPicker;
  }

  get supported(): boolean {
    return typeof this.picker === "function";
  }

  async load(): Promise<PreviewDirectoryHandle | null> {
    try {
      const database = await this.database.open();
      return await new Promise((resolve) => {
        const transaction = database.transaction(STORE, "readonly");
        const request = transaction.objectStore(STORE).get(KEY);
        transaction.oncomplete = () =>
          resolve((request.result as StoredHandle | undefined)?.handle ?? null);
        transaction.onerror = () => resolve(null);
        transaction.onabort = () => resolve(null);
      });
    } catch {
      return null;
    }
  }

  /** Returns a handle with readwrite permission, or null. Called from a user gesture. */
  async connect(): Promise<PreviewDirectoryHandle | null> {
    const picker = this.picker;
    if (!picker) return null;
    try {
      const existing = await this.load();
      if (existing && (await existing.requestPermission({ mode: "readwrite" })) === "granted")
        return existing;
      const handle = await picker({ mode: "readwrite" });
      if ((await handle.requestPermission({ mode: "readwrite" })) !== "granted") return null;
      const database = await this.database.open();
      await new Promise<void>((resolve, reject) => {
        const transaction = database.transaction(STORE, "readwrite");
        transaction.objectStore(STORE).put({ key: KEY, handle } satisfies StoredHandle);
        transaction.oncomplete = () => resolve();
        transaction.onerror = () => reject(transaction.error);
        transaction.onabort = () => reject(transaction.error);
      });
      return handle;
    } catch {
      return null;
    }
  }

  async disconnect(): Promise<void> {
    try {
      const database = await this.database.open();
      await new Promise<void>((resolve, reject) => {
        const transaction = database.transaction(STORE, "readwrite");
        transaction.objectStore(STORE).delete(KEY);
        transaction.oncomplete = () => resolve();
        transaction.onerror = () => reject(transaction.error);
        transaction.onabort = () => reject(transaction.error);
      });
    } catch {
      // Nothing persisted; already disconnected.
    }
  }

  /** A usable handle, or null when permission is gone or none was granted. */
  async granted(): Promise<PreviewDirectoryHandle | null> {
    const handle = await this.load();
    if (!handle) return null;
    try {
      return (await handle.queryPermission({ mode: "readwrite" })) === "granted" ? handle : null;
    } catch {
      return null;
    }
  }
}
