import type { ExportOutputPort } from "$/managers/ports/export-output";
import { downloadBlob } from "@xprite/bedrock/browser/file-system";
import { encodePngBlob } from "@xprite/bedrock/browser/images";

export function createBrowserExportOutputPort(): ExportOutputPort {
  return {
    encodePng: encodePngBlob,
    async save({ blob, name }) {
      downloadBlob(blob, name);
    },
  };
}
