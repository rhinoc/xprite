import { FileEntryKind, type FileEntry } from "$/managers/ports/files";
import { EDITOR_ASEPRITE_LIMITS } from "@xprite/editor-core/import-export";

/** The importer limit shared by Pixelate, Fuse Beads, Animal Crossing and GIF to Sprite Sheet. */
export const TOOL_IMPORT_MAX_BYTES = 64 * 1024 * 1024;
/** The editor's and viewer's Aseprite project limit (512,000,000 bytes). */
export const ASEPRITE_IMPORT_MAX_BYTES = EDITOR_ASEPRITE_LIMITS.maxFileBytes;
export const TRASH_RETENTION_MS = 30 * 24 * 60 * 60 * 1000;
const RECENT_LIMIT = 30;
export const QUOTA_WARNING_RATIOS = [0.8, 0.95] as const;

export enum FilesFolder {
  Root = "root",
  Recent = "recent",
  EditorProjects = "editor-projects",
  Trash = "trash",
}

/** File-backed folders are tool paths, the editor, or the Files root itself. */
export const EDITOR_FOLDER = "/editor/";
export const LOOSE_FOLDER = "/";

export enum FilesView {
  Icons = "icons",
  List = "list",
}

export enum FilesSortKey {
  Name = "name",
  Modified = "modified",
  Size = "size",
  Kind = "kind",
  Label = "label",
}

export interface FilesSort {
  key: FilesSortKey;
  ascending: boolean;
}

const ASEPRITE_NAME = /\.(?:ase|aseprite)$/i;

function isAsepriteName(name: string): boolean {
  return ASEPRITE_NAME.test(name);
}

/** Files never keeps more than the importer that produced the file accepts. */
export function importLimit(folder: string, name: string): number {
  if (folder === LOOSE_FOLDER || folder === "/tools/viewer/")
    return isAsepriteName(name) ? ASEPRITE_IMPORT_MAX_BYTES : TOOL_IMPORT_MAX_BYTES;
  return TOOL_IMPORT_MAX_BYTES;
}

/** Same matching rules as an `<input accept>` attribute. */
export function accepts(accept: string, name: string, type: string): boolean {
  const lower = name.toLowerCase();
  return accept
    .split(",")
    .map((value) => value.trim().toLowerCase())
    .some((value) =>
      value.startsWith(".")
        ? lower.endsWith(value)
        : value.endsWith("/*")
          ? type.startsWith(value.slice(0, -1))
          : type === value,
    );
}

export function entriesIn(entries: readonly FileEntry[], folder: string): FileEntry[] {
  if (folder === FilesFolder.Trash) return entries.filter((entry) => entry.trashedAt);
  const live = entries.filter((entry) => !entry.trashedAt);
  if (folder === FilesFolder.Recent)
    return live
      .filter((entry) => entry.kind === FileEntryKind.File)
      .sort((a, b) => b.openedAt - a.openedAt)
      .slice(0, RECENT_LIMIT);
  if (folder === FilesFolder.EditorProjects)
    return live.filter((entry) => entry.kind === FileEntryKind.EditorProject);
  if (folder === FilesFolder.Root)
    return live.filter(
      (entry) => entry.kind === FileEntryKind.File && entry.folder === LOOSE_FOLDER,
    );
  return live.filter((entry) => entry.kind === FileEntryKind.File && entry.folder === folder);
}

function fileKind(entry: Pick<FileEntry, "kind" | "name" | "type">): string {
  if (entry.kind === FileEntryKind.EditorProject) return "Xprite project";
  if (isAsepriteName(entry.name)) return "Aseprite file";
  const extension = /\.([a-z0-9]+)$/i.exec(entry.name)?.[1]?.toUpperCase();
  if (extension === "JPG" || extension === "JPEG") return "JPEG image";
  if (extension === "ACNL") return "Animal Crossing design";
  return extension ? `${extension} image` : "Document";
}

export function sortEntries(entries: readonly FileEntry[], sort: FilesSort): FileEntry[] {
  const direction = sort.ascending ? 1 : -1;
  const value = (entry: FileEntry): string | number => {
    switch (sort.key) {
      case FilesSortKey.Modified:
        return entry.modifiedAt;
      case FilesSortKey.Size:
        return entry.size;
      case FilesSortKey.Kind:
        return fileKind(entry);
      case FilesSortKey.Label:
        return entry.label || Number.MAX_SAFE_INTEGER;
      default:
        return entry.name.toLowerCase();
    }
  };
  return [...entries].sort((a, b) => {
    const left = value(a);
    const right = value(b);
    const order =
      typeof left === "number" && typeof right === "number"
        ? left - right
        : String(left).localeCompare(String(right));
    return order * direction || a.name.localeCompare(b.name);
  });
}

const UNITS = ["byte", "kilobyte", "megabyte", "gigabyte"] as const;

/** Finder-style sizes ("12 KB", "1.2 MB") in the page language. */
export function formatBytes(bytes: number, language: string): string {
  let value = bytes;
  let unit = 0;
  while (value >= 1024 && unit < UNITS.length - 1) {
    value /= 1024;
    unit++;
  }
  return new Intl.NumberFormat(language, {
    style: "unit",
    unit: UNITS[unit],
    unitDisplay: "short",
    maximumFractionDigits: unit < 2 ? 0 : 1,
  }).format(value);
}

export function formatDate(time: number, language: string): string {
  return new Intl.DateTimeFormat(language, { dateStyle: "medium", timeStyle: "short" }).format(
    time,
  );
}

/** Coarse buckets keep telemetry free of exact sizes. */
export function sizeBucket(bytes: number): string {
  const megabytes = bytes / (1024 * 1024);
  if (megabytes < 1) return "<1MB";
  if (megabytes < 10) return "1-10MB";
  if (megabytes < 64) return "10-64MB";
  return ">=64MB";
}

export function countBucket(count: number): string {
  return count <= 1 ? "1" : count <= 5 ? "2-5" : count <= 20 ? "6-20" : ">20";
}

export function extensionOf(name: string): string {
  const extension = /\.([a-z0-9]+)$/i.exec(name)?.[1]?.toLowerCase();
  return extension &&
    ["ase", "aseprite", "gif", "png", "jpg", "jpeg", "webp", "acnl"].includes(extension)
    ? extension
    : "unknown";
}

/** Drag payload between the Files window and tool import areas on the same page. */
export const FILES_DRAG_TYPE = "application/x-xprite-files+json";

export function encodeFilesDrag(ids: readonly string[]): string {
  return JSON.stringify({ v: 1, ids });
}

export function decodeFilesDrag(value: string): string[] {
  try {
    const parsed: unknown = JSON.parse(value);
    if (
      parsed &&
      typeof parsed === "object" &&
      "v" in parsed &&
      parsed.v === 1 &&
      "ids" in parsed &&
      Array.isArray(parsed.ids)
    )
      return parsed.ids.filter((id): id is string => typeof id === "string");
  } catch {
    /* Foreign or malformed drags carry no Files items. */
  }
  return [];
}
