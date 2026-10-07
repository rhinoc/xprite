import type { WritableFileHandle } from "@xprite/bedrock/browser/file-system";
import { IndexedDbDatabase } from "@xprite/bedrock/browser/indexeddb";
import { randomId, sha256Hex } from "@xprite/bedrock/browser/runtime-crypto";

export interface IdentifiableFileHandle extends WritableFileHandle {
  isSameEntry?(other: WritableFileHandle): Promise<boolean>;
  getFile?(): Promise<File>;
}
interface FileIdentity {
  id: string;
  fingerprint: string;
  handle?: IdentifiableFileHandle;
}
const DATABASE_NAME = "xse.idb.file-identities.v1";
const STORE = "identities";

/** Native handles identify files across edits. File-input fallback recognizes
 * exact content and relative names because browsers do not expose full paths. */
export class IndexedDbFileIdentities {
  private readonly database: IndexedDbDatabase;
  private loading: Promise<void> | null = null;
  private readonly records = new Map<string, FileIdentity>();
  private queue: Promise<void> = Promise.resolve();
  constructor(options: { databaseName?: string; factory?: IDBFactory } = {}) {
    this.database = new IndexedDbDatabase({
      databaseName: options.databaseName ?? DATABASE_NAME,
      factory: options.factory,
      version: 1,
      stores: [{ name: STORE, options: { keyPath: "id" } }],
    });
  }
  private load(): Promise<void> {
    if (this.loading) return this.loading;
    this.loading = (async () => {
      const database = await this.database.open();
      const records = await new Promise<FileIdentity[]>((resolve, reject) => {
        const transaction = database.transaction(STORE, "readonly");
        const request = transaction.objectStore(STORE).getAll();
        let records: FileIdentity[] = [];
        request.onsuccess = () => {
          records = request.result;
        };
        transaction.oncomplete = () => resolve(records);
        transaction.onerror = transaction.onabort = () => reject(transaction.error);
      });
      for (const record of records)
        if (record && typeof record.id === "string" && typeof record.fingerprint === "string")
          this.records.set(record.id, record);
    })();
    return this.loading;
  }
  async identify(
    file: File,
    handle?: IdentifiableFileHandle,
    sourceChecksum?: string,
  ): Promise<string> {
    await this.load().catch(() => {});
    const checksum = sourceChecksum ?? (await sha256Hex(new Uint8Array(await file.arrayBuffer())));
    const fingerprint = JSON.stringify([file.webkitRelativePath || file.name, file.size, checksum]);
    let matching: FileIdentity | undefined;
    if (handle?.isSameEntry) {
      for (const record of this.records.values()) {
        if (!record.handle) continue;
        try {
          if (await handle.isSameEntry(record.handle)) {
            matching = record;
            break;
          }
        } catch {
          /* Stale handles do not prevent matching another saved location. */
        }
      }
    }
    if (!matching && !handle) {
      const candidates = [...this.records.values()].filter(
        (record) => record.fingerprint === fingerprint,
      );
      // A file input cannot distinguish two native locations with identical
      // names and bytes, so it must not arbitrarily inherit either one's preferences.
      if (candidates.length === 1) matching = candidates[0];
    }
    const id = matching?.id ?? (handle ? `file:${randomId()}` : `file-content:${fingerprint}`);
    const record: FileIdentity = {
      id,
      fingerprint,
      ...(handle ? { handle } : matching?.handle ? { handle: matching.handle } : {}),
    };
    this.records.set(id, record);
    this.queue = this.queue
      .then(async () => {
        const database = await this.database.open();
        await new Promise<void>((resolve, reject) => {
          const transaction = database.transaction(STORE, "readwrite");
          transaction.objectStore(STORE).put(record);
          transaction.oncomplete = () => resolve();
          transaction.onerror = transaction.onabort = () => reject(transaction.error);
        });
      })
      .catch(() => {});
    await this.queue;
    return id;
  }
  close() {
    void this.queue.finally(() => this.database.close());
  }
}
