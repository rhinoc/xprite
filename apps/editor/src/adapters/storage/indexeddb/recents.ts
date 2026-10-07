import type { PackedRecentSnapshot } from "$/adapters/workers/recent-snapshot";
import {
  RecoveryCodecClient,
  RecoveryCodecSnapshotOwnership,
} from "$/adapters/workers/recovery-codec-client";
import { randomId } from "@xprite/bedrock/browser/runtime-crypto";
import { assertPixelBuffer } from "@xprite/editor-core";
import { cloneGraph, type PixelBuffer } from "@xprite/editor-core/base";
import {
  type SessionRecentEntry,
  type SessionRecentImage,
  type SessionRecentMetadata,
} from "@xprite/editor-core/session";

export interface IndexedDbRecentImagesOptions {
  databaseName?: string;
  factory?: IDBFactory;
}
export interface RecentImageMetadata {
  id: string;
  name: string;
  order: number;
  width: number;
  height: number;
  generation: string;
  hasProject: boolean;
}
interface StoredPayload extends PackedRecentSnapshot {
  id: string;
  generation: string;
}
interface StoredThumbnail extends PixelBuffer {
  id: string;
}
interface SavedVersion {
  token: object;
  generation: string;
}
const CATALOG = "recents";
const IMAGES = "images";
const PROJECTS = "projects";
const THUMBNAILS = "thumbnails";
const STORES = [CATALOG, IMAGES, PROJECTS, THUMBNAILS];
const DATABASE_VERSION = 1;
const THUMBNAIL_EXTENT = 128;
const RGBA_CHANNELS = 4;
const CATALOG_READ_ATTEMPTS = 2;
export const DEFAULT_RECENT_DATABASE_NAME = "xse.idb.recents.v2";

function thumbnail(id: string, image: PixelBuffer): StoredThumbnail {
  const scale = Math.min(1, THUMBNAIL_EXTENT / Math.max(image.width, image.height));
  const width = Math.max(1, Math.round(image.width * scale));
  const height = Math.max(1, Math.round(image.height * scale));
  const data = new Uint8ClampedArray(width * height * RGBA_CHANNELS);
  for (let y = 0; y < height; y++) {
    const sy = Math.floor(((y + 0.5) * image.height) / height);
    for (let x = 0; x < width; x++) {
      const sx = Math.floor(((x + 0.5) * image.width) / width);
      const offset = (sy * image.width + sx) * RGBA_CHANNELS;
      data.set(
        image.data.subarray(offset, offset + RGBA_CHANNELS),
        (y * width + x) * RGBA_CHANNELS,
      );
    }
  }
  return { id, width, height, data };
}
function sameMetadata(left: RecentImageMetadata, right: RecentImageMetadata): boolean {
  return (
    left.id === right.id &&
    left.name === right.name &&
    left.order === right.order &&
    left.width === right.width &&
    left.height === right.height &&
    left.generation === right.generation &&
    left.hasProject === right.hasProject
  );
}

/** Ordered metadata, thumbnails, exact RGBA and full projects have independent stores.
 * Accepted writes are serialized and publish all changes in one transaction. */
