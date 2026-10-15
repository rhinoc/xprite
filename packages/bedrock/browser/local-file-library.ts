import { createExclusiveLock, type ExclusiveOperation } from "$/exclusive-lock";
import { IndexedDbDatabase } from "$/indexeddb";
import type { ByteStore } from "$/opfs";
import { randomId, sha256Hex } from "$/runtime-crypto";

/** One user-visible file. Bytes are content-addressed and shared between duplicates. */
export interface LocalFileRecord {
  id: string;
  name: string;
  type: string;
  size: number;
  hash: string;
  /** Opaque, caller-defined grouping such as a tool or application id. */
  folder: string;
  /** Opaque, caller-defined origin of the import. */
  source: string;
  createdAt: number;
  modifiedAt: number;
  openedAt: number;
  label: number;
  comment: string;
  trashedAt?: number;
}

export type LocalFilePatch = Partial<Pick<LocalFileRecord, "name" | "label" | "comment">>;

export interface LocalFileInput {
  name: string;
  type: string;
  bytes: Uint8Array;
  folder: string;
  source: string;
}

export interface LocalFileAddResult {
  record: LocalFileRecord;
  /** The same bytes already existed in this folder; only its open time changed. */
  deduped: boolean;
}

interface BlobRecord {
  hash: string;
  size: number;
  refCount: number;
  backend: BlobBackend;
}

enum BlobBackend {
  ByteStore = "bytes",
  IndexedDb = "indexeddb",
}

export enum LocalFileChange {
  Items = "items",
}

export interface LocalFileLibraryOptions {
  databaseName: string;
  /** OPFS or another byte store. Without one, bytes are kept in IndexedDB. */
  byteStore?: ByteStore;
  factory?: IDBFactory;
  /** Cross-tab change notifications. Omit to disable. */
  channelName?: string;
  now?: () => number;
  makeId?: () => string;
  hash?: (bytes: Uint8Array) => Promise<string>;
  exclusive?: ExclusiveOperation;
}

const ITEMS = "items";
const BLOBS = "blobs";
const BYTES = "bytes";
const THUMBNAILS = "thumbnails";
const DATABASE_VERSION = 1;

function done(transaction: IDBTransaction): Promise<void> {
  return new Promise((resolve, reject) => {
    transaction.oncomplete = () => resolve();
    transaction.onabort = transaction.onerror = () =>
      reject(transaction.error ?? new Error("IndexedDB transaction failed"));
  });
}

/** Insert " copy", " copy 2", … before the extension until the name is unused. */
export function uniqueFileName(name: string, taken: ReadonlySet<string>): string {
  if (!taken.has(name)) return name;
  const dot = name.lastIndexOf(".");
  const stem = (dot > 0 ? name.slice(0, dot) : name).replace(/ copy(?: \d+)?$/, "");
  const extension = dot > 0 ? name.slice(dot) : "";
  for (let index = 1; ; index++) {
    const candidate = `${stem} copy${index === 1 ? "" : ` ${index}`}${extension}`;
    if (!taken.has(candidate)) return candidate;
  }
}

/**
 * A local, content-addressed file library: metadata and thumbnails in IndexedDB, bytes in a
 * byte store (OPFS) with an IndexedDB fallback. Nothing leaves the browser.
 */
export class LocalFileLibrary {
  private readonly database: IndexedDbDatabase;
  private readonly now: () => number;
  private readonly makeId: () => string;
  private readonly hash: (bytes: Uint8Array) => Promise<string>;
  private readonly exclusive: ExclusiveOperation;
  private readonly channel?: BroadcastChannel;
  private readonly listeners = new Set<() => void>();
  private byteStore?: ByteStore;
  private local: Promise<unknown> = Promise.resolve();

