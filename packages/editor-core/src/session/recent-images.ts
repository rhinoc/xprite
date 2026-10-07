import { cloneGraph } from "$/base/clone";
import type { PixelBuffer } from "$/base/primitives";
import { assertDimension, assertPixelBuffer, assertPixelCount } from "$/document/pixel-validation";
import { cloneEditorProject } from "$/document/project";
import type {
  RecentImageItem,
  SessionProject,
  SessionRecentEntry,
  SessionRecentImage,
  SessionRecentMetadata,
} from "$/session/types";

export interface RecentImageStoreOptions {
  maxBytes?: number;
  maxItems?: number;
  createId?: () => string;
}
interface StoredImage {
  item: RecentImageItem;
  image?: PixelBuffer;
  project?: SessionProject;
  contentVersion: object;
  durable: boolean;
  access: number;
}
/** Count retained backing buffers once, including timeline and source metadata. */
export function recentImageRetainedBytes(value: unknown): number {
  const seen = new Set<object>();
  let bytes = 0;
  const visit = (item: unknown) => {
    if (!item || typeof item !== "object" || seen.has(item)) return;
    seen.add(item);
    if (ArrayBuffer.isView(item)) {
      visit(item.buffer);
      return;
    }
    if (item instanceof ArrayBuffer) {
      bytes += item.byteLength;
      return;
    }
    if (item instanceof Map) {
      for (const [key, child] of item) {
        visit(key);
        visit(child);
      }
      return;
    }
    if (item instanceof Set) {
      for (const child of item) visit(child);
      return;
    }
    for (const child of Object.values(item)) visit(child);
  };
  visit(value);
  return bytes;
}
const clone = (image: PixelBuffer): PixelBuffer => cloneGraph(image);

/** Workspace-shared, platform-neutral recent-image snapshots. No filesystem paths,
 * persistence, DOM, or React enter this store. Sessions decide when to record a snapshot. */
