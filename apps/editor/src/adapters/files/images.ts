import { downloadAfterFileWriteFailure } from "$/adapters/files/file-write-download";
import { fileWritePermissionRefused } from "$/adapters/files/file-write-permission";
import { tUi } from "$/i18n";
import {
  downloadBlob,
  isAbortError,
  pickSaveFile,
  requestFileWritePermission,
  writeFileHandle,
  type WritableFileHandle,
} from "@xprite/bedrock/browser/file-system";
import {
  ImageDimensionError,
  decodeImageBlob,
  encodePngBlob,
  type ImageDecodeOptions,
} from "@xprite/bedrock/browser/images";
import { hasPngSignature } from "@xprite/bedrock/common/png";
import {
  assertPixelBuffer,
  MAX_IMAGE_DIMENSION,
  MAX_IMAGE_PIXELS,
  pngFileName,
} from "@xprite/editor-core";
import type { PixelBuffer } from "@xprite/editor-core";

export type { ImageDecodeOptions } from "@xprite/bedrock/browser/images";
export type SaveFileHandle = WritableFileHandle;
export enum SavePngMode {
  Auto = "auto",
  Picker = "picker",
  Download = "download",
}
export interface SavePngOptions {
  /** `auto` uses the picker when available; `download` always uses an anchor download. */
  mode?: SavePngMode;
  /** Write directly to a previously selected local file. */
  fileHandle?: SaveFileHandle;
  /** Called after a picker-selected file was written successfully. */
  onFileHandleSaved?: (handle: SaveFileHandle) => void;
  onFileDataSaved?: (blob: Blob, name: string) => void;
}

const PNG_SIGNATURE_BYTES = 8;

function describeError(error: unknown): string {
  if (error instanceof Error && error.message) return error.message;
  if (typeof error === "string") return error;
  return "unknown browser error";
}

async function isPngBlob(blob: Blob): Promise<boolean> {
  if (blob.size < PNG_SIGNATURE_BYTES) return false;
  const header = new Uint8Array(await blob.slice(0, PNG_SIGNATURE_BYTES).arrayBuffer());
  return hasPngSignature(header);
}

/** Decode PNGs with the portable decoder up to editor document limits; non-PNGs retain canvas limits. */
export async function decodeImage(
  blob: Blob,
  options: ImageDecodeOptions = {},
): Promise<PixelBuffer> {
  if (!(blob instanceof Blob)) return decodeImageBlob(blob, options);
  const effectiveOptions =
    options.maxDimension === undefined &&
    options.maxWidth === undefined &&
    options.maxHeight === undefined &&
    (await isPngBlob(blob))
      ? {
          maxDimension: MAX_IMAGE_DIMENSION,
          maxPixels: MAX_IMAGE_PIXELS,
          ...options,
        }
      : options;
  return decodeImageBlob(blob, effectiveOptions);
}

export function encodePng(pixels: PixelBuffer): Promise<Blob> {
  return encodePngBlob(pixels);
}

function validatePixelBuffer(pixels: PixelBuffer): void {
  assertPixelBuffer(pixels);
}

/**
 * Save PNG data with the File System Access picker when it exists, otherwise trigger a download.
 * Call this from the user gesture that requested the save so picker activation is retained.
 */
