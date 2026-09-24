import type { WritableFileHandle } from "@xprite/bedrock/browser/file-system";
import { IndexedDbDatabase } from "@xprite/bedrock/browser/indexeddb";

interface StoredDocumentFileHandle {
  documentKey: string;
  handle: WritableFileHandle;
}

const STORE = "xse.file-handles.documents.v1";
export const DEFAULT_FILE_HANDLES_DATABASE_NAME = "xse.idb.file-handles.v1";

/** User-granted file handles are browser-local associations for open document tabs. */
export class IndexedDbDocumentFileHandles {
  private readonly database: IndexedDbDatabase;

  constructor(options: { databaseName?: string; factory?: IDBFactory } = {}) {
    this.database = new IndexedDbDatabase({
      databaseName: options.databaseName ?? DEFAULT_FILE_HANDLES_DATABASE_NAME,
      factory: options.factory,
      version: 1,
      stores: [{ name: STORE, options: { keyPath: "documentKey" } }],
    });
  }

  async load(documentKeys: readonly string[]): Promise<ReadonlyMap<string, WritableFileHandle>> {
    if (!documentKeys.length) return new Map();
    const database = await this.database.open();
    return new Promise((resolve, reject) => {
      const transaction = database.transaction(STORE, "readonly");
      const request = transaction.objectStore(STORE).getAll();
      let handles = new Map<string, WritableFileHandle>();
      request.onsuccess = () => {
        const requested = new Set(documentKeys);
        handles = new Map(
          (request.result as StoredDocumentFileHandle[])
            .filter(
              (record) =>
                record &&
                requested.has(record.documentKey) &&
                typeof record.documentKey === "string" &&
                record.handle,
            )
            .map((record) => [record.documentKey, record.handle]),
        );
      };
      transaction.oncomplete = () => resolve(handles);
      transaction.onerror = () =>
        reject(transaction.error ?? new Error("Could not restore saved file locations."));
      transaction.onabort = () =>
        reject(transaction.error ?? new Error("Restoring saved file locations was aborted."));
    });
  }

  async save(documentKey: string, handle: WritableFileHandle): Promise<void> {
    const database = await this.database.open();
    await new Promise<void>((resolve, reject) => {
      const transaction = database.transaction(STORE, "readwrite");
      transaction
        .objectStore(STORE)
        .put({ documentKey, handle } satisfies StoredDocumentFileHandle);
      transaction.oncomplete = () => resolve();
      transaction.onerror = () =>
        reject(transaction.error ?? new Error("Could not remember the selected file."));
      transaction.onabort = () =>
        reject(transaction.error ?? new Error("Remembering the selected file was aborted."));
    });
  }

  async delete(documentKey: string): Promise<void> {
    const database = await this.database.open();
    await new Promise<void>((resolve, reject) => {
      const transaction = database.transaction(STORE, "readwrite");
      transaction.objectStore(STORE).delete(documentKey);
      transaction.oncomplete = () => resolve();
      transaction.onerror = () =>
        reject(transaction.error ?? new Error("Could not remove the saved file location."));
      transaction.onabort = () =>
        reject(transaction.error ?? new Error("Removing the saved file location was aborted."));
    });
  }

  close(): void {
    this.database.close();
  }
}
