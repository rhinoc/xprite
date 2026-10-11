import type { EditorPlatformPorts } from "$/managers/ports/platform";
import { selectBrowserFiles } from "@xprite/bedrock/browser/file-system";
import type { PixelBuffer } from "@xprite/editor-core/base";

const IMAGE_FILE_ACCEPT = "image/*";

export function createReferenceImageSelector(
  decode: (file: Blob) => Promise<PixelBuffer>,
): EditorPlatformPorts["files"]["selectReferenceImage"] {
  return async (signal) => {
    const [file] = await selectBrowserFiles({ accept: IMAGE_FILE_ACCEPT, signal });
    if (!file) return null;
    const pixels = await decode(file);
    signal.throwIfAborted();
    return pixels;
  };
}
