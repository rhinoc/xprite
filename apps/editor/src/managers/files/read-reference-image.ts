import { decodeImageBlob } from "@xprite/bedrock/browser/images";
import type { PixelBuffer } from "@xprite/editor-core";

/** Decode the browser-selected image before the workspace adds it as a reference layer. */
export function readReferenceImage(file: Blob): Promise<PixelBuffer> {
  return decodeImageBlob(file);
}