  constructor(options: LocalFileLibraryOptions) {
    this.database = new IndexedDbDatabase({
      databaseName: options.databaseName,
      factory: options.factory,
      version: DATABASE_VERSION,
      stores: [
        { name: ITEMS, options: { keyPath: "id" } },
        { name: BLOBS, options: { keyPath: "hash" } },
        { name: BYTES },
        { name: THUMBNAILS },
      ],
    });
    this.byteStore = options.byteStore;
    this.now = options.now ?? Date.now;
    this.makeId = options.makeId ?? randomId;
    this.hash = options.hash ?? sha256Hex;
    const shared = options.exclusive ?? createExclusiveLock(`${options.databaseName}.mutation`);
    this.exclusive =
      shared ??
      (<T>(operation: () => Promise<T>) => {
        const next = this.local.then(operation, operation);
        this.local = next.catch(() => undefined);
        return next;
      });
    if (options.channelName && typeof BroadcastChannel === "function") {
      this.channel = new BroadcastChannel(options.channelName);
      this.channel.onmessage = () => this.emit();
    }
  }

  subscribe(listener: () => void): () => void {
    this.listeners.add(listener);
    return () => this.listeners.delete(listener);
  }

  private emit() {
    for (const listener of this.listeners) listener();
  }

  private changed() {
    this.emit();
    try {
      this.channel?.postMessage(LocalFileChange.Items);
    } catch {
      /* A closed channel only stops cross-tab refreshes. */
    }
  }

  private run<T>(mode: IDBTransactionMode, stores: string[], body: (tx: IDBTransaction) => T) {
    return this.database.withConnection(async (connection) => {
      const transaction = connection.transaction(stores, mode);
      const completion = done(transaction);
      const result = body(transaction);
      await completion;
      return result;
    });
  }

  async list(): Promise<LocalFileRecord[]> {
    let items: IDBRequest<LocalFileRecord[]> | undefined;
    await this.run("readonly", [ITEMS], (tx) => {
      items = tx.objectStore(ITEMS).getAll();
    });
    return items!.result;
  }

  async get(id: string): Promise<LocalFileRecord | null> {
    let item: IDBRequest<LocalFileRecord | undefined> | undefined;
    await this.run("readonly", [ITEMS], (tx) => {
      item = tx.objectStore(ITEMS).get(id);
    });
    return item!.result ?? null;
  }

  /** Hashes outside the lock; stores bytes once per hash and one record per folder. */
  async add(input: LocalFileInput): Promise<LocalFileAddResult> {
    const hash = await this.hash(input.bytes);
    const result = await this.exclusive(async () => {
      const items = await this.list();
      const existing = items.find(
        (item) => item.hash === hash && item.folder === input.folder && !item.trashedAt,
      );
      const time = this.now();
      if (existing) {
        const record = { ...existing, openedAt: time };
        await this.run("readwrite", [ITEMS], (tx) => tx.objectStore(ITEMS).put(record));
        return { record, deduped: true };
      }
      const blob = await this.blob(hash);
      const backend = blob ? blob.backend : await this.writeBytes(hash, input.bytes);
      const taken = new Set(
        items.filter((item) => item.folder === input.folder && !item.trashedAt).map((i) => i.name),
      );
      const record: LocalFileRecord = {
        id: this.makeId(),
        name: uniqueFileName(input.name, taken),
        type: input.type,
        size: input.bytes.byteLength,
        hash,
        folder: input.folder,
        source: input.source,
        createdAt: time,
        modifiedAt: time,
        openedAt: time,
        label: 0,
        comment: "",
      };
      await this.run("readwrite", [ITEMS, BLOBS], (tx) => {
        tx.objectStore(ITEMS).put(record);
        tx.objectStore(BLOBS).put({
          hash,
          size: input.bytes.byteLength,
          refCount: (blob?.refCount ?? 0) + 1,
          backend,
        } satisfies BlobRecord);
      });
      return { record, deduped: false };
    });
    this.changed();
    return result;
  }

  private async blob(hash: string): Promise<BlobRecord | null> {
    let blob: IDBRequest<BlobRecord | undefined> | undefined;
    await this.run("readonly", [BLOBS], (tx) => {
      blob = tx.objectStore(BLOBS).get(hash);
    });
    return blob!.result ?? null;
  }

