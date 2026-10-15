import { zipSync } from "fflate";

import { openInEditor } from "$/adapters/editor/open-in-editor";
import { EditorProjectReader, editorRecentId } from "$/adapters/files/editor-projects";
import { FileEntryKind, type FileEntry, type FilesPort } from "$/managers/ports/files";
import { downloadBlob } from "@xprite/bedrock/browser/file-system";
import {
  LocalFileLibrary,
  readStorageEstimate,
  requestPersistentStorage,
  uniqueFileName,
  type LocalFileRecord,
} from "@xprite/bedrock/browser/local-file-library";
import { OpfsByteStore, supportsOpfs } from "@xprite/bedrock/browser/opfs";
import type { SiteTelemetryPort } from "@xprite/site-shell/telemetry";

/** Shared with the editor, which saves its imports into the same library. */
const FILES_DATABASE = "xprite.files.v1";
const FILES_CHANNEL = "xprite.files";
const HANDOFF_PREFIX = "#files-open=";
const EDITOR_RECENT_PREFIX = "#files-recent=";
const THUMBNAIL_EXTENT = 64;
const THUMBNAIL_TYPES = /^image\/(?:png|jpeg|gif|webp)$/;

function toEntry(record: LocalFileRecord): FileEntry {
  return {
    id: record.id,
    kind: FileEntryKind.File,
    name: record.name,
    type: record.type,
    size: record.size,
    folder: record.folder,
    createdAt: record.createdAt,
    modifiedAt: record.modifiedAt,
    openedAt: record.openedAt,
    label: record.label,
    comment: record.comment,
    trashedAt: record.trashedAt,
  };
}

/** Nearest-neighbour downscale keeps pixel art crisp. */
async function pixelThumbnail(source: CanvasImageSource & { width: number; height: number }) {
  const scale = Math.min(1, THUMBNAIL_EXTENT / Math.max(source.width, source.height));
  const canvas = document.createElement("canvas");
  canvas.width = Math.max(1, Math.round(source.width * scale));
  canvas.height = Math.max(1, Math.round(source.height * scale));
  const context = canvas.getContext("2d");
  if (!context) return null;
  context.imageSmoothingEnabled = false;
  context.drawImage(source, 0, 0, canvas.width, canvas.height);
  return new Promise<Blob | null>((resolve) => canvas.toBlob(resolve, "image/png"));
}

async function imageDataSource(data: ImageData) {
  const canvas = document.createElement("canvas");
  canvas.width = data.width;
  canvas.height = data.height;
  canvas.getContext("2d")?.putImageData(data, 0, 0);
  return canvas;
}

function archive(files: readonly File[]): Promise<Blob> {
  return Promise.all(files.map(async (file) => new Uint8Array(await file.arrayBuffer()))).then(
    (contents) => {
      const taken = new Set<string>();
      const entries: Record<string, [Uint8Array, { level: 0 }]> = {};
      files.forEach((file, index) => {
        const name = uniqueFileName(file.name, taken);
        taken.add(name);
        entries[name] = [contents[index], { level: 0 }];
      });
      return new Blob([zipSync(entries).buffer as ArrayBuffer], { type: "application/zip" });
    },
  );
}

export function createBrowserFilesPort(telemetry?: SiteTelemetryPort): FilesPort {
  const library = new LocalFileLibrary({
    databaseName: FILES_DATABASE,
    byteStore: supportsOpfs() ? new OpfsByteStore(FILES_DATABASE) : undefined,
    channelName: FILES_CHANNEL,
  });
  const projects = new EditorProjectReader();
  const hashes = new Map<string, string>();
  const read = async (entry: FileEntry) =>
    new File([new Uint8Array(await library.read(entry.id)).buffer as ArrayBuffer], entry.name, {
      type: entry.type,
      lastModified: entry.modifiedAt,
    });
  return {
    async list() {
      const [records, editor] = await Promise.all([library.list(), projects.list()]);
      for (const record of records) hashes.set(record.id, record.hash);
      return [...records.map(toEntry), ...editor];
    },
    async add(file, folder, source) {
      const { record, deduped } = await library.add({
        name: file.name,
        type: file.type,
        bytes: new Uint8Array(await file.arrayBuffer()),
        folder,
        source,
      });
      hashes.set(record.id, record.hash);
      return { entry: toEntry(record), deduped };
    },
    read,
    update: async (id, patch) => void (await library.update(id, patch)),
    duplicate: async (id) => void (await library.duplicate(id)),
    touch: (id) => library.touch(id),
    trash: async (ids) => void (await library.trash(ids)),
    restore: async (ids) => void (await library.restore(ids)),
    emptyTrash: () => library.emptyTrash(),
    purgeTrash: (age) => library.purgeTrash(age),
    async thumbnail(entry) {
      if (entry.kind === FileEntryKind.EditorProject) {
        const data = await projects.thumbnail(entry);
        if (!data) return null;
        const blob = await pixelThumbnail(await imageDataSource(data));
        return blob && URL.createObjectURL(blob);
      }
      const hash = hashes.get(entry.id);
      if (!hash || !THUMBNAIL_TYPES.test(entry.type)) return null;
      let thumbnail = await library.thumbnail(hash);
      if (!thumbnail) {
        const bitmap = await createImageBitmap(await read(entry));
        try {
          thumbnail = await pixelThumbnail(bitmap);
        } finally {
          bitmap.close();
        }
        if (!thumbnail) return null;
        await library.putThumbnail(hash, thumbnail).catch(() => undefined);
      }
      return URL.createObjectURL(thumbnail);
    },
    estimate: readStorageEstimate,
    persist: requestPersistentStorage,
    async download(files, archiveName) {
      if (files.length === 1) downloadBlob(files[0], files[0].name);
      else downloadBlob(await archive(files), archiveName);
    },
    async openInEditor(entry) {
      if (entry.kind === FileEntryKind.EditorProject) {
        window.location.assign(
          `/editor${EDITOR_RECENT_PREFIX}${encodeURIComponent(editorRecentId(entry))}`,
        );
        return;
      }
      await openInEditor(await read(entry));
    },
    openInTool(href, entry) {
      window.location.assign(`${href}${HANDOFF_PREFIX}${encodeURIComponent(entry.id)}`);
    },
    takeHandoff() {
      if (!window.location.hash.startsWith(HANDOFF_PREFIX)) return null;
      const id = decodeURIComponent(window.location.hash.slice(HANDOFF_PREFIX.length));
      window.history.replaceState(
        window.history.state,
        "",
        `${window.location.pathname}${window.location.search}`,
      );
      return id || null;
    },
    subscribe(listener) {
      const stop = library.subscribe(listener);
      const visible = () => {
        if (document.visibilityState === "visible") listener();
      };
      document.addEventListener("visibilitychange", visible);
      return () => {
        stop();
        document.removeEventListener("visibilitychange", visible);
      };
    },
    capture(event, properties) {
      try {
        telemetry?.capture(event, properties);
      } catch {
        /* Analytics never changes a Files result. */
      }
    },
  };
}
