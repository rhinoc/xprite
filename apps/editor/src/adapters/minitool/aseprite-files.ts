import { zlibSync } from "fflate";

import { inlineAssetBlob } from "$/adapters/minitool/sdk";
import { decodeAseprite, projectFromAseprite } from "@xprite/editor-core/import-export";

/** The container's Chrome 61 baseline does not provide CompressionStream. */
export const deflateMiniToolCel = (bytes: Uint8Array): Uint8Array => zlibSync(bytes);

export const DEFAULT_MAX_ASEPRITE_PROJECT_BYTES = 64 * 1024 * 1024;
export async function decodeAsepriteBlob(blob: Blob, fileName: string) {
  if (blob.size > DEFAULT_MAX_ASEPRITE_PROJECT_BYTES) throw new RangeError("项目文件过大。");
  const data = await decodeAseprite(new Uint8Array(await blob.arrayBuffer()), {
    fileName,
    limits: {
      maxFileBytes: DEFAULT_MAX_ASEPRITE_PROJECT_BYTES,
      maxDecodedBytes: DEFAULT_MAX_ASEPRITE_PROJECT_BYTES,
      maxFrames: 4096,
      maxLayers: 256,
      maxCelPixels: DEFAULT_MAX_ASEPRITE_PROJECT_BYTES / 4,
    },
  });
  return projectFromAseprite(data);
}
export async function decodeAsepriteSource(source: Blob | { url: string }, name: string) {
  return decodeAsepriteBlob(source instanceof Blob ? source : inlineAssetBlob(source.url), name);
}
