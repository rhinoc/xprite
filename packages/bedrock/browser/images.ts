export interface RgbaImageData {
  width: number;
  height: number;
  data: Uint8ClampedArray;
}

/** Conservative limits used before allocating a canvas or an RGBA buffer. */
export const DEFAULT_IMAGE_MAX_DIMENSION = 16_384;
export const DEFAULT_IMAGE_MAX_PIXELS = 67_108_864;

export interface ImageDecodeOptions {
  /** Maximum width or height. Defaults to {@link DEFAULT_IMAGE_MAX_DIMENSION}. */
  maxDimension?: number;
  /** Optional independent width limit. */
  maxWidth?: number;
  /** Optional independent height limit. */
  maxHeight?: number;
  /** Maximum number of pixels. Defaults to {@link DEFAULT_IMAGE_MAX_PIXELS}. */
  maxPixels?: number;
}

/** Error raised when an image would exceed the browser adapter's allocation limits. */
export class ImageDimensionError extends Error {
  readonly width: number;
  readonly height: number;

  constructor(width: number, height: number, message: string) {
    super(message);
    this.name = "ImageDimensionError";
    this.width = width;
    this.height = height;
  }
}

type CanvasSurface = HTMLCanvasElement | OffscreenCanvas;
type Canvas2dContext = CanvasRenderingContext2D | OffscreenCanvasRenderingContext2D;

function describeError(error: unknown): string {
  if (error instanceof Error && error.message) return error.message;
  if (typeof error === "string") return error;
  return "unknown browser error";
}

function revokeObjectUrl(url: string): void {
  if (typeof URL !== "undefined" && typeof URL.revokeObjectURL === "function") {
    URL.revokeObjectURL(url);
  }
}

function limitsFor(options: ImageDecodeOptions): Required<ImageDecodeOptions> {
  const maxDimension = options.maxDimension ?? DEFAULT_IMAGE_MAX_DIMENSION;
  const maxWidth = options.maxWidth ?? maxDimension;
  const maxHeight = options.maxHeight ?? maxDimension;
  const maxPixels = options.maxPixels ?? DEFAULT_IMAGE_MAX_PIXELS;
  for (const [name, value] of Object.entries({
    maxDimension,
    maxWidth,
    maxHeight,
    maxPixels,
  })) {
    if (!Number.isSafeInteger(value) || value < 1) {
      throw new RangeError(`${name} must be a positive safe integer`);
    }
  }
  return { maxDimension, maxWidth, maxHeight, maxPixels };
}

function assertImageDimensions(
  width: number,
  height: number,
  options: ImageDecodeOptions = {},
): void {
  if (!Number.isSafeInteger(width) || !Number.isSafeInteger(height) || width < 1 || height < 1) {
    throw new ImageDimensionError(
      width,
      height,
      `Decoded image has invalid dimensions ${width} × ${height}`,
    );
  }
  const limits = limitsFor(options);
  const pixels = width * height;
  if (
    width > limits.maxDimension ||
    height > limits.maxDimension ||
    width > limits.maxWidth ||
    height > limits.maxHeight ||
    pixels > limits.maxPixels
  ) {
    throw new ImageDimensionError(
      width,
      height,
      `Decoded image ${width} × ${height} exceeds the configured limit ` +
        `${limits.maxWidth} × ${limits.maxHeight} (${limits.maxPixels} pixels)`,
    );
  }
}

function createCanvas(width: number, height: number): CanvasSurface {
  const OffscreenCanvasConstructor = globalThis.OffscreenCanvas;
  if (typeof OffscreenCanvasConstructor === "function") {
    return new OffscreenCanvasConstructor(width, height);
  }
  if (typeof document !== "undefined" && typeof document.createElement === "function") {
    const canvas = document.createElement("canvas");
    canvas.width = width;
    canvas.height = height;
    return canvas;
  }
  throw new Error("This browser does not provide a canvas for image decoding or encoding");
}

function context2d(canvas: CanvasSurface, purpose: "decode" | "encode"): Canvas2dContext {
  let context: Canvas2dContext | null = null;
  try {
    context = canvas.getContext("2d", {
      willReadFrequently: purpose === "decode",
    }) as Canvas2dContext | null;
  } catch {
    // Older canvas implementations reject the options dictionary.
    context = canvas.getContext("2d") as Canvas2dContext | null;
  }
  if (!context)
    throw new Error(`This browser could not create a 2D canvas context for image ${purpose}`);
  return context;
}

function sourceDimensions(source: CanvasImageSource): {
  width: number;
  height: number;
} {
  const candidate = source as CanvasImageSource & {
    width?: number;
    height?: number;
    naturalWidth?: number;
    naturalHeight?: number;
  };
  const width = candidate.naturalWidth || candidate.width || 0;
  const height = candidate.naturalHeight || candidate.height || 0;
  return { width, height };
}

function rasterize(source: CanvasImageSource, options: ImageDecodeOptions): RgbaImageData {
  const { width, height } = sourceDimensions(source);
  assertImageDimensions(width, height, options);
  const canvas = createCanvas(width, height);
  const context = context2d(canvas, "decode");
  try {
    context.imageSmoothingEnabled = false;
    context.drawImage(source, 0, 0, width, height);
    const pixels = context.getImageData(0, 0, width, height).data;
    return { width, height, data: new Uint8ClampedArray(pixels) };
  } catch (error) {
    if (error instanceof ImageDimensionError) throw error;
    throw new Error(`Could not read decoded image pixels: ${describeError(error)}`);
  }
}

