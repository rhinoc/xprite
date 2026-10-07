import { IndexedDbDatabase } from "@xprite/bedrock/browser/indexeddb";
import { randomId } from "@xprite/bedrock/browser/runtime-crypto";

const DATABASE_NAME = "xprite.viewer-transfer";
const STORE_NAME = "files";
const TRANSFER_LIFETIME_MS = 10 * 60 * 1000;

/** Only an explicit Continue editing action stages the original file for the editor. */
export async function transferViewerFile(file: File): Promise<string> {
  const database = new IndexedDbDatabase({
    databaseName: DATABASE_NAME,
    stores: [{ name: STORE_NAME, options: { keyPath: "token" } }],
  });
  const token = randomId();
  try {
    await database.withConnection(
      (connection) =>
        new Promise<void>((resolve, reject) => {
          const transaction = connection.transaction(STORE_NAME, "readwrite");
          const store = transaction.objectStore(STORE_NAME);
          const now = Date.now();
          const cursor = store.openCursor();
          cursor.onsuccess = () => {
            const entry = cursor.result;
            if (!entry) return;
            if (entry.value.expires <= now) entry.delete();
            entry.continue();
          };
          store.put({ token, file, name: file.name, expires: now + TRANSFER_LIFETIME_MS });
          transaction.oncomplete = () => resolve();
          transaction.onerror = transaction.onabort = () =>
            reject(transaction.error ?? new Error("Unable to transfer the file."));
        }),
    );
    return token;
  } finally {
    database.close();
  }
}
