import { transferViewerFile } from "$/adapters/viewer/editor-transfer";
import { encodePngBlob } from "@xprite/bedrock/browser/images";
import type { PixelBuffer, Rgba } from "@xprite/editor-core/base";

/** The editor consumes a transferred file only from this explicit hash, as a new project. */
export const EDITOR_IMPORT_HASH = "#viewer-import=";

/** Where the editor opens a staged file: its own route plus the one-shot import token. */
export function editorImportUrl(token: string, search = ""): string {
  return `/editor${search}${EDITOR_IMPORT_HASH}${token}`;
}

/**
 * Hands a tool result to the editor: the file is staged in the short-lived transfer record
 * (same origin, deleted when the editor takes it) and the page navigates to the editor, which
 * opens it as a NEW document next to whatever project it already restores.
 */
export async function openInEditor(
  file: File,
  options: { palette?: readonly Rgba[]; search?: string } = {},
): Promise<void> {
  const token = await transferViewerFile(file, options.palette);
  window.location.assign(editorImportUrl(token, options.search));
}

/** A rendered result (pixel buffer) goes to the editor as a PNG, which it opens as one layer. */
export async function openPixelsInEditor(pixels: PixelBuffer, name: string): Promise<void> {
  await openInEditor(new File([await encodePngBlob(pixels)], name, { type: "image/png" }));
}