function loadImageFallback(blob: Blob): Promise<HTMLImageElement> {
  if (typeof URL === "undefined" || typeof URL.createObjectURL !== "function") {
    return Promise.reject(new Error("Image decoding fallback needs URL.createObjectURL"));
  }
  const source = URL.createObjectURL(blob);
  let image: HTMLImageElement;
  try {
    if (typeof Image === "function") image = new Image();
    else if (typeof document !== "undefined") image = document.createElement("img");
    else throw new Error("Image decoding fallback needs the browser Image element");
  } catch (error) {
    revokeObjectUrl(source);
    return Promise.reject(error);
  }
  return new Promise<HTMLImageElement>((resolve, reject) => {
    image.onload = () => resolve(image);
    image.onerror = () =>
      reject(new Error("The browser Image element could not decode the image blob"));
    try {
      image.src = source;
    } catch (error) {
      reject(error);
    }
  }).finally(() => {
    revokeObjectUrl(source);
  });
}

/** Decode a browser image Blob into straight RGBA pixel data. */
export async function decodeImageBlob(
  blob: Blob,
  options: ImageDecodeOptions = {},
): Promise<RgbaImageData> {
  if (!(blob instanceof Blob)) throw new TypeError("decodeImageBlob expects a Blob");
  // Validate option values even when the preferred decoder is unavailable.
  limitsFor(options);
  const bitmapDecoder = globalThis.createImageBitmap;
  let bitmapError: unknown;
  if (typeof bitmapDecoder === "function") {
    try {
      const bitmap = await bitmapDecoder(blob);
      try {
        return rasterize(bitmap, options);
      } finally {
        bitmap.close?.();
      }
    } catch (error) {
      if (error instanceof ImageDimensionError) throw error;
      bitmapError = error;
    }
  }

  try {
    return rasterize(await loadImageFallback(blob), options);
  } catch (fallbackError) {
    const details = bitmapError
      ? ` createImageBitmap failed: ${describeError(bitmapError)}; fallback failed: ${describeError(fallbackError)}`
      : ` ${describeError(fallbackError)}`;
    throw new Error(`Unable to decode image blob${blob.type ? ` (${blob.type})` : ""}.${details}`);
  }
}

export function validateRgbaImage(pixels: RgbaImageData): void {
  if (!pixels || !Number.isSafeInteger(pixels.width) || !Number.isSafeInteger(pixels.height)) {
    throw new TypeError("PNG encoding expects an RGBA image with integer dimensions");
  }
  assertImageDimensions(pixels.width, pixels.height);
  const expected = pixels.width * pixels.height * 4;
  if (!pixels.data || pixels.data.length !== expected) {
    throw new TypeError(
      `PNG encoding expects ${expected} RGBA bytes, received ${pixels.data?.length ?? 0}`,
    );
  }
}

export enum ImageEncodingFormat {
  Png = "image/png",
  Jpeg = "image/jpeg",
  Webp = "image/webp",
}

/** Encode straight RGBA pixels. Unsupported MIME types must not silently become PNG. */
export async function encodeImageBlob(
  pixels: RgbaImageData,
  format: ImageEncodingFormat,
  quality?: number,
): Promise<Blob> {
  validateRgbaImage(pixels);
  if (!Object.values(ImageEncodingFormat).includes(format))
    throw new RangeError("Unsupported image encoding format");
  if (quality !== undefined && (!Number.isFinite(quality) || quality < 0 || quality > 1))
    throw new RangeError("Image encoding quality must be between 0 and 1");
  const canvas = createCanvas(pixels.width, pixels.height);
  const context = context2d(canvas, "encode");
  try {
    const imageData = context.createImageData(pixels.width, pixels.height);
    imageData.data.set(pixels.data);
    context.putImageData(imageData, 0, 0);
  } catch (error) {
    throw new Error(`Could not place image pixels on the canvas: ${describeError(error)}`);
  }
  let blob: Blob;
  try {
    const offscreen = canvas as OffscreenCanvas;
    if (typeof offscreen.convertToBlob === "function") {
      blob = await offscreen.convertToBlob({ type: format, quality });
    } else {
      const htmlCanvas = canvas as HTMLCanvasElement;
      if (typeof htmlCanvas.toBlob !== "function")
        throw new Error("This browser does not provide a canvas encoder");
      blob = await new Promise<Blob>((resolve, reject) => {
        htmlCanvas.toBlob(
          (result) =>
            result ? resolve(result) : reject(new Error("The canvas returned no image Blob")),
          format,
          quality,
        );
      });
    }
  } catch (error) {
    throw new Error(`Could not encode ${format}: ${describeError(error)}`);
  }
  if (blob.type.toLowerCase() !== format)
    throw new Error(`This browser does not support ${format} encoding`);
  return blob;
}

/** Probe the actual encoder instead of relying on canvas/API presence. */
export async function isImageEncodingSupported(format: ImageEncodingFormat): Promise<boolean> {
  try {
    await encodeImageBlob({ width: 1, height: 1, data: new Uint8ClampedArray(4) }, format);
    return true;
  } catch {
    return false;
  }
}

/** Encode RGBA image data as a PNG Blob using the browser canvas encoder. */
export function encodePngBlob(pixels: RgbaImageData): Promise<Blob> {
  return encodeImageBlob(pixels, ImageEncodingFormat.Png);
}
