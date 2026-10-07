import type { EditorInitialProject } from "$/managers/ports/editor-host";
import { IndexedDbDatabase } from "@xprite/bedrock/browser/indexeddb";

const DATABASE_NAME = "xprite.viewer-transfer";
const STORE_NAME = "files";
const TRANSFER_PREFIX = "#viewer-import=";

interface TransferRecord {
  token: string;
  file: Blob;
  name: string;
  expires: number;
}

function transferDatabase() {
  return new IndexedDbDatabase({
    databaseName: DATABASE_NAME,
    stores: [{ name: STORE_NAME, options: { keyPath: "token" } }],
  });
}

/** Ordinary editor URLs never open the transfer database or change navigation. */
export function takeViewerProject(): Promise<EditorInitialProject | null> | null {
  if (!window.location.hash.startsWith(TRANSFER_PREFIX)) return null;
  const token = window.location.hash.slice(TRANSFER_PREFIX.length);
  window.history.replaceState(
    window.history.state,
    "",
    `${window.location.pathname}${window.location.search}`,
  );
  return consumeProject(token);
}

async function consumeProject(token: string): Promise<EditorInitialProject | null> {
  const database = transferDatabase();
  try {
    const record = await database.withConnection(
      (connection) =>
        new Promise<TransferRecord | null>((resolve, reject) => {
          const transaction = connection.transaction(STORE_NAME, "readwrite");
          const store = transaction.objectStore(STORE_NAME);
          const request = store.get(token);
          let record: TransferRecord | null = null;
          request.onsuccess = () => {
            const value = request.result as TransferRecord | undefined;
            if (value && value.expires > Date.now() && value.file instanceof Blob) record = value;
            store.delete(token);
          };
          transaction.oncomplete = () => resolve(record);
          transaction.onerror = transaction.onabort = () =>
            reject(transaction.error ?? new Error("Unable to receive the file."));
        }),
    );
    if (!record) return null;
    const { decodeAsepriteBlob } = await import("$/adapters/files/aseprite-files");
    return { name: record.name, project: await decodeAsepriteBlob(record.file, record.name) };
  } finally {
    database.close();
  }
}
