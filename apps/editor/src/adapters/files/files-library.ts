import { MAX_ANIMATION_SOURCE_BYTES } from "$/adapters/files/animated-images";
import { DEFAULT_MAX_ASEPRITE_PROJECT_BYTES } from "$/adapters/files/aseprite-files";
import { LocalFileLibrary } from "@xprite/bedrock/browser/local-file-library";
import { OpfsByteStore, supportsOpfs } from "@xprite/bedrock/browser/opfs";

/** The Files library shared with the tools on the same origin. */
const FILES_DATABASE = "xprite.files.v1";
const FILES_CHANNEL = "xprite.files";
const EDITOR_FOLDER = "/editor/";
const STILL_IMAGE_MAX_BYTES = 64 * 1024 * 1024;
const RECENT_PREFIX = "#files-recent=";
const IMPORTABLE = /\.(?:png|gif|webp|jpe?g|ase|aseprite)$/i;

/** Import limits reuse the editor's own: .ase, animations, then still images. */
function editorImportLimit(name: string): number {
  if (/\.(?:ase|aseprite)$/i.test(name)) return DEFAULT_MAX_ASEPRITE_PROJECT_BYTES;
  if (/\.(?:gif|webp)$/i.test(name)) return MAX_ANIMATION_SOURCE_BYTES;
  return STILL_IMAGE_MAX_BYTES;
}

let library: LocalFileLibrary | null = null;

/** Keep a copy of an imported file in Files. Failures never affect the import itself. */
export async function rememberEditorImport(file: File): Promise<void> {
  if (!IMPORTABLE.test(file.name) || file.size > editorImportLimit(file.name)) return;
  if (typeof indexedDB === "undefined") return;
  library ??= new LocalFileLibrary({
    databaseName: FILES_DATABASE,
    byteStore: supportsOpfs() ? new OpfsByteStore(FILES_DATABASE) : undefined,
    channelName: FILES_CHANNEL,
  });
  try {
    await library.add({
      name: file.name,
      type: file.type,
      bytes: new Uint8Array(await file.arrayBuffer()),
      folder: EDITOR_FOLDER,
      source: "editor",
    });
  } catch {
    /* Storage is best-effort here; the document is already open. */
  }
}

/** `#files-recent=<id>` opens one of the editor's own recent projects from Files. */
export function takeFilesRecent(): string | null {
  if (!window.location.hash.startsWith(RECENT_PREFIX)) return null;
  const id = decodeURIComponent(window.location.hash.slice(RECENT_PREFIX.length));
  window.history.replaceState(
    window.history.state,
    "",
    `${window.location.pathname}${window.location.search}`,
  );
  return id || null;
}
