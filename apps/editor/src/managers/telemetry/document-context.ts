import type { TelemetryProperties } from "$/managers/ports/telemetry";
import type { DocumentWorkspace } from "$/managers/workspace/document-workspace";
import type { EditorDocument } from "@xprite/editor-core/document";

export function documentTelemetryContext(document: EditorDocument | null): TelemetryProperties {
  if (!document) return {};
  return {
    canvas_width: document.width,
    canvas_height: document.height,
    layer_count: document.timeline?.layers.length ?? 1,
    frame_count: document.timeline?.frames.length ?? 1,
    palette_color_count: document.palette?.length ?? 0,
    file_format: document.format ?? "unknown",
  };
}

/** Reads canonical state only when emitting an event; never retains artwork or names. */
export function workspaceTelemetryContext(
  workspace: DocumentWorkspace,
  slotId = workspace.active.id,
): TelemetryProperties {
  const slot = workspace.getSlot(slotId);
  const document = slot?.core.getSnapshot().document ?? null;
  return {
    open_document_count: workspace.getSnapshot().tabs.length,
    ...documentTelemetryContext(document),
    ...(slot && document ? { palette_color_count: slot.core.getSnapshot().palette.length } : {}),
  };
}

const KNOWN_FILE_FORMATS = new Set([
  "ase",
  "aseprite",
  "png",
  "apng",
  "gif",
  "jpg",
  "jpeg",
  "webp",
  "json",
]);

export function telemetryFileFormat(name: string): string {
  const extension = name.split(".").pop()?.toLowerCase() ?? "";
  return KNOWN_FILE_FORMATS.has(extension)
    ? extension === "ase"
      ? "aseprite"
      : extension === "jpeg"
        ? "jpg"
        : extension
    : "unknown";
}
