import { assertPixelBuffer } from "@xprite/editor-core";
import type { SessionProject, SessionRecentImage } from "@xprite/editor-core/session";
export interface IndexedDbRecentImagesOptions {
  databaseName?: string;
  factory?: IDBFactory;
}
interface StoredRecentImage {
  id: string;
  name: string;
  width: number;
  height: number;
  rgba: ArrayBuffer;
  order: number;
  project?: SessionProject;
}

const STORE = "xse.recents.images.v1";
export const DEFAULT_RECENT_DATABASE_NAME = "xse.idb.recents.v1";
/** Application-owned durable RGBA snapshots. Every operation closes its connection;
 * writes replace only this store atomically and never clear another database. */
export class IndexedDbRecentImages {
  readonly databaseName: string;
  private readonly factory: IDBFactory | undefined;
  private writes: Promise<void> = Promise.resolve();
  constructor(options: IndexedDbRecentImagesOptions = {}) {
    this.databaseName = options.databaseName ?? DEFAULT_RECENT_DATABASE_NAME;
    this.factory = options.factory ?? (typeof indexedDB === "undefined" ? undefined : indexedDB);
  }
  private open(): Promise<IDBDatabase> {
    return new Promise((resolve, reject) => {
      if (!this.factory) {
        reject(new Error("IndexedDB is unavailable; recent files cannot persist in this browser."));
        return;
      }
      let abandoned = false;
      const request = this.factory.open(this.databaseName, 1);
      request.onupgradeneeded = () => {
        const db = request.result;
        if (!db.objectStoreNames.contains(STORE)) db.createObjectStore(STORE, { keyPath: "id" });
      };
      request.onerror = () =>
        reject(request.error ?? new Error("Cannot open recent-file storage."));
      request.onblocked = () => {
        abandoned = true;
        reject(new Error("Recent-file storage is blocked by another open browser tab."));
      };
      request.onsuccess = () => {
        if (abandoned) request.result.close();
        else resolve(request.result);
      };
    });
  }
  async load(): Promise<readonly SessionRecentImage[]> {
    const db = await this.open();
    try {
      const records = await new Promise<StoredRecentImage[]>((resolve, reject) => {
        const tx = db.transaction(STORE, "readonly"),
          request = tx.objectStore(STORE).getAll();
        let result: StoredRecentImage[] = [];
        request.onsuccess = () => {
          result = request.result as StoredRecentImage[];
        };
        tx.oncomplete = () => resolve(result);
        tx.onerror = () => reject(tx.error ?? new Error("Cannot read recent files."));
        tx.onabort = () => reject(tx.error ?? new Error("Recent-file read aborted."));
      });
      return records
        .sort((a, b) => a.order - b.order)
        .map((record) => {
          if (
            typeof record.id !== "string" ||
            !record.id ||
            typeof record.name !== "string" ||
            !(record.rgba instanceof ArrayBuffer)
          )
            throw new Error("A stored recent image has an invalid record.");
          const image = {
            width: record.width,
            height: record.height,
            data: new Uint8ClampedArray(record.rgba),
          };
          assertPixelBuffer(image);
          return {
            id: record.id,
            name: record.name,
            image,
            ...(record.project ? { project: record.project } : {}),
          };
        });
    } finally {
      db.close();
    }
  }
  save(images: readonly SessionRecentImage[]): Promise<void> {
    // Workspace sessions share this adapter. Serialize replacement writes so
    // Clear Recent Files cannot be overtaken by an older queued session save.
    const write = this.writes.then(() => this.saveOnce(images));
    this.writes = write.catch(() => {});
    return write;
  }
  private async saveOnce(images: readonly SessionRecentImage[]): Promise<void> {
    const records = images.map(({ id, name, image, project }, order): StoredRecentImage => {
      assertPixelBuffer(image);
      return {
        id,
        name,
        width: image.width,
        height: image.height,
        rgba: new Uint8ClampedArray(image.data).buffer,
        order,
        ...(project ? { project } : {}),
      };
    });
    if (
      new Set(records.map((record) => record.id)).size !== records.length ||
      records.some((record) => typeof record.id !== "string" || !record.id)
    )
      throw new Error("Recent file identities must be unique non-empty strings.");
    const db = await this.open();
    try {
      await new Promise<void>((resolve, reject) => {
        const tx = db.transaction(STORE, "readwrite"),
          store = tx.objectStore(STORE);
        store.clear();
        for (const record of records) store.put(record);
        tx.oncomplete = () => resolve();
        tx.onerror = () => reject(tx.error ?? new Error("Cannot persist recent files."));
        tx.onabort = () => reject(tx.error ?? new Error("Recent-file write aborted."));
      });
    } finally {
      db.close();
    }
  }
}
