import { browserToolAppearance } from "$/adapters/preview/browser-appearance";
import { handOffToolOutput } from "$/adapters/preview/browser-download";
import { readToolWheel } from "$/adapters/preview/browser-preview";
import { decodeViewerFile } from "$/adapters/viewer/aseprite-file";
import { transferViewerFile } from "$/adapters/viewer/editor-transfer";
import type { ViewerPort } from "$/managers/ports/viewer";
import { encodePngBlob } from "@xprite/bedrock/browser/images";
import exampleUrl from "@xprite/site-assets/showcase/ipad/hello/hello.aseprite?url";

const EXAMPLE_FILENAME = "hello.aseprite";

export function createBrowserViewerPort(editorSearch: string): ViewerPort {
  return {
    readWheel: readToolWheel,
    ...browserToolAppearance,
    read: decodeViewerFile,
    async example() {
      const response = await fetch(exampleUrl);
      if (!response.ok) throw new Error("The example is unavailable.");
      return new File([await response.blob()], EXAMPLE_FILENAME);
    },
    async saveFrame(pixels, name) {
      await handOffToolOutput(() => encodePngBlob(pixels), name);
    },
    async saveAnimation(bytes, name) {
      await handOffToolOutput(
        () => new Blob([new Uint8Array(bytes).buffer], { type: "image/gif" }),
        name,
      );
    },
    async edit(file) {
      const token = await transferViewerFile(file);
      window.location.assign(`/editor${editorSearch}#viewer-import=${token}`);
    },
  };
}
