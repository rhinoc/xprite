import type { EditorInitialProject } from "$/managers/ports/editor-host";
import { IndexedDbDatabase } from "@xprite/bedrock/browser/indexeddb";
import { copyStoredPalette } from "@xprite/editor-core/import-export";

const DATABASE_NAME = "xprite.viewer-transfer";
const STORE_NAME = "files";
const TRANSFER_PREFIX = "#viewer-import=";

interface TransferRecord {
  token: string;
  palette?: unknown;
  /** Current senders store raw bytes: a Blob in IndexedDB is file-backed and can fail to read. */
  bytes?: ArrayBuffer;
  type?: string;
  file?: Blob;
  name: string;
  expires: number;
}

function transferDatabase() {
  return new IndexedDbDatabase({
    databaseName: DATABASE_NAME,
    stores: [{ name: STORE_NAME, options: { keyPath: "token" } }],
  });
}

export const VIEWER_TRANSFER_FAILED_MESSAGE =
  "Couldn't open the image handed over from the tool. Reload this page to try again, or go back to the tool and save the PNG instead.";

/** Ordinary editor URLs never open the transfer database or change navigation. */
export function takeViewerProject(): Promise<EditorInitialProject | null> | null {
  if (!window.location.hash.startsWith(TRANSFER_PREFIX)) return null;
  const token = window.location.hash.slice(TRANSFER_PREFIX.length);
  return consumeProject(token).then(
    (project) => {
      clearImportHash();
      return project;
    },
    (reason: unknown) => {
      // The record and the hash stay, so reloading the page retries the same handoff.
      console.warn("Viewer transfer failed", reason);
      throw new Error(VIEWER_TRANSFER_FAILED_MESSAGE);
    },
  );
}

function clearImportHash() {
  if (!window.location.hash.startsWith(TRANSFER_PREFIX)) return;
  window.history.replaceState(
    window.history.state,
    "",
    `${window.location.pathname}${window.location.search}`,
  );
}

function runTransaction<T>(
  database: IndexedDbDatabase,
  run: (store: IDBObjectStore, done: (value: T) => void) => void,
): Promise<T> {
  return database.withConnection(
    (connection) =>
      new Promise<T>((resolve, reject) => {
        const transaction = connection.transaction(STORE_NAME, "readwrite");
        let value: T;
        run(transaction.objectStore(STORE_NAME), (result) => (value = result));
        transaction.oncomplete = () => resolve(value);
        transaction.onerror = transaction.onabort = () =>
          reject(transaction.error ?? new Error("Unable to receive the file."));
      }),
  );
}

/** Copy the record's payload into memory so decoding never depends on IndexedDB blob files. */
async function readPayload(record: TransferRecord): Promise<Blob> {
  const type = record.type ?? record.file?.type ?? "";
  const bytes = record.bytes ?? (await record.file?.arrayBuffer());
  if (!bytes || bytes.byteLength === 0) throw new Error("The transferred file is empty.");
  return new Blob([bytes], { type });
}

async function consumeProject(token: string): Promise<EditorInitialProject | null> {
  const database = transferDatabase();
  try {
    const record = await runTransaction<TransferRecord | null>(database, (store, done) => {
      const request = store.get(token);
      request.onsuccess = () => {
        const value = request.result as TransferRecord | undefined;
        if (!value) return;
        if (value.expires <= Date.now()) store.delete(token);
        else if (value.bytes instanceof ArrayBuffer || value.file instanceof Blob) done(value);
        else store.delete(token);
      };
    });
    if (!record) return null;
    const file = await readPayload(record);
    const project = await decodeRecord(record, file);
    // Deleted only after a successful decode, so a failed attempt can be retried.
    await runTransaction<void>(database, (store) => void store.delete(token)).catch(() => {});
    return project;
  } finally {
    database.close();
  }
}

async function decodeRecord(record: TransferRecord, file: Blob): Promise<EditorInitialProject> {
  if (/\.(?:gif|webp)$/i.test(record.name)) {
    const { decodeAnimatedImageSource } = await import("$/adapters/files/animated-images");
    const project = await decodeAnimatedImageSource(file, record.name);
    if (project) return { name: record.name, project };
  }
  if (/\.(?:png|gif|webp|jpe?g)$/i.test(record.name)) {
    const { decodeImageBlob } = await import("@xprite/bedrock/browser/images");
    const { projectFromClipboardImage } = await import("@xprite/editor-core/import-export");
    const pixels = await decodeImageBlob(file);
    return {
      name: record.name,
      project: projectFromClipboardImage({
        pixels,
        mask: null,
        palette: copyStoredPalette(record.palette) ?? undefined,
      }),
    };
  }
  const { decodeAsepriteBlob } = await import("$/adapters/files/aseprite-files");
  return { name: record.name, project: await decodeAsepriteBlob(file, record.name) };
}
