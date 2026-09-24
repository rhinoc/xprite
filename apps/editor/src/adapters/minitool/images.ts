import { inlineAssetBlob, saveAlbumImage } from "$/adapters/minitool/sdk";
import { decodeImageBlob, encodePngBlob } from "@xprite/bedrock/browser/images";
import type { ImageDecodeOptions } from "@xprite/bedrock/browser/images";
import type { PixelBuffer } from "@xprite/editor-core";
export { ImageDimensionError } from "@xprite/bedrock/browser/images";
export type { ImageDecodeOptions } from "@xprite/bedrock/browser/images";
export enum SavePngMode {
  Auto = "auto",
  Picker = "picker",
  Download = "download",
}
export const decodeImage = decodeImageBlob;
export const encodePng = encodePngBlob;
export async function readImageAssetBlob(url: string): Promise<Blob> {
  return inlineAssetBlob(url);
}
export async function decodeAsset(url: string, options?: ImageDecodeOptions) {
  return decodeImageBlob(inlineAssetBlob(url), options);
}
export async function savePng(
  pixels: PixelBuffer,
  name: string,
  options: { onFileDataSaved?: (blob: Blob, name: string) => void } = {},
) {
  const blob = await encodePngBlob(pixels);
  const filename = name.replace(/\.[^.]*$/, "") + ".png";
  await saveAlbumImage(blob);
  options.onFileDataSaved?.(blob, filename);
  return { method: "file" as const, name: filename };
}
