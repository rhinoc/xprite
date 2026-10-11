import {
  DIAGNOSTIC_RETENTION_DAYS,
  MAX_DIAGNOSTIC_RECORDS,
  DiagnosticSource,
  WorkspaceDiagnosticAction,
  type DiagnosticRecord,
} from "$/managers/ports/diagnostics";
import { IndexedDbDatabase } from "@xprite/bedrock/browser/indexeddb";

const DIAGNOSTIC_DATABASE_NAME = "xse.diagnostics.local.v1";
const DIAGNOSTIC_STORE_NAME = "entries";
const MILLISECONDS_PER_DAY = 24 * 60 * 60 * 1000;
const DIAGNOSTIC_RETENTION_MS = DIAGNOSTIC_RETENTION_DAYS * MILLISECONDS_PER_DAY;

function isInteractionBlockedRecord(record: DiagnosticRecord): boolean {
  return (
    record.source === DiagnosticSource.Workspace &&
    record.workspaceEvent?.action === WorkspaceDiagnosticAction.InteractionBlocked
  );
}

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
        let interactionBlockerSeen = false;
        for (const record of ordered) {
          if (record.timestamp < cutoff) {
            store.delete(record.id);
            continue;
          }
          if (isInteractionBlockedRecord(record)) {
            if (interactionBlockerSeen) {
              store.delete(record.id);
              continue;
            }
            interactionBlockerSeen = true;
          }
          if (recent.length >= MAX_DIAGNOSTIC_RECORDS) {
            store.delete(record.id);
            continue;
          }
          recent.push(record);
        }
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
      const trimStore = () => {
        const readAll = store.getAll();
        readAll.onsuccess = () => {
          const cutoff = Date.now() - DIAGNOSTIC_RETENTION_MS;
          const ordered = (readAll.result as DiagnosticRecord[]).sort(
            (left, right) => right.timestamp - left.timestamp,
          );
          ordered.forEach((record, index) => {
            if (record.timestamp < cutoff || index >= MAX_DIAGNOSTIC_RECORDS)
              store.delete(record.id);
          });
        };
        readAll.onerror = () => transaction.abort();
      };
      const hasInteractionBlockedRecord = records.some(
        (record) =>
          record.source === DiagnosticSource.Workspace &&
          record.workspaceEvent?.action === WorkspaceDiagnosticAction.InteractionBlocked,
      );
      const putRecords = () => {
        for (const record of records) store.put(record);
        trimStore();
      };
      if (hasInteractionBlockedRecord) {
        const readExisting = store.getAll();
        readExisting.onsuccess = () => {
          (readExisting.result as DiagnosticRecord[]).forEach((record) => {
            if (isInteractionBlockedRecord(record)) store.delete(record.id);
          });
          putRecords();
        };
        readExisting.onerror = () => transaction.abort();
      } else {
        putRecords();
      }
      transaction.oncomplete = () => resolve();
      transaction.onabort = () =>
        reject(transaction.error ?? new Error("Diagnostic write aborted"));
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