  /** Prefer the byte store; fall back to IndexedDB when it is unavailable (e.g. Safari Private). */
  private async writeBytes(hash: string, bytes: Uint8Array): Promise<BlobBackend> {
    if (this.byteStore) {
      try {
        await this.byteStore.write(hash, bytes);
        return BlobBackend.ByteStore;
      } catch (error) {
        if (error instanceof Error && error.name === "QuotaExceededError") throw error;
        this.byteStore.close();
        this.byteStore = undefined;
      }
    }
    await this.run("readwrite", [BYTES], (tx) =>
      tx.objectStore(BYTES).put(new Uint8Array(bytes), hash),
    );
    return BlobBackend.IndexedDb;
  }

  async read(id: string): Promise<Uint8Array> {
    const record = await this.get(id);
    if (!record) throw new Error("The file is no longer in Files.");
    const blob = await this.blob(record.hash);
    if (blob?.backend === BlobBackend.ByteStore && this.byteStore)
      return this.byteStore.read(record.hash);
    let bytes: IDBRequest<Uint8Array | undefined> | undefined;
    await this.run("readonly", [BYTES], (tx) => {
      bytes = tx.objectStore(BYTES).get(record.hash);
    });
    if (!bytes!.result) throw new Error("The file’s contents are missing.");
    return bytes!.result;
  }

  async touch(id: string): Promise<void> {
    await this.mutate([id], (record) => ({ ...record, openedAt: this.now() }));
  }

  async update(id: string, patch: LocalFilePatch): Promise<LocalFileRecord | null> {
    const [updated] = await this.mutate([id], (record, items) => {
      const next = { ...record, ...patch, modifiedAt: this.now() };
      if (patch.name !== undefined && patch.name !== record.name) {
        const taken = new Set(
          items
            .filter((i) => i.id !== id && i.folder === record.folder && !i.trashedAt)
            .map((i) => i.name),
        );
        next.name = uniqueFileName(patch.name, taken);
      }
      return next;
    });
    return updated ?? null;
  }

  async duplicate(id: string): Promise<LocalFileRecord | null> {
    const created = await this.exclusive(async () => {
      const items = await this.list();
      const record = items.find((item) => item.id === id);
      if (!record) return null;
      const blob = await this.blob(record.hash);
      if (!blob) return null;
      const time = this.now();
      const taken = new Set(
        items.filter((i) => i.folder === record.folder && !i.trashedAt).map((i) => i.name),
      );
      const copy: LocalFileRecord = {
        ...record,
        id: this.makeId(),
        name: uniqueFileName(record.name, taken),
        createdAt: time,
        modifiedAt: time,
        openedAt: time,
        trashedAt: undefined,
      };
      await this.run("readwrite", [ITEMS, BLOBS], (tx) => {
        tx.objectStore(ITEMS).put(copy);
        tx.objectStore(BLOBS).put({ ...blob, refCount: blob.refCount + 1 });
      });
      return copy;
    });
    if (created) this.changed();
    return created;
  }

  trash(ids: readonly string[]) {
    return this.mutate(ids, (record) => ({ ...record, trashedAt: this.now() }));
  }

  /** Put Away: restore to the original folder, renaming if a live file took the name. */
  restore(ids: readonly string[]) {
    return this.mutate(ids, (record, items) => {
      const taken = new Set(
        items
          .filter((i) => i.id !== record.id && i.folder === record.folder && !i.trashedAt)
          .map((i) => i.name),
      );
      return { ...record, name: uniqueFileName(record.name, taken), trashedAt: undefined };
    });
  }

  private async mutate(
    ids: readonly string[],
    change: (record: LocalFileRecord, items: readonly LocalFileRecord[]) => LocalFileRecord,
  ): Promise<LocalFileRecord[]> {
    const wanted = new Set(ids);
    const updated = await this.exclusive(async () => {
      const items = await this.list();
      const next = items.filter((item) => wanted.has(item.id)).map((item) => change(item, items));
      if (next.length)
        await this.run("readwrite", [ITEMS], (tx) => {
          for (const record of next) tx.objectStore(ITEMS).put(record);
        });
      return next;
    });
    if (updated.length) this.changed();
    return updated;
  }

