import type { UserPresetStoragePort } from "$/managers/ports/user-presets";
import { IndexedDbDatabase } from "@xprite/bedrock/browser/indexeddb";

const DATABASE_NAME = "xse.idb.user-presets.v1";
const STORE = "presets";
const RECORD_KEY = "user";

export class IndexedDbUserPresets implements UserPresetStoragePort {
  private readonly database: IndexedDbDatabase;
  constructor(options: { databaseName?: string; factory?: IDBFactory } = {}) {
    this.database = new IndexedDbDatabase({
      databaseName: options.databaseName ?? DATABASE_NAME,
      factory: options.factory,
      version: 1,
      stores: [{ name: STORE }],
    });
  }
  async load(): Promise<unknown> {
    const database = await this.database.open();
    return new Promise((resolve, reject) => {
      const transaction = database.transaction(STORE, "readonly");
      const request = transaction.objectStore(STORE).get(RECORD_KEY);
      let value: unknown = null;
      request.onsuccess = () => {
        value = request.result ?? null;
      };
      transaction.oncomplete = () => resolve(value);
      transaction.onerror = transaction.onabort = () => reject(transaction.error);
    });
  }
  async save(value: unknown): Promise<void> {
    const database = await this.database.open();
    return new Promise((resolve, reject) => {
      const transaction = database.transaction(STORE, "readwrite");
      transaction.objectStore(STORE).put(value, RECORD_KEY);
      transaction.oncomplete = () => resolve();
      transaction.onerror = transaction.onabort = () => reject(transaction.error);
    });
  }
  close() {
    this.database.close();
  }
}
