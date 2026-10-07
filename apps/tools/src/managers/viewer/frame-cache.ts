import type { PixelBuffer } from "@xprite/editor-core/base";

const MAX_FRAME_CACHE_BYTES = 64 * 1024 * 1024;
const MAX_CACHED_FRAMES = 8;

/** LRU for immutable rendered frames. One instance belongs to one immutable
 * imported project, including its palette, profile and layer composition
 * policy. A new project must clear the cache before rendering. */
export class ViewerFrameCache {
  private readonly frames = new Map<string, PixelBuffer>();
  private bytes = 0;

  constructor(
    private readonly maxBytes = MAX_FRAME_CACHE_BYTES,
    private readonly maxFrames = MAX_CACHED_FRAMES,
  ) {}

  clear(): void {
    this.frames.clear();
    this.bytes = 0;
  }

  get(frame: number, visibility: string): PixelBuffer | undefined {
    const key = this.key(frame, visibility);
    const pixels = this.frames.get(key);
    if (pixels) {
      this.frames.delete(key);
      this.frames.set(key, pixels);
    }
    return pixels;
  }

  set(frame: number, visibility: string, pixels: PixelBuffer): void {
    if (pixels.data.byteLength > this.maxBytes || this.maxFrames < 1) return;
    const key = this.key(frame, visibility);
    const previous = this.frames.get(key);
    if (previous) {
      this.bytes -= previous.data.byteLength;
      this.frames.delete(key);
    }
    while (
      this.frames.size &&
      (this.frames.size >= this.maxFrames || this.bytes + pixels.data.byteLength > this.maxBytes)
    ) {
      const oldest = this.frames.keys().next().value!;
      this.bytes -= this.frames.get(oldest)!.data.byteLength;
      this.frames.delete(oldest);
    }
    this.frames.set(key, pixels);
    this.bytes += pixels.data.byteLength;
  }

  private key(frame: number, visibility: string): string {
    return `${frame}:${visibility}`;
  }
}
