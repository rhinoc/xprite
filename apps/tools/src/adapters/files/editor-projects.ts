import { FileEntryKind, type FileEntry } from "$/managers/ports/files";

/** The editor's recent-projects database. Files only reads it and never creates or upgrades it. */
const EDITOR_RECENTS_DATABASE = "xse.idb.recents.v2";
const CATALOG = "recents";
const THUMBNAILS = "thumbnails";
const EDITOR_PROJECT_FOLDER = "/editor/projects/";

interface RecentRecord {
  id: string;
  name: string;
  order: number;
  width: number;
  height: number;
  hasProject: boolean;
}

interface StoredThumbnail {
  width: number;
  height: number;
  data: Uint8ClampedArray;
}

/** Open an existing database without a version, aborting if it would have to be created. */
function openExisting(factory: IDBFactory | undefined): Promise<IDBDatabase | null> {
  if (!factory) return Promise.resolve(null);
  return new Promise((resolve) => {
    let request: IDBOpenDBRequest;
    try {
      request = factory.open(EDITOR_RECENTS_DATABASE);
    } catch {
      resolve(null);
      return;
    }
    request.onupgradeneeded = () => request.transaction?.abort();
    request.onerror = () => resolve(null);
    request.onblocked = () => resolve(null);
    request.onsuccess = () => {
      const database = request.result;
      if (!database.objectStoreNames.contains(CATALOG)) {
        database.close();
        resolve(null);
      } else resolve(database);
    };
  });
}

function read<T>(database: IDBDatabase, store: string, query?: IDBValidKey): Promise<T> {
  return new Promise((resolve, reject) => {
    const transaction = database.transaction(store, "readonly");
    const request =
      query === undefined
        ? transaction.objectStore(store).getAll()
        : transaction.objectStore(store).get(query);
    transaction.oncomplete = () => resolve(request.result as T);
    transaction.onabort = transaction.onerror = () => reject(transaction.error);
  });
}

/** Lists editor projects in place; their bytes stay in the editor's own storage. */
export class EditorProjectReader {
  constructor(private readonly factory: IDBFactory | undefined = globalThis.indexedDB) {}

  async list(): Promise<FileEntry[]> {
    const database = await openExisting(this.factory);
    if (!database) return [];
    try {
      const records = await read<RecentRecord[]>(database, CATALOG);
      return records
        .filter((record) => record.hasProject)
        .sort((a, b) => a.order - b.order)
        .map((record) => ({
          id: `editor:${record.id}`,
          kind: FileEntryKind.EditorProject,
          name: record.name,
          type: "application/x-xprite-project",
          size: 0,
          folder: EDITOR_PROJECT_FOLDER,
          createdAt: 0,
          modifiedAt: 0,
          openedAt: 0,
          label: 0,
          comment: "",
          width: record.width,
          height: record.height,
        }));
    } catch {
      return [];
    } finally {
      database.close();
    }
  }

  async thumbnail(entry: FileEntry): Promise<ImageData | null> {
    const database = await openExisting(this.factory);
    if (!database || !database.objectStoreNames.contains(THUMBNAILS)) {
      database?.close();
      return null;
    }
    try {
      const stored = await read<StoredThumbnail | undefined>(
        database,
        THUMBNAILS,
        entry.id.replace(/^editor:/, ""),
      );
      if (!stored?.width || !stored.height) return null;
      return new ImageData(new Uint8ClampedArray(stored.data), stored.width, stored.height);
    } catch {
      return null;
    } finally {
      database.close();
    }
  }
}

export function editorRecentId(entry: FileEntry): string {
  return entry.id.replace(/^editor:/, "");
}
