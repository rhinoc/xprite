import { miniToolPreferences, postImageNote, saveImageToAlbum } from "$/shared/bridge/xhs-bridge";
import type { PixelBuffer } from "@xprite/editor-core/base";
import {
  detectWithAlgorithm,
  pixelateImage,
  type PixelateOptions,
} from "@xprite/editor-core/import-export";
import exampleUrl from "@xprite/site-assets/tools/pixelate/girl-with-a-pearl-earring.jpg?url";
import {
  readPixelationPalettes,
  readToolWheel,
  TOOL_IMPORT_MAX_BYTES,
  type PixelationPort,
} from "@xprite/tools-app/pixelation";

/**
 * The container has no Workers, so conversion runs on the main thread. Larger photos are
 * reduced to this many pixels first, which keeps PixelOE + lines within about a second on phones.
 */
const MINITOOL_MAX_SOURCE_PIXELS = 4_000_000;
/** Saved and posted images are enlarged with whole-pixel scaling so blocks stay crisp. */
const OUTPUT_TARGET_SIZE = 1080;
const OUTPUT_MAX_SIZE = 2048;
const EXAMPLE_NAME = "girl-with-a-pearl-earring.jpg";

function canvas(width: number, height: number) {
  const element = document.createElement("canvas");
  element.width = width;
  element.height = height;
  const context = element.getContext("2d");
  if (!context) throw new Error("Unable to pixelate this image.");
  return { element, context };
}

function loadImage(source: string): Promise<HTMLImageElement> {
  return new Promise((resolve, reject) => {
    const image = new Image();
    image.onload = () => resolve(image);
    image.onerror = () => reject(new Error("Unable to read this image."));
    image.src = source;
  });
}

/** Decode with the browser and reduce to {@link MINITOOL_MAX_SOURCE_PIXELS}, smoothing as it scales. */
async function decode(file: Blob): Promise<PixelBuffer> {
  const url = URL.createObjectURL(file);
  try {
    const image = await loadImage(url);
    const width = image.naturalWidth;
    const height = image.naturalHeight;
    if (!width || !height) throw new Error("Unable to read this image.");
    const scale = Math.min(1, Math.sqrt(MINITOOL_MAX_SOURCE_PIXELS / (width * height)));
    const target = {
      width: Math.max(1, Math.floor(width * scale)),
      height: Math.max(1, Math.floor(height * scale)),
    };
    const { context } = canvas(target.width, target.height);
    context.imageSmoothingEnabled = true;
    context.imageSmoothingQuality = "high";
    context.drawImage(image, 0, 0, target.width, target.height);
    const data = context.getImageData(0, 0, target.width, target.height).data;
    return { ...target, data: new Uint8ClampedArray(data) };
  } finally {
    URL.revokeObjectURL(url);
  }
}

/** A PNG data URL of the result, enlarged by a whole factor to a shareable size. */
function pngDataUrl(pixels: PixelBuffer): string {
  const longest = Math.max(pixels.width, pixels.height);
  const factor = Math.max(
    1,
    Math.min(Math.ceil(OUTPUT_TARGET_SIZE / longest), Math.floor(OUTPUT_MAX_SIZE / longest)),
  );
  const source = canvas(pixels.width, pixels.height);
  source.context.putImageData(
    new ImageData(new Uint8ClampedArray(pixels.data), pixels.width, pixels.height),
    0,
    0,
  );
  const output = canvas(pixels.width * factor, pixels.height * factor);
  output.context.imageSmoothingEnabled = false;
  output.context.drawImage(source.element, 0, 0, output.element.width, output.element.height);
  return output.element.toDataURL("image/png");
}

/** Let the busy state paint before a synchronous conversion takes the main thread. */
function yieldToPaint(): Promise<void> {
  return new Promise((resolve) => requestAnimationFrame(() => setTimeout(resolve, 0)));
}

class SupersededError extends Error {}

export function createMiniToolPixelationPort(): PixelationPort {
  let latestConversion = 0;
  async function convert(image: PixelBuffer, options: PixelateOptions) {
    const request = ++latestConversion;
    await yieldToPaint();
    // A newer conversion replaced this one while it waited; the manager drops stale results.
    if (request !== latestConversion) throw new SupersededError();
    return pixelateImage(image, options);
  }
  return {
    readWheel: readToolWheel,
    paletteResources: () => readPixelationPalettes(miniToolPreferences.getItem),
    async read(file) {
      if (file.size > TOOL_IMPORT_MAX_BYTES)
        throw new Error("Choose a file no larger than 64 MiB.");
      if (file.type && !file.type.startsWith("image/"))
        throw new Error("Choose a PNG, JPEG or WebP image.");
      return decode(file);
    },
    async example() {
      const image = await loadImage(exampleUrl);
      const { element, context } = canvas(image.naturalWidth, image.naturalHeight);
      context.drawImage(image, 0, 0);
      const blob = await new Promise<Blob | null>((resolve) => element.toBlob(resolve));
      if (!blob) throw new Error("The example is unavailable.");
      return new File([blob], EXAMPLE_NAME, { type: "image/png" });
    },
    async detectGrid(image, algorithm, size) {
      await yieldToPaint();
      return detectWithAlgorithm(image, algorithm, size);
    },
    convert,
    save: async (pixels) => saveImageToAlbum(pngDataUrl(pixels)),
    /** The flow's second action posts the result to a new note instead of opening the editor. */
    edit: async (pixels) => postImageNote(pngDataUrl(pixels)),
    /** Conversions run on the page's own thread: nothing to start ahead. */
    prepare() {},
    dispose() {
      ++latestConversion;
    },
  };
}
