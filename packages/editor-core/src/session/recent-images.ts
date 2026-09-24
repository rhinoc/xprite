import { cloneGraph } from "$/base/clone";
import type { PixelBuffer } from "$/base/primitives";
import { assertDimension, assertPixelBuffer, assertPixelCount } from "$/document/pixel-validation";
import { cloneEditorProject } from "$/document/project";
import type { RecentImageItem, SessionProject } from "$/session/types";

export interface RecentImageStoreOptions {
  maxBytes?: number;
  maxItems?: number;
  createId?: () => string;
}
interface StoredImage {
  item: RecentImageItem;
  image: PixelBuffer;
  project?: SessionProject;
}
const clone = (image: PixelBuffer): PixelBuffer => cloneGraph(image);

/** Workspace-shared, platform-neutral recent-image snapshots. No filesystem paths,
 * persistence, DOM, or React enter this store. Sessions decide when to record a snapshot. */
export class RecentImageStore {
  private entries: StoredImage[] = [];
  private bytes = 0;
  private sequence = 0;
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
      this.bytes -= removed.item.bytes;
    }
  }
  /** Returns null for an image that cannot fit. Existing entries remain intact.
   * An existing exact name is replaced by default. Explicit IDs update that record; null creates a distinct file even when names match. */
  record(
    image: PixelBuffer,
    name: string,
    identity?: string | null,
    project?: SessionProject,
  ): string | null {
    assertPixelBuffer(image);
    const bytes = image.data.byteLength;
    if (!this.maxItems || bytes > this.maxBytes) return null;
    const stored = clone(image); // Do not evict anything unless the copy succeeds.
    const previousIndex =
      identity === null
        ? -1
        : this.entries.findIndex((entry) =>
            identity === undefined ? entry.item.name === name : entry.item.id === identity,
          );
    const previous = previousIndex < 0 ? null : this.entries.splice(previousIndex, 1)[0];
    if (previous) this.bytes -= previous.item.bytes;
    let id = previous?.item.id ?? (typeof identity === "string" ? identity : this.nextIdentity());
    while (!previous && identity == null && this.entries.some((entry) => entry.item.id === id))
      id = this.nextIdentity();
    const sequence = /^recent-(\d+)$/.exec(id);
    if (sequence) this.sequence = Math.max(this.sequence, Number(sequence[1]));
    this.entries.unshift({
      item: { id, name, width: image.width, height: image.height, bytes },
      image: stored,
      ...(project ? { project: cloneEditorProject(project) } : {}),
    });
    this.bytes += bytes;
    while (this.entries.length > this.maxItems || this.bytes > this.maxBytes) {
      const removed = this.entries.pop()!;
      this.bytes -= removed.item.bytes;
    }
    return id;
  }
  /** Newest-first metadata, copied so callers cannot mutate store state. */
  getList(): readonly RecentImageItem[] {
    return this.entries.map(({ item }) => ({ ...item }));
  }
  /** Reading does not reorder history; returned pixels are caller-owned. */
  read(id: string): PixelBuffer | null {
    const found = this.entries.find((entry) => entry.item.id === id);
    return found ? clone(found.image) : null;
  }
  /** Read the complete Aseprite project associated with a recent image. */
  readProject(id: string): SessionProject | null {
    const found = this.entries.find((entry) => entry.item.id === id);
    return found?.project ? cloneEditorProject(found.project) : null;
  }
  private nextIdentity(): string {
    return `recent-${this.createId ? this.createId() : ++this.sequence}`;
  }

  /** Remove a browser-owned snapshot by identity without touching its source file. */
  remove(id: string): void {
    const index = this.entries.findIndex((entry) => entry.item.id === id);
    if (index < 0) return;
    const [removed] = this.entries.splice(index, 1);
    this.bytes -= removed.item.bytes;
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
