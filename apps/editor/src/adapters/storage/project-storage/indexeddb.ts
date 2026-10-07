import { tUi } from "$/i18n";
import {
  ProjectStorageError,
  PayloadKind,
  type ProjectCatalog,
  type PayloadStore,
  type ProjectRecord,
} from "$/managers/ports/project-storage";
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
  private withDatabase<T>(start: (database: IDBDatabase) => Promise<T>): Promise<T> {
    if (this.closed)
      return Promise.reject(new ProjectStorageError("closed", "Project database is closed"));
    return this.database.withConnection(start).catch((error: unknown) => {
      if (error instanceof BrowserStorageError)
        throw new ProjectStorageError(error.code, error.message);
      throw error;
    });
  }
  private query<T>(store: string, action: (store: IDBObjectStore) => IDBRequest<T>): Promise<T> {
    return this.withDatabase<T>((db) => {
      const tx = db.transaction(store, "readonly");
      const request = action(tx.objectStore(store));
      return new Promise<T>((resolve, reject) => {
        tx.oncomplete = () => resolve(request.result);
        tx.onabort = () =>
          reject(tx.error ?? new ProjectStorageError("io", "Project read aborted"));
      });
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
    return this.withDatabase<void>((db) => {
      const tx = db.transaction(PROJECTS_STORE, "readwrite");
      const store = tx.objectStore(PROJECTS_STORE);
      const request = store.get(record.projectId);
      return new Promise<void>((resolve, reject) => {
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
    });
  }
  async removeRecord(projectId: string, expectedHead: string): Promise<ProjectRecord | null> {
    return this.withDatabase<ProjectRecord | null>((db) => {
      const tx = db.transaction(PROJECTS_STORE, "readwrite");
      const store = tx.objectStore(PROJECTS_STORE);
      const request = store.get(projectId);
      return new Promise<ProjectRecord | null>((resolve, reject) => {
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
    });
  }
  async write(id: string, bytes: Uint8Array): Promise<void> {
    return this.withDatabase<void>((db) => {
      const tx = db.transaction(PAYLOADS_STORE, "readwrite");
      // add, never put: generations cannot be overwritten by a reused ID.
      tx.objectStore(PAYLOADS_STORE).add(new Uint8Array(bytes).buffer, id);
      return new Promise<void>((resolve, reject) => {
        tx.oncomplete = () => resolve();
        tx.onabort = () =>
          reject(tx.error ?? new ProjectStorageError("io", "Snapshot write aborted"));
      });
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
    return this.withDatabase<void>((db) => {
      const tx = db.transaction(PAYLOADS_STORE, "readwrite");
      tx.objectStore(PAYLOADS_STORE).delete(id);
      return new Promise<void>((resolve, reject) => {
        tx.oncomplete = () => resolve();
        tx.onabort = () =>
          reject(tx.error ?? new ProjectStorageError("io", "Snapshot removal aborted"));
      });
    });
  }
  close(): void {
    if (this.closed) return;
    this.closed = true;
    this.database.close();
  }
}
