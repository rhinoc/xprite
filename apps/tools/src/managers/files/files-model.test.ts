import { describe, expect, it } from "vitest";

import {
  accepts,
  ASEPRITE_IMPORT_MAX_BYTES,
  decodeFilesDrag,
  encodeFilesDrag,
  entriesIn,
  FilesFolder,
  FilesSortKey,
  importLimit,
  sortEntries,
  TOOL_IMPORT_MAX_BYTES,
} from "$/managers/files/files-model";
import { FileEntryKind, type FileEntry } from "$/managers/ports/files";

const entry = (patch: Partial<FileEntry>): FileEntry => ({
  id: patch.name ?? "x",
  kind: FileEntryKind.File,
  name: "x.png",
  type: "image/png",
  size: 1,
  folder: "/",
  createdAt: 1,
  modifiedAt: 1,
  openedAt: 1,
  label: 0,
  comment: "",
  ...patch,
});

describe("files model", () => {
  it("reuses the existing tool and Aseprite size limits", () => {
    expect(TOOL_IMPORT_MAX_BYTES).toBe(64 * 1024 * 1024);
    expect(ASEPRITE_IMPORT_MAX_BYTES).toBe(512_000_000);
    expect(importLimit("/tools/viewer/", "a.aseprite")).toBe(ASEPRITE_IMPORT_MAX_BYTES);
    expect(importLimit("/", "a.ase")).toBe(ASEPRITE_IMPORT_MAX_BYTES);
    expect(importLimit("/tools/pixelate/", "a.ase")).toBe(TOOL_IMPORT_MAX_BYTES);
    expect(importLimit("/tools/viewer/", "a.png")).toBe(TOOL_IMPORT_MAX_BYTES);
  });

  it("matches input accept rules by extension and MIME type", () => {
    expect(accepts(".ase,.aseprite", "Hero.ASEPRITE", "")).toBe(true);
    expect(accepts("image/*", "a.webp", "image/webp")).toBe(true);
    expect(accepts("image/png", "a.gif", "image/gif")).toBe(false);
  });

  it("groups items into folders, Recent and Trash", () => {
    const items = [
      entry({ name: "loose.png", openedAt: 3 }),
      entry({ name: "tool.png", folder: "/tools/pixelate/", openedAt: 5 }),
      entry({ name: "gone.png", trashedAt: 9 }),
      entry({ name: "Project", kind: FileEntryKind.EditorProject, folder: "/editor/projects/" }),
    ];
    expect(entriesIn(items, FilesFolder.Root).map((item) => item.name)).toEqual(["loose.png"]);
    expect(entriesIn(items, FilesFolder.Recent).map((item) => item.name)).toEqual([
      "tool.png",
      "loose.png",
    ]);
    expect(entriesIn(items, FilesFolder.Trash).map((item) => item.name)).toEqual(["gone.png"]);
    expect(entriesIn(items, FilesFolder.EditorProjects).map((item) => item.name)).toEqual([
      "Project",
    ]);
  });

  it("sorts by any column, with name as the tie-breaker", () => {
    const items = [
      entry({ name: "b.png", size: 2 }),
      entry({ name: "a.png", size: 2 }),
      entry({ name: "c.png", size: 1 }),
    ];
    expect(
      sortEntries(items, { key: FilesSortKey.Size, ascending: true }).map((item) => item.name),
    ).toEqual(["c.png", "a.png", "b.png"]);
    expect(
      sortEntries(items, { key: FilesSortKey.Name, ascending: false }).map((item) => item.name),
    ).toEqual(["c.png", "b.png", "a.png"]);
  });

  it("round-trips drag payloads and ignores foreign ones", () => {
    expect(decodeFilesDrag(encodeFilesDrag(["a", "b"]))).toEqual(["a", "b"]);
    expect(decodeFilesDrag("not json")).toEqual([]);
    expect(decodeFilesDrag('{"ids":["a"]}')).toEqual([]);
  });
});
