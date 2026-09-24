import { BrowserStorageError, BrowserStorageErrorCode } from "$/storage-error";

export interface IndexedDbObjectStoreDefinition {
  name: string;
  options?: IDBObjectStoreParameters;
}

export interface IndexedDbDatabaseOptions {
  databaseName: string;
  version?: number;
  factory?: IDBFactory;
  stores?: readonly IndexedDbObjectStoreDefinition[];
}

/** Owns IndexedDB opening, schema creation, connection invalidation, and close. */
export class IndexedDbDatabase {
  private connection?: Promise<IDBDatabase>;
  private closed = false;

  constructor(private readonly options: IndexedDbDatabaseOptions) {}

  open(): Promise<IDBDatabase> {
    if (this.closed)
      return Promise.reject(
        new BrowserStorageError(BrowserStorageErrorCode.Closed, "IndexedDB connection is closed"),
      );
    if (this.connection) return this.connection;
    const factory = this.options.factory ?? globalThis.indexedDB;
    if (!factory)
      return Promise.reject(
        new BrowserStorageError(BrowserStorageErrorCode.Unavailable, "IndexedDB is unavailable"),
      );

    this.connection = new Promise((resolve, reject) => {
      const request = factory.open(this.options.databaseName, this.options.version ?? 1);
      request.onupgradeneeded = () => {
        const database = request.result;
        for (const store of this.options.stores ?? []) {
          if (!database.objectStoreNames.contains(store.name))
            database.createObjectStore(store.name, store.options);
        }
      };
      request.onerror = () =>
        reject(
          request.error ??
            new BrowserStorageError(BrowserStorageErrorCode.Io, "IndexedDB open failed"),
        );
      request.onblocked = () =>
        reject(
          new BrowserStorageError(
            BrowserStorageErrorCode.Unavailable,
            "IndexedDB upgrade is blocked by another tab",
          ),
        );
      request.onsuccess = () => {
        const database = request.result;
        if (this.closed) {
          database.close();
          reject(
            new BrowserStorageError(
              BrowserStorageErrorCode.Closed,
              "IndexedDB connection was closed while opening",
            ),
          );
          return;
        }
        database.onversionchange = () => {
          database.close();
          this.connection = undefined;
        };
        resolve(database);
      };
    });
    this.connection.catch(() => {
      this.connection = undefined;
    });
    return this.connection;
  }

  close(): void {
    if (this.closed) return;
    this.closed = true;
    this.connection?.then(
      (database) => database.close(),
      () => {},
    );
  }
}
