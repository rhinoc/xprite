import { zlibSync } from "fflate";

import { inlineAssetBlob } from "$/adapters/minitool/sdk";
import {
  decodeAseprite,
  projectFromAseprite,
  EDITOR_ASEPRITE_LIMITS,
} from "@xprite/editor-core/import-export";

/** The container's Chrome 61 baseline does not provide CompressionStream. */
export const deflateMiniToolCel = (bytes: Uint8Array): Uint8Array => zlibSync(bytes);

export const DEFAULT_MAX_ASEPRITE_PROJECT_BYTES = EDITOR_ASEPRITE_LIMITS.maxFileBytes;
export async function decodeAsepriteBlob(blob: Blob, fileName: string) {
  if (blob.size > DEFAULT_MAX_ASEPRITE_PROJECT_BYTES) throw new RangeError("项目文件过大。");
  const data = await decodeAseprite(new Uint8Array(await blob.arrayBuffer()), {
    fileName,
    limits: EDITOR_ASEPRITE_LIMITS,
  });
  return projectFromAseprite(data);
}
export async function decodeAsepriteSource(source: Blob | { url: string }, name: string) {
  return decodeAsepriteBlob(source instanceof Blob ? source : inlineAssetBlob(source.url), name);
}