export class IndexedDbRecentImages {
  readonly databaseName: string;
  private readonly factory: IDBFactory | undefined;
  private writes: Promise<void> = Promise.resolve();
  private versions = new Map<string, SavedVersion>();
  private catalogRevision = 0;
  private codec?: RecoveryCodecClient;
  private closed = false;
  constructor(options: IndexedDbRecentImagesOptions = {}) {
    this.databaseName = options.databaseName ?? DEFAULT_RECENT_DATABASE_NAME;
    this.factory = options.factory ?? (typeof indexedDB === "undefined" ? undefined : indexedDB);
  }
  private getCodec(): RecoveryCodecClient {
    return (this.codec ??= new RecoveryCodecClient());
  }
  private open(): Promise<IDBDatabase> {
    return new Promise((resolve, reject) => {
      if (!this.factory) {
        reject(new Error("IndexedDB is unavailable; recent files cannot persist in this browser."));
        return;
      }
      let abandoned = false;
      const request = this.factory.open(this.databaseName, DATABASE_VERSION);
      request.onupgradeneeded = () => {
        for (const name of STORES) request.result.createObjectStore(name, { keyPath: "id" });
      };
      request.onerror = () =>
        reject(request.error ?? new Error("Cannot open recent-file storage."));
      request.onblocked = () => {
        abandoned = true;
        reject(new Error("Recent-file storage is blocked by another open browser tab."));
      };
      request.onsuccess = () => {
        if (abandoned) request.result.close();
        else resolve(request.result);
      };
    });
  }
  private metadata(db: IDBDatabase): Promise<RecentImageMetadata[]> {
    return new Promise((resolve, reject) => {
      const tx = db.transaction(CATALOG, "readonly");
      const request = tx.objectStore(CATALOG).getAll();
      tx.oncomplete = () => resolve(request.result as RecentImageMetadata[]);
      tx.onerror = () => reject(tx.error ?? new Error("Cannot read recent files."));
      tx.onabort = () => reject(tx.error ?? new Error("Recent-file read aborted."));
    });
  }
  /** Read the list without loading pixel buffers or decoding projects. */
  async list(): Promise<readonly SessionRecentMetadata[]> {
    for (let attempt = 0; attempt < CATALOG_READ_ATTEMPTS; attempt++) {
      if (this.closed) throw new Error("Recent-file storage is closed");
      await this.writes;
      if (this.closed) throw new Error("Recent-file storage is closed");
      const revision = this.catalogRevision;
      const db = await this.open();
      try {
        const records = await this.metadata(db);
        if (this.closed) throw new Error("Recent-file storage is closed");
        // A delete/clear may commit after this read captured its catalog. Retry
        // the lightweight directory rather than returning entries it removed.
        if (revision !== this.catalogRevision) continue;
        return records
          .sort((a, b) => a.order - b.order)
          .map((record) => {
            const saved = this.versions.get(record.id);
            const token = saved?.generation === record.generation ? saved.token : {};
            this.versions.set(record.id, { token, generation: record.generation });
            return {
              id: record.id,
              name: record.name,
              width: record.width,
              height: record.height,
              bytes: record.width * record.height * RGBA_CHANNELS,
              contentVersion: token,
            };
          });
      } finally {
        db.close();
      }
    }
    throw new Error("Recent files changed while listing. Retry loading the recent list.");
  }
  async readThumbnail(id: string): Promise<PixelBuffer | null> {
    if (this.closed) throw new Error("Recent-file storage is closed");
    await this.writes;
    const db = await this.open();
    try {
      const record = await new Promise<StoredThumbnail | undefined>((resolve, reject) => {
        const tx = db.transaction(THUMBNAILS, "readonly");
        const request = tx.objectStore(THUMBNAILS).get(id);
        tx.oncomplete = () => resolve(request.result as StoredThumbnail | undefined);
        tx.onerror = () => reject(tx.error ?? new Error("Cannot read recent thumbnail."));
        tx.onabort = () => reject(tx.error ?? new Error("Recent-thumbnail read aborted."));
      });
      if (!record) return null;
      const { width, height, data } = record;
      const image = { width, height, data };
      assertPixelBuffer(image);
      return image;
    } finally {
      db.close();
    }
  }
  private payloads(
    db: IDBDatabase,
    record: RecentImageMetadata,
  ): Promise<{
    image: StoredPayload;
    project?: StoredPayload;
  }> {
    return new Promise((resolve, reject) => {
      const tx = db.transaction([IMAGES, PROJECTS], "readonly");
      const image = tx.objectStore(IMAGES).get(record.id);
      const project = tx.objectStore(PROJECTS).get(record.id);
      tx.oncomplete = () => {
        const pixels = image.result as StoredPayload | undefined;
        const fullProject = project.result as StoredPayload | undefined;
        if (
          !pixels ||
          pixels.generation !== record.generation ||
          (record.hasProject && (!fullProject || fullProject.generation !== record.generation))
        ) {
          reject(new Error("A recent-file snapshot is missing or changed while reading."));
          return;
        }
        resolve({ image: pixels, ...(record.hasProject ? { project: fullProject } : {}) });
      };
      tx.onerror = () => reject(tx.error ?? new Error("Cannot read recent-file pixels."));
      tx.onabort = () => reject(tx.error ?? new Error("Recent-file read aborted."));
    });
  }
  async read(id: string): Promise<SessionRecentImage | null> {
    if (this.closed) throw new Error("Recent-file storage is closed");
    await this.writes;
    if (this.closed) throw new Error("Recent-file storage is closed");
    const revision = this.catalogRevision;
    const db = await this.open();
    try {
      const record = (await this.metadata(db)).find((item) => item.id === id);
      if (this.closed) throw new Error("Recent-file storage is closed");
      if (!record) return null;
      const saved = this.versions.get(id);
      const contentVersion = saved?.generation === record.generation ? saved.token : {};
      // Register the captured version before unpack yields. Later writes/clear own
      // the version map; completing this read must never republish its old token.
      if (revision === this.catalogRevision)
        this.versions.set(id, { token: contentVersion, generation: record.generation });
      const payload = await this.payloads(db, record);
      const snapshot = await this.getCodec().unpackRecent(payload.image);
      if (!(snapshot.rgba instanceof ArrayBuffer))
        throw new Error("A stored recent image has invalid pixels.");
      const image = {
        width: snapshot.width,
        height: snapshot.height,
        data: new Uint8ClampedArray(snapshot.rgba),
      };
      assertPixelBuffer(image);
      const project = payload.project
        ? (await this.getCodec().unpackRecent(payload.project)).project
        : undefined;
      if (record.hasProject && !project) throw new Error("A stored recent project is missing.");
      if (project) assertPixelBuffer(project.image);
      if (this.closed) throw new Error("Recent-file storage is closed");
      const current = this.versions.get(id);
      if (current?.generation !== record.generation || current.token !== contentVersion)
        return null;
      return { id, name: record.name, image, ...(project ? { project } : {}), contentVersion };
    } finally {
      db.close();
    }
  }
  save(images: readonly SessionRecentEntry[]): Promise<void> {
    if (this.closed) return Promise.reject(new Error("Recent-file storage is closed"));
    // Versioned store entries are immutable. Capture unversioned callers now,
    // before a queued write yields; never detach a document or undo buffer.
    const snapshot = images.map((item) => (item.contentVersion ? { ...item } : cloneGraph(item)));
    const write = this.writes.then(() => this.saveOnce(snapshot));
    this.writes = write.catch(() => {});
    return write;
  }
  private async saveOnce(images: readonly SessionRecentEntry[]): Promise<void> {
    if (
      new Set(images.map((image) => image.id)).size !== images.length ||
      images.some(
        (image) => typeof image.id !== "string" || !image.id || typeof image.name !== "string",
      )
    )
      throw new Error("Recent file identities must be unique non-empty strings.");
    for (const entry of images) {
      if (!("image" in entry)) continue;
      assertPixelBuffer(entry.image);
      if (entry.project) assertPixelBuffer(entry.project.image);
    }
    const db = await this.open();
    try {
      const previous = await this.metadata(db);
      const byId = new Map(previous.map((record) => [record.id, record]));
      const records: RecentImageMetadata[] = [];
      const changed: {
        image: StoredPayload;
        project?: StoredPayload;
        thumbnail: StoredThumbnail;
      }[] = [];
      const versions = new Map<string, SavedVersion>();
      for (const [order, item] of images.entries()) {
        const { id, name, contentVersion } = item;
        const old = byId.get(id);
        const saved = this.versions.get(id);
        const unchanged =
          contentVersion !== undefined &&
          saved !== undefined &&
          old !== undefined &&
          saved.token === contentVersion &&
          old.generation === saved.generation;
        if (!("image" in item)) {
          if (!unchanged)
            throw new Error(
              "An unloaded recent file changed or is missing. Reload the recent list before saving.",
            );
          records.push({ ...old, name, order });
          versions.set(id, saved);
          continue;
        }
        const { image, project } = item;
        const generation = unchanged ? saved.generation : randomId();
        records.push({
          id,
          name,
          order,
          width: image.width,
          height: image.height,
          generation,
          hasProject: !!project,
        });
        versions.set(id, { token: contentVersion ?? {}, generation });
        if (unchanged) continue;
        const pixels = await this.getCodec().packRecent(
          {
            width: image.width,
            height: image.height,
            rgba: new Uint8ClampedArray(image.data).buffer,
          },
          RecoveryCodecSnapshotOwnership.Immutable,
        );
        const fullProject = project
          ? await this.getCodec().packRecent(
              {
                width: image.width,
                height: image.height,
                rgba: new ArrayBuffer(0),
                project,
              },
              RecoveryCodecSnapshotOwnership.Immutable,
            )
          : undefined;
        changed.push({
          image: { id, generation, ...pixels },
          ...(fullProject ? { project: { id, generation, ...fullProject } } : {}),
          thumbnail: thumbnail(id, image),
        });
      }
      const ids = new Set(records.map((record) => record.id));
      await new Promise<void>((resolve, reject) => {
        const tx = db.transaction(STORES, "readwrite");
        const catalog = tx.objectStore(CATALOG);
        const request = catalog.getAll();
        let conflict = false;
        request.onsuccess = () => {
          const current = request.result as RecentImageMetadata[];
          // Packing runs outside the transaction. Do not publish against a catalog
          // changed by another tab in the meantime, or overwrite its pixels silently.
          if (
            current.length !== previous.length ||
            current.some((record) => {
              const expected = byId.get(record.id);
              return !expected || !sameMetadata(record, expected);
            })
          ) {
            conflict = true;
            tx.abort();
            return;
          }
          for (const old of previous)
            if (!ids.has(old.id)) for (const store of STORES) tx.objectStore(store).delete(old.id);
          for (const record of records) {
            const old = byId.get(record.id);
            if (!old || !sameMetadata(old, record)) catalog.put(record);
          }
          for (const payload of changed) {
            tx.objectStore(IMAGES).put(payload.image);
            tx.objectStore(THUMBNAILS).put(payload.thumbnail);
            if (payload.project) tx.objectStore(PROJECTS).put(payload.project);
            else tx.objectStore(PROJECTS).delete(payload.image.id);
          }
        };
        tx.oncomplete = () => resolve();
        tx.onerror = () => reject(tx.error ?? new Error("Cannot persist recent files."));
        tx.onabort = () =>
          reject(
            conflict
              ? new Error("Recent files changed in another tab. Retry saving the document.")
              : (tx.error ?? new Error("Recent-file write aborted.")),
          );
      });
      // Failed transactions leave the last committed content versions intact.
      this.versions = versions;
      this.catalogRevision++;
    } finally {
      db.close();
    }
  }
  close(): void {
    if (this.closed) return;
    this.closed = true;
    this.catalogRevision++;
    void this.writes.then(() => {
      this.versions.clear();
      this.codec?.close();
    });
  }
}
