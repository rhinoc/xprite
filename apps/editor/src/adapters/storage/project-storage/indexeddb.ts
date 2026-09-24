import {
  ProjectStorageError,
  PayloadKind,
  type ProjectCatalog,
  type PayloadStore,
  type ProjectRecord,
} from "$/adapters/storage/project-storage/types";
import { tUi } from "$/i18n";
import { IndexedDbDatabase } from "@xprite/bedrock/browser/indexeddb";
import { BrowserStorageError } from "@xprite/bedrock/browser/storage-error";

export const DEFAULT_PROJECT_DATABASE_NAME = "xse.idb.projects.v1";
const PROJECTS_STORE = "xse.projects.catalog.v1";
const PAYLOADS_STORE = "xse.projects.payloads.v1";

/** Stores the catalog and payloads in an isolated IndexedDB database. */
export class IndexedDbProjectStorage implements ProjectCatalog, PayloadStore {
  readonly kind = PayloadKind.IndexedDb;
  private closed = false;
  private readonly database: IndexedDbDatabase;
  constructor(options: { factory?: IDBFactory; databaseName?: string } = {}) {
    this.database = new IndexedDbDatabase({
      factory: options.factory,
      databaseName: options.databaseName ?? DEFAULT_PROJECT_DATABASE_NAME,
      version: 1,
      stores: [
        { name: PROJECTS_STORE, options: { keyPath: "projectId" } },
        { name: PAYLOADS_STORE },
      ],
    });
  }
  private async open(): Promise<IDBDatabase> {
    if (this.closed) throw new ProjectStorageError("closed", "Project database is closed");
    try {
      return await this.database.open();
    } catch (error) {
      if (error instanceof BrowserStorageError)
        throw new ProjectStorageError(error.code, error.message);
      throw error;
    }
  }
  private async query<T>(
    store: string,
    action: (store: IDBObjectStore) => IDBRequest<T>,
  ): Promise<T> {
    const db = await this.open();
    return new Promise((resolve, reject) => {
      const tx = db.transaction(store, "readonly");
      const request = action(tx.objectStore(store));
      tx.oncomplete = () => resolve(request.result);
      tx.onabort = () => reject(tx.error ?? new ProjectStorageError("io", "Project read aborted"));
    });
  }
  async get(projectId: string): Promise<ProjectRecord | null> {
    return (
      (await this.query<ProjectRecord | undefined>(PROJECTS_STORE, (store) =>
        store.get(projectId),
      )) ?? null
    );
  }
  async list(): Promise<ProjectRecord[]> {
    return (await this.query<ProjectRecord[]>(PROJECTS_STORE, (store) => store.getAll())).sort(
      (a, b) => b.updatedAt - a.updatedAt,
    );
  }
  async publish(record: ProjectRecord, expectedHead: string | null): Promise<void> {
    const db = await this.open();
    return new Promise((resolve, reject) => {
      const tx = db.transaction(PROJECTS_STORE, "readwrite");
      const store = tx.objectStore(PROJECTS_STORE);
      const request = store.get(record.projectId);
      let conflict = false;
      request.onsuccess = () => {
        if ((request.result?.head.id ?? null) !== expectedHead) {
          conflict = true;
          tx.abort();
        } else store.put(record);
      };
      tx.oncomplete = () => resolve();
      tx.onabort = () =>
        reject(
          conflict
            ? new ProjectStorageError(
                "conflict",
                "A newer project snapshot exists in another writer",
              )
            : (tx.error ?? new ProjectStorageError("io", "Project publication aborted")),
        );
    });
  }
  async removeRecord(projectId: string, expectedHead: string): Promise<ProjectRecord | null> {
    const db = await this.open();
    return new Promise((resolve, reject) => {
      const tx = db.transaction(PROJECTS_STORE, "readwrite");
      const store = tx.objectStore(PROJECTS_STORE);
      const request = store.get(projectId);
      let removed: ProjectRecord | null = null;
      let conflict = false;
      request.onsuccess = () => {
        const record = request.result as ProjectRecord | undefined;
        if (!record) return;
        if (record.head.id !== expectedHead) {
          conflict = true;
          tx.abort();
          return;
        }
        removed = record;
        store.delete(projectId);
      };
      tx.oncomplete = () => resolve(removed);
      tx.onabort = () =>
        reject(
          conflict
            ? new ProjectStorageError(
                "conflict",
                "A newer project snapshot exists in another writer",
              )
            : (tx.error ?? new ProjectStorageError("io", "Project removal aborted")),
        );
    });
  }
  async write(id: string, bytes: Uint8Array): Promise<void> {
    const db = await this.open();
    return new Promise((resolve, reject) => {
      const tx = db.transaction(PAYLOADS_STORE, "readwrite");
      // add, never put: generations cannot be overwritten by a reused ID.
      tx.objectStore(PAYLOADS_STORE).add(new Uint8Array(bytes).buffer, id);
      tx.oncomplete = () => resolve();
      tx.onabort = () =>
        reject(tx.error ?? new ProjectStorageError("io", "Snapshot write aborted"));
    });
  }
  async read(id: string): Promise<Uint8Array> {
    const result = await this.query<ArrayBuffer | undefined>(PAYLOADS_STORE, (store) =>
      store.get(id),
    );
    if (!result)
      throw new ProjectStorageError("corrupt", tUi("ui.snapshot.is.missing", { value1: id }));
    return new Uint8Array(result);
  }
  async remove(id: string): Promise<void> {
    const db = await this.open();
    return new Promise((resolve, reject) => {
      const tx = db.transaction(PAYLOADS_STORE, "readwrite");
      tx.objectStore(PAYLOADS_STORE).delete(id);
      tx.oncomplete = () => resolve();
      tx.onabort = () =>
        reject(tx.error ?? new ProjectStorageError("io", "Snapshot removal aborted"));
    });
  }
  close(): void {
    if (this.closed) return;
    this.closed = true;
    this.database.close();
  }
}
