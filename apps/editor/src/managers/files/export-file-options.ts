import {
  DEFAULT_FILE_PREFERENCES,
  type ExportExtensionDefaults,
} from "$/managers/preferences/file-preferences";
import type { EditorDocument, ExportFileOptions } from "@xprite/editor-core";

export function defaultExportFileOptions(
  document: EditorDocument,
  defaults: ExportExtensionDefaults = DEFAULT_FILE_PREFERENCES,
): ExportFileOptions {
  const extension =
    (document.timeline?.frames.length ?? 1) > 1
      ? defaults.animationDefaultExtension
      : defaults.imageDefaultExtension;
  const sourceName = document.name.trim();
  const stem = sourceName.replace(/\.[^.]*$/, "") || "untitled";
  return {
    name: `${stem}${sourceName.toLowerCase().endsWith(`.${extension}`) ? "-export" : ""}.${extension}`,
    scalePercent: 100,
    area: "canvas",
    layers: "visible",
    frame: document.timeline?.activeFrame ?? 0,
  };
}