export class RecentImageStore {
  private entries: StoredImage[] = [];
  private bytes = 0;
  private sequence = 0;
  private cacheSequence = 0;
  private readonly maxBytes: number;
  private maxItems: number;
  private readonly createId?: () => string;
  constructor(options: RecentImageStoreOptions = {}) {
    this.createId = options.createId;
    this.maxBytes = options.maxBytes ?? 32 * 1024 * 1024;
    this.maxItems = options.maxItems ?? 8;
    if (!Number.isSafeInteger(this.maxBytes) || this.maxBytes < 0)
      throw new RangeError("Recent image byte budget must be a non-negative safe integer");
    if (!Number.isSafeInteger(this.maxItems) || this.maxItems < 0)
      throw new RangeError("Recent image count must be a non-negative safe integer");
  }
  setLimit(maxItems: number): void {
    if (!Number.isSafeInteger(maxItems) || maxItems < 0)
      throw new RangeError("Recent image count must be a non-negative safe integer");
    this.maxItems = maxItems;
    while (this.entries.length > maxItems) {
      const removed = this.entries.pop()!;
      if (removed.image) this.bytes -= removed.item.bytes;
    }
  }
  /** Returns null when recents are disabled. Pending snapshots remain available until persisted.
   * An existing exact name is replaced by default. Explicit IDs update that record; null creates a distinct file even when names match. */
  record(
    image: PixelBuffer,
    name: string,
    identity?: string | null,
    project?: SessionProject,
    contentVersion: object = {},
  ): string | null {
    return this.recordSnapshot(image, name, identity, project, contentVersion, true);
  }
  /** Adopt a detached immutable save snapshot. The caller and persistence ports must
   * never mutate or transfer its buffers after acceptance. Mutable documents use record(). */
  recordImmutable(
    image: PixelBuffer,
    name: string,
    identity?: string | null,
    project?: SessionProject,
    contentVersion: object = {},
  ): string | null {
    return this.recordSnapshot(image, name, identity, project, contentVersion, false);
  }
  private recordSnapshot(
    image: PixelBuffer,
    name: string,
    identity: string | null | undefined,
    project: SessionProject | undefined,
    contentVersion: object,
    copy: boolean,
  ): string | null {
    assertPixelBuffer(image);
    if (!this.maxItems || !this.maxBytes) return null;
    const stored = copy ? cloneGraph({ image, project }) : { image, project };
    const bytes = recentImageRetainedBytes(stored);
    const previousIndex =
      identity === null
        ? -1
        : this.entries.findIndex((entry) =>
            identity === undefined ? entry.item.name === name : entry.item.id === identity,
          );
    const previous = previousIndex < 0 ? null : this.entries.splice(previousIndex, 1)[0];
    if (previous?.image) this.bytes -= previous.item.bytes;
    let id = previous?.item.id ?? (typeof identity === "string" ? identity : this.nextIdentity());
    while (!previous && identity == null && this.entries.some((entry) => entry.item.id === id))
      id = this.nextIdentity();
    const sequence = /^recent-(\d+)$/.exec(id);
    if (sequence) this.sequence = Math.max(this.sequence, Number(sequence[1]));
    this.entries.unshift({
      item: { id, name, width: image.width, height: image.height, bytes },
      image: stored.image,
      durable: false,
      access: ++this.cacheSequence,
      contentVersion,
      ...(stored.project ? { project: stored.project } : {}),
    });
    this.bytes += bytes;
    while (this.entries.length > this.maxItems) {
      const removed = this.entries.pop()!;
      if (removed.image) this.bytes -= removed.item.bytes;
    }
    this.trimMemory();
    return id;
  }
  /** Newest-first metadata, copied so callers cannot mutate store state. */
  getList(): readonly RecentImageItem[] {
    return this.entries.map(({ item }) => ({ ...item }));
  }
  /** Capture ordered immutable storage snapshots without copying full projects.
   * Entries are replaced, never mutated; queued writes retain their old version.
   * This borrowed view is for persistence ports only. Editing reads stay owned. */
  getPersistenceSnapshot(): readonly SessionRecentEntry[] {
    return this.entries.map(({ item, image, project, contentVersion }) =>
      image
        ? {
            id: item.id,
            name: item.name,
            image,
            ...(project ? { project } : {}),
            contentVersion,
          }
        : { ...item, contentVersion },
    );
  }
  /** Install only the lightweight durable catalog, retaining any locally recorded content. */
  restoreCatalog(items: readonly SessionRecentMetadata[]): void {
    for (const item of items) {
      if (this.entries.some((entry) => entry.item.id === item.id)) continue;
      this.entries.push({
        item: {
          id: item.id,
          name: item.name,
          width: item.width,
          height: item.height,
          bytes: item.bytes,
        },
        contentVersion: item.contentVersion,
        durable: true,
        access: 0,
      });
      const sequence = /^recent-(\d+)$/.exec(item.id);
      if (sequence) this.sequence = Math.max(this.sequence, Number(sequence[1]));
    }
    this.setLimit(this.maxItems);
  }
  /** Cache caller-owned storage output only while the same durable version is still listed. */
  cache(snapshot: SessionRecentImage): boolean {
    const entry = this.entries.find((entry) => entry.item.id === snapshot.id);
    if (!entry || entry.contentVersion !== snapshot.contentVersion) return false;
    assertPixelBuffer(snapshot.image);
    entry.access = ++this.cacheSequence;
    if (entry.image) return true;
    if (
      recentImageRetainedBytes({ image: snapshot.image, project: snapshot.project }) > this.maxBytes
    )
      return true;
    const owned = cloneGraph({ image: snapshot.image, project: snapshot.project });
    const bytes = recentImageRetainedBytes(owned);
    if (bytes > this.maxBytes) return true;
    entry.image = owned.image;
    entry.project = owned.project;
    entry.item = { ...entry.item, bytes };
    this.bytes += bytes;
    this.trimMemory();
    return true;
  }
  confirmPersistence(snapshot: readonly SessionRecentEntry[]): void {
    for (const saved of snapshot) {
      const entry = this.entries.find((entry) => entry.item.id === saved.id);
      if (entry && entry.contentVersion === saved.contentVersion) entry.durable = true;
    }
    this.trimMemory();
  }
  private trimMemory(): void {
    const resident = this.entries
      .filter((entry) => entry.image && entry.durable)
      .sort((a, b) => a.access - b.access);
    for (const entry of resident) {
      if (this.bytes <= this.maxBytes) break;
      this.bytes -= entry.item.bytes;
      entry.image = undefined;
      entry.project = undefined;
    }
  }
  /** Reading does not reorder history; returned pixels are caller-owned. */
  read(id: string): PixelBuffer | null {
    const found = this.entries.find((entry) => entry.item.id === id);
    if (!found?.image) return null;
    found.access = ++this.cacheSequence;
    return clone(found.image);
  }
  /** Read the complete Aseprite project associated with a recent image. */
  readProject(id: string): SessionProject | null {
    const found = this.entries.find((entry) => entry.item.id === id);
    if (!found?.project) return null;
    found.access = ++this.cacheSequence;
    return cloneEditorProject(found.project);
  }
  private nextIdentity(): string {
    return `recent-${this.createId ? this.createId() : ++this.sequence}`;
  }

  /** Remove a browser-owned snapshot by identity without touching its source file. */
  remove(id: string): void {
    const index = this.entries.findIndex((entry) => entry.item.id === id);
    if (index < 0) return;
    const [removed] = this.entries.splice(index, 1);
    if (removed.image) this.bytes -= removed.item.bytes;
  }

  /** Remove every in-memory recent snapshot while keeping IDs monotonic for
   * documents that are still open and may be saved again later. */
  clear() {
    this.entries = [];
    this.bytes = 0;
  }
}

/** Transparent RGBA document using the same allocation policy as image import. */
export function createBlankImage(width: number, height: number): PixelBuffer {
  assertDimension(width, "width");
  assertDimension(height, "height");
  assertPixelCount(width, height);
  return { width, height, data: new Uint8ClampedArray(width * height * 4) };
}
