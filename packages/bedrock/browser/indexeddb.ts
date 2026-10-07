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

function isInvalidStateError(error: unknown): boolean {
  return (
    typeof error === "object" &&
    error !== null &&
    "name" in error &&
    error.name === "InvalidStateError"
  );
}

/** Owns IndexedDB opening, schema creation, connection invalidation, and close. */
export class IndexedDbDatabase {
  private connection?: Promise<IDBDatabase>;
  private current?: IDBDatabase;
  private closed = false;

  constructor(private readonly options: IndexedDbDatabaseOptions) {}

  private invalidate(database: IDBDatabase): void {
    if (this.current !== database) return;
    this.current = undefined;
    this.connection = undefined;
  }

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

    const connection = new Promise<IDBDatabase>((resolve, reject) => {
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
        this.current = database;
        database.onclose = () => this.invalidate(database);
        database.onversionchange = () => {
          this.invalidate(database);
          database.close();
        };
        resolve(database);
      };
    });
    this.connection = connection;
    void connection.catch(() => {
      if (this.connection === connection) this.connection = undefined;
    });
    return connection;
  }

  /** Retry only a failed synchronous transaction start, never an operation already underway. */
  async withConnection<T>(start: (database: IDBDatabase) => Promise<T>): Promise<T> {
    let database = await this.open();
    if (this.closed)
      throw new BrowserStorageError(
        BrowserStorageErrorCode.Closed,
        "IndexedDB connection is closed",
      );
    try {
      return start(database);
    } catch (error) {
      if (!isInvalidStateError(error)) throw error;
      this.invalidate(database);
      database.close();
      database = await this.open();
      if (this.closed)
        throw new BrowserStorageError(
          BrowserStorageErrorCode.Closed,
          "IndexedDB connection is closed",
        );
      return start(database);
    }
  }

  close(): void {
    if (this.closed) return;
    this.closed = true;
    const connection = this.connection;
    this.connection = undefined;
    this.current = undefined;
    connection?.then(
      (database) => database.close(),
      () => {},
    );
  }
}