export async function savePng(
  pixels: PixelBuffer,
  name: string,
  options: SavePngOptions = {},
): Promise<{
  method: "file" | "picker" | "download";
  name: string;
  downloadFallback?: true;
}> {
  validatePixelBuffer(pixels);
  const mode = options.mode ?? SavePngMode.Auto;
  if (mode !== SavePngMode.Auto && mode !== SavePngMode.Picker && mode !== SavePngMode.Download) {
    throw new RangeError(tUi("ui.unknown.png.save.mode", { value1: mode }));
  }
  const filename = pngFileName(name);
  if (mode === SavePngMode.Download) {
    const blob = await encodePng(pixels);
    downloadBlob(blob, filename);
    options.onFileDataSaved?.(blob, filename);
    return { method: "download", name: filename };
  }
  if (options.fileHandle) {
    const handle = options.fileHandle;
    const request = requestFileWritePermission(handle);
    const permission = request ? await request : "granted";
    if (permission !== "granted")
      throw fileWritePermissionRefused(permission, handle.name ?? filename);
    const blob = await encodePng(pixels);
    try {
      await writeFileHandle(handle, blob);
    } catch (reason) {
      const result = downloadAfterFileWriteFailure(blob, handle.name || filename, reason);
      options.onFileDataSaved?.(blob, result.name);
      return result;
    }
    options.onFileDataSaved?.(blob, handle.name || filename);
    return { method: "file", name: handle.name || filename };
  }

  // Invoke the picker before the first await so browsers retain click activation.
  let selection: ReturnType<typeof pickSaveFile>;
  try {
    selection = pickSaveFile({
      suggestedName: filename,
      types: [{ description: tUi("ui.png.image"), accept: { "image/png": [".png"] } }],
    });
  } catch (error) {
    if (isAbortError(error)) throw error;
    const blob = await encodePng(pixels);
    downloadBlob(blob, filename);
    options.onFileDataSaved?.(blob, filename);
    return { method: "download", name: filename };
  }
  if (selection) {
    let handle: SaveFileHandle;
    try {
      handle = await selection;
    } catch (error) {
      if (isAbortError(error)) throw error;
      const blob = await encodePng(pixels);
      downloadBlob(blob, filename);
      options.onFileDataSaved?.(blob, filename);
      return { method: "download", name: filename };
    }
    const blob = await encodePng(pixels);
    try {
      await writeFileHandle(handle, blob);
    } catch (reason) {
      const result = downloadAfterFileWriteFailure(blob, handle.name || filename, reason);
      options.onFileDataSaved?.(blob, result.name);
      return result;
    }
    options.onFileDataSaved?.(blob, handle.name || filename);
    options.onFileHandleSaved?.(handle);
    return { method: "picker", name: handle.name || filename };
  }
  const blob = await encodePng(pixels);
  downloadBlob(blob, filename);
  options.onFileDataSaved?.(blob, filename);
  return { method: "download", name: filename };
}

/** Fetch raster assets while keeping network loads inside the application origin. */
export async function readImageAssetBlob(url: string): Promise<Blob> {
  let parsed: URL;
  try {
    const base = typeof location !== "undefined" ? location.href : undefined;
    parsed = new URL(url, base);
  } catch (error) {
    throw new TypeError(
      tUi("ui.invalid.image.asset.url", { value1: url, value2: describeError(error) }),
    );
  }
  // Build tools inline small imported raster files (and library assets). Treat
  // those self-contained bytes as assets while retaining the network-origin gate.
  const inlineRaster =
    parsed.protocol === "data:" &&
    /^data:image\/(?:png|jpeg|webp|gif|bmp);base64,[A-Za-z0-9+/=\r\n]+$/.test(url);
  if (!inlineRaster && typeof location !== "undefined" && parsed.origin !== location.origin) {
    throw new Error(tUi("ui.image.assets.must.be.same.origin", { value1: url }));
  }
  if (typeof fetch !== "function")
    throw new Error("This browser does not provide fetch for image assets");
  let response: Response;
  try {
    response = await fetch(url, { credentials: "same-origin" });
  } catch (error) {
    throw new Error(
      tUi("ui.could.not.fetch.image.asset", { value1: url, value2: describeError(error) }),
    );
  }
  if (
    response.ok === false ||
    (response.ok === undefined && typeof response.status === "number" && response.status >= 400)
  ) {
    throw new Error(
      tUi("ui.could.not.fetch.image.asset.http", { value1: url, value2: response.status }),
    );
  }
  if (typeof location !== "undefined" && response.url) {
    if (
      !(inlineRaster && response.url === url) &&
      new URL(response.url, location.href).origin !== location.origin
    ) {
      throw new Error(tUi("ui.image.asset.redirected.off.origin", { value1: url }));
    }
  }
  return await response.blob();
}

/** Fetch a same-origin asset and decode it into editor-core pixels. */
export async function decodeAsset(
  url: string,
  options: ImageDecodeOptions = {},
): Promise<PixelBuffer> {
  const blob = await readImageAssetBlob(url);
  try {
    return await decodeImage(blob, options);
  } catch (error) {
    if (error instanceof ImageDimensionError) throw error;
    throw new Error(
      tUi("ui.could.not.decode.image.asset", { value1: url, value2: describeError(error) }),
    );
  }
}
