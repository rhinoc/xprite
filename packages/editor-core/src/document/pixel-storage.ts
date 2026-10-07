import { MAX_IMAGE_DIMENSION, MAX_IMAGE_PIXELS } from "$/base/image-limits";
import { PixelStorageFormat, type EncodedRgbaPixels, type PixelBuffer } from "$/base/primitives";
import { inflateZlibExact } from "$/base/zlib";

const RGBA_BYTES = 4;
const ZLIB_MIN_BYTES = 6;
export const DECODED_PIXEL_CACHE_BYTES = 32 * 1024 * 1024;
const imageCaches = new WeakMap<EncodedRgbaPixels, DecodedPixelCache>();

/** One bounded cache per imported pixel graph; snapshots and editor containers
 * can share immutable encoded descriptors without retaining another RGBA copy. */
export class DecodedPixelCache {
  private readonly entries = new Map<EncodedRgbaPixels, Uint8ClampedArray>();
  private bytes = 0;
  private last: EncodedRgbaPixels | undefined;
  get residentBytes(): number {
    return this.bytes;
  }
  constructor(private readonly maxBytes = DECODED_PIXEL_CACHE_BYTES) {}
  read(encoded: EncodedRgbaPixels): Uint8ClampedArray {
    const cached = this.entries.get(encoded);
    if (cached) {
      if (this.last !== encoded) {
        this.entries.delete(encoded);
        this.entries.set(encoded, cached);
      }
      this.last = encoded;
      return cached;
    }
    const raw = inflateZlibExact(encoded.bytes, encoded.byteLength);
    const pixels = new Uint8ClampedArray(raw.buffer, raw.byteOffset, raw.byteLength);
    // A single oversized cel is transient, rather than permanently exceeding
    // the cache budget. Renderers hold their data once for the drawing operation.
    if (pixels.byteLength > this.maxBytes) return pixels;
    while (this.bytes + pixels.byteLength > this.maxBytes && this.entries.size) {
      const oldest = this.entries.keys().next().value!;
      this.bytes -= this.entries.get(oldest)!.byteLength;
      this.entries.delete(oldest);
    }
    this.entries.set(encoded, pixels);
    this.last = encoded;
    this.bytes += pixels.byteLength;
    return pixels;
  }
}

export function encodedPixels(image: PixelBuffer): EncodedRgbaPixels | undefined {
  if (!image.encoded) return undefined;
  const data = Object.getOwnPropertyDescriptor(image, "data");
  return data && "value" in data ? undefined : image.encoded;
}

/** Independent cel container; immutable compressed backing is safely shared
 * until editing replaces that container's storage. */
export function cloneStoredPixelBuffer(image: PixelBuffer): PixelBuffer {
  const encoded = encodedPixels(image);
  return encoded
    ? createEncodedPixelBuffer(image.width, image.height, encoded)
    : { width: image.width, height: image.height, data: new Uint8ClampedArray(image.data) };
}

export function assertEncodedPixels(encoded: EncodedRgbaPixels, expected: number): void {
  if (
    encoded.format !== PixelStorageFormat.ZlibRgba ||
    encoded.byteLength !== expected ||
    expected > MAX_IMAGE_PIXELS * RGBA_BYTES ||
    !(encoded.bytes instanceof Uint8Array) ||
    encoded.bytes.byteLength < ZLIB_MIN_BYTES ||
    typeof encoded.hasHiddenRgb !== "boolean"
  )
    throw new RangeError("Invalid encoded pixel buffer");
}

export function createEncodedPixelBuffer(
  width: number,
  height: number,
  encoded: EncodedRgbaPixels,
  cache = imageCaches.get(encoded) ?? new DecodedPixelCache(),
): PixelBuffer {
  if (
    !Number.isSafeInteger(width) ||
    !Number.isSafeInteger(height) ||
    width < 1 ||
    height < 1 ||
    width > MAX_IMAGE_DIMENSION ||
    height > MAX_IMAGE_DIMENSION
  )
    throw new RangeError("Invalid encoded pixel dimensions");
  assertEncodedPixels(encoded, width * height * RGBA_BYTES);
  imageCaches.set(encoded, cache);
  const image = { width, height, encoded } as PixelBuffer;
  Object.defineProperty(image, "data", {
    configurable: true,
    // Structured clone, persistence and memory accounting serialize only the
    // compressed descriptor. Reading data must never be a serialization step.
    enumerable: false,
    get(this: PixelBuffer) {
      imageCaches.set(this.encoded!, cache);
      return cache.read(this.encoded!);
    },
    set(this: PixelBuffer, data: Uint8ClampedArray) {
      delete this.encoded;
      Object.defineProperty(this, "data", {
        value: data,
        enumerable: true,
        configurable: true,
        writable: true,
      });
    },
  });
  return image;
}

/** Reattach accessors at structured-clone/worker/storage boundaries. */
export function hydratePixelStorage<T>(value: T): T {
  const seen = new Set<object>();
  const cache = new DecodedPixelCache();
  const visit = (item: unknown): void => {
    if (
      !item ||
      typeof item !== "object" ||
      seen.has(item) ||
      ArrayBuffer.isView(item) ||
      item instanceof ArrayBuffer
    )
      return;
    seen.add(item);
    const image = item as PixelBuffer;
    if (image.encoded && Number.isSafeInteger(image.width) && Number.isSafeInteger(image.height)) {
      const data = Object.getOwnPropertyDescriptor(item, "data");
      if (data && "value" in data) {
        delete image.encoded;
        return;
      }
      if (!data) {
        const hydrated = createEncodedPixelBuffer(
          image.width,
          image.height,
          image.encoded,
          imageCaches.get(image.encoded) ?? cache,
        );
        Object.defineProperty(item, "data", Object.getOwnPropertyDescriptor(hydrated, "data")!);
      }
      return;
    }
    for (const child of Object.values(item)) visit(child);
  };
  visit(value);
  return value;
}

export function pixelStorageCacheBytes(value: unknown): number {
  const seen = new Set<object>(),
    caches = new Set<DecodedPixelCache>();
  const visit = (item: unknown): void => {
    if (
      !item ||
      typeof item !== "object" ||
      seen.has(item) ||
      ArrayBuffer.isView(item) ||
      item instanceof ArrayBuffer
    )
      return;
    seen.add(item);
    const encoded = encodedPixels(item as PixelBuffer);
    if (encoded) {
      const cache = imageCaches.get(encoded);
      if (cache) caches.add(cache);
      return;
    }
    for (const child of Object.values(item)) visit(child);
  };
  visit(value);
  return [...caches].reduce((sum, cache) => sum + cache.residentBytes, 0);
}