  /** Delete trashed records; bytes and thumbnails go when no record refers to them. */
  async emptyTrash(): Promise<number> {
    const removed = await this.exclusive(async () => {
      const items = await this.list();
      return this.removeRecords(items.filter((item) => item.trashedAt));
    });
    if (removed) this.changed();
    return removed;
  }

  /** Remove trashed items older than the given age. */
  async purgeTrash(olderThanMs: number): Promise<number> {
    const cutoff = this.now() - olderThanMs;
    const removed = await this.exclusive(async () => {
      const items = await this.list();
      return this.removeRecords(items.filter((item) => item.trashedAt && item.trashedAt < cutoff));
    });
    if (removed) this.changed();
    return removed;
  }

  private async removeRecords(records: readonly LocalFileRecord[]): Promise<number> {
    if (!records.length) return 0;
    const counts = new Map<string, number>();
    for (const record of records) counts.set(record.hash, (counts.get(record.hash) ?? 0) + 1);
    const orphaned: BlobRecord[] = [];
    for (const [hash, count] of counts) {
      const blob = await this.blob(hash);
      if (blob && blob.refCount - count <= 0) orphaned.push(blob);
    }
    await this.run("readwrite", [ITEMS, BLOBS, BYTES, THUMBNAILS], (tx) => {
      for (const record of records) tx.objectStore(ITEMS).delete(record.id);
      for (const [hash, count] of counts) {
        const request = tx.objectStore(BLOBS).get(hash);
        request.onsuccess = () => {
          const blob = request.result as BlobRecord | undefined;
          if (!blob) return;
          if (blob.refCount - count > 0)
            tx.objectStore(BLOBS).put({ ...blob, refCount: blob.refCount - count });
          else {
            tx.objectStore(BLOBS).delete(hash);
            tx.objectStore(BYTES).delete(hash);
            tx.objectStore(THUMBNAILS).delete(hash);
          }
        };
      }
    });
    for (const blob of orphaned)
      if (blob.backend === BlobBackend.ByteStore)
        await this.byteStore?.remove(blob.hash).catch(() => undefined);
    return records.length;
  }

  async thumbnail(hash: string): Promise<Blob | null> {
    let value: IDBRequest<Blob | undefined> | undefined;
    await this.run("readonly", [THUMBNAILS], (tx) => {
      value = tx.objectStore(THUMBNAILS).get(hash);
    });
    return value!.result ?? null;
  }

  async putThumbnail(hash: string, thumbnail: Blob): Promise<void> {
    await this.run("readwrite", [THUMBNAILS], (tx) =>
      tx.objectStore(THUMBNAILS).put(thumbnail, hash),
    );
  }

  close() {
    this.channel?.close();
    this.byteStore?.close();
    this.database.close();
    this.listeners.clear();
  }
}

export interface StorageEstimateSnapshot {
  usage: number;
  quota: number;
  persisted: boolean;
}

/** Origin-wide usage and quota; null when the browser does not report them. */
export async function readStorageEstimate(): Promise<StorageEstimateSnapshot | null> {
  const storage = typeof navigator === "undefined" ? undefined : navigator.storage;
  if (!storage?.estimate) return null;
  try {
    const { usage = 0, quota = 0 } = await storage.estimate();
    const persisted = (await storage.persisted?.()) ?? false;
    return { usage, quota, persisted };
  } catch {
    return null;
  }
}

/** Ask the browser to keep this origin's storage under pressure; false when refused. */
export async function requestPersistentStorage(): Promise<boolean> {
  const storage = typeof navigator === "undefined" ? undefined : navigator.storage;
  if (!storage?.persist) return false;
  try {
    return (await storage.persisted?.()) || (await storage.persist());
  } catch {
    return false;
  }
}
