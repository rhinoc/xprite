import {
  DIAGNOSTIC_RETENTION_DAYS,
  MAX_DIAGNOSTIC_RECORDS,
  type DiagnosticRecord,
} from "$/managers/ports/diagnostics";
import { IndexedDbDatabase } from "@xprite/bedrock/browser/indexeddb";

const DIAGNOSTIC_DATABASE_NAME = "xse.diagnostics.local.v1";
const DIAGNOSTIC_STORE_NAME = "entries";
const MILLISECONDS_PER_DAY = 24 * 60 * 60 * 1000;
const DIAGNOSTIC_RETENTION_MS = DIAGNOSTIC_RETENTION_DAYS * MILLISECONDS_PER_DAY;

/** Stores bounded diagnostic records independently from document and recovery databases. */
export class IndexedDbDiagnosticStore {
  private readonly database: IndexedDbDatabase;

  constructor(options: { factory?: IDBFactory } = {}) {
    this.database = new IndexedDbDatabase({
      factory: options.factory,
      databaseName: DIAGNOSTIC_DATABASE_NAME,
      version: 1,
      stores: [{ name: DIAGNOSTIC_STORE_NAME, options: { keyPath: "id" } }],
    });
  }

  async getRecent(): Promise<DiagnosticRecord[]> {
    const database = await this.database.open();
    return new Promise((resolve, reject) => {
      const transaction = database.transaction(DIAGNOSTIC_STORE_NAME, "readwrite");
      const store = transaction.objectStore(DIAGNOSTIC_STORE_NAME);
      const request = store.getAll();
      let recent: DiagnosticRecord[] = [];
      request.onsuccess = () => {
        const cutoff = Date.now() - DIAGNOSTIC_RETENTION_MS;
        const ordered = (request.result as DiagnosticRecord[]).sort(
          (left, right) => right.timestamp - left.timestamp,
        );
        recent = ordered
          .filter((record) => record.timestamp >= cutoff)
          .slice(0, MAX_DIAGNOSTIC_RECORDS);
        ordered.forEach((record, index) => {
          if (record.timestamp < cutoff || index >= MAX_DIAGNOSTIC_RECORDS) store.delete(record.id);
        });
      };
      request.onerror = () => reject(request.error ?? new Error("Unable to read diagnostics"));
      transaction.oncomplete = () => resolve(recent);
      transaction.onabort = () =>
        reject(transaction.error ?? new Error("Diagnostic read transaction aborted"));
    });
  }

  async appendBatch(records: readonly DiagnosticRecord[]): Promise<void> {
    if (!records.length) return;
    const database = await this.database.open();
    return new Promise((resolve, reject) => {
      const transaction = database.transaction(DIAGNOSTIC_STORE_NAME, "readwrite");
      const store = transaction.objectStore(DIAGNOSTIC_STORE_NAME);
      for (const record of records) store.put(record);
      const readAll = store.getAll();
      readAll.onsuccess = () => {
        const cutoff = Date.now() - DIAGNOSTIC_RETENTION_MS;
        const ordered = (readAll.result as DiagnosticRecord[]).sort(
          (left, right) => right.timestamp - left.timestamp,
        );
        ordered.forEach((record, index) => {
          if (record.timestamp < cutoff || index >= MAX_DIAGNOSTIC_RECORDS) store.delete(record.id);
        });
      };
      readAll.onerror = () => transaction.abort();
      transaction.oncomplete = () => resolve();
      transaction.onabort = () =>
        reject(transaction.error ?? readAll.error ?? new Error("Diagnostic write aborted"));
      transaction.onerror = () =>
        reject(transaction.error ?? new Error("Unable to write diagnostics"));
    });
  }

  async clear(): Promise<void> {
    const database = await this.database.open();
    return new Promise((resolve, reject) => {
      const transaction = database.transaction(DIAGNOSTIC_STORE_NAME, "readwrite");
      transaction.objectStore(DIAGNOSTIC_STORE_NAME).clear();
      transaction.oncomplete = () => resolve();
      transaction.onabort = () =>
        reject(transaction.error ?? new Error("Diagnostic clear aborted"));
      transaction.onerror = () =>
        reject(transaction.error ?? new Error("Unable to clear diagnostics"));
    });
  }
}
