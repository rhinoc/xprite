import { tUi } from "$/i18n";
import type { EditorDocument } from "@xprite/editor-core/document";
import {
  ImageExportLimitError,
  inspectExportOutput,
  exportFrameOrder,
  type ExportFileOptions,
} from "@xprite/editor-core/import-export";

export function localizeImageExportError(error: unknown): unknown {
  if (error instanceof ImageExportLimitError)
    error.message = tUi("ui.export.output.limit", { width: error.width, height: error.height });
  return error;
}

/** Shared by the form and every final image/animation executor, including agent tools. */
export function validateImageExport(document: EditorDocument, options: ExportFileOptions): number {
  try {
    const frameCount = exportFrameOrder(document, options).length;
    inspectExportOutput(document, options, frameCount);
    return frameCount;
  } catch (error) {
    throw localizeImageExportError(error);
  }
}
