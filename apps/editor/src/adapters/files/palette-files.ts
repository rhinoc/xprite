import { unzlibSync } from "fflate";

import { tUi } from "$/i18n";
import type { PaletteFileSaveRequest } from "$/managers/ports/platform";
import { decodePalettePng, decodePaletteTga } from "@xprite/editor-core/import-export";

export async function decodeBrowserPaletteImage(bytes: Uint8Array, name: string) {
  return (
    decodePalettePng(bytes, (compressed, expected) =>
      unzlibSync(compressed, { out: new Uint8Array(expected) }),
    ) ?? (/\.tga$/i.test(name) ? decodePaletteTga(bytes) : null)
  );
}
import {
  downloadBlob,
  isAbortError,
  pickSaveFile,
  writeFileHandle,
} from "@xprite/bedrock/browser/file-system";

/** Invoke the native picker while the save gesture is active, then encode its chosen file format. */
export async function saveBrowserPaletteFile(
  request: PaletteFileSaveRequest,
): Promise<{ name: string; bytes: Uint8Array } | null> {
  const selection = pickSaveFile({
    suggestedName: request.name,
    types: request.formats.map((format) => ({
      description: format.description,
      accept: { [format.mime]: [`.${format.extension}`] },
    })),
  });
  try {
    const handle = selection ? await selection : null;
    const name = handle?.name || request.name;
    const extension = name.split(".").pop()?.toLowerCase() ?? "";
    const format = request.formats.find(
      (candidate) =>
        candidate.extension === extension ||
        (candidate.extension === "ase" && extension === "aseprite"),
    );
    if (!format) throw new Error(tUi("ui.palette.file.extension.unsupported"));
    const bytes = request.encode(format.extension);
    const blob = new Blob([new Uint8Array(bytes).buffer], { type: format.mime });
    if (handle) await writeFileHandle(handle, blob);
    else downloadBlob(blob, name);
    return { name, bytes };
  } catch (error) {
    if (isAbortError(error)) return null;
    throw error;
  }
}
