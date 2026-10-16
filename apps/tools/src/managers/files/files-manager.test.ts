import { describe, expect, it, vi } from "vitest";

import { FilesManager } from "$/managers/files/files-manager";
import { FilesFolder, TOOL_IMPORT_MAX_BYTES } from "$/managers/files/files-model";
import { FileEntryKind, type FileEntry, type FilesPort } from "$/managers/ports/files";

function fakePort(initial: FileEntry[] = []) {
  let entries = [...initial];
  const events: [string, Record<string, unknown>][] = [];
  const port: FilesPort = {
    list: async () => entries,
    add: async (file, folder) => {
      const entry: FileEntry = {
        id: `${folder}${file.name}`,
        kind: FileEntryKind.File,
        name: file.name,
        type: file.type,
        size: file.size,
        folder,
        createdAt: 1,
        modifiedAt: 1,
        openedAt: 1,
        label: 0,
        comment: "",
      };
      entries = [...entries, entry];
      return { entry, deduped: false };
    },
    read: async (item) => new File(["x"], item.name),
    update: async (id, patch) => {
      entries = entries.map((item) => (item.id === id ? { ...item, ...patch } : item));
    },
    duplicate: async () => {},
    touch: async () => {},
    trash: async (ids) => {
      entries = entries.map((item) => (ids.includes(item.id) ? { ...item, trashedAt: 5 } : item));
    },
    restore: async (ids) => {
      entries = entries.map((item) =>
        ids.includes(item.id) ? { ...item, trashedAt: undefined } : item,
      );
    },
    emptyTrash: async () => {
      const count = entries.filter((item) => item.trashedAt).length;
      entries = entries.filter((item) => !item.trashedAt);
      return count;
    },
    purgeTrash: async () => 0,
    thumbnail: async () => null,
    estimate: async () => ({ usage: 0, quota: 100, persisted: false }),
    persist: vi.fn(async () => true),
    download: vi.fn(async () => {}),
    openInEditor: vi.fn(async () => {}),
    openInTool: vi.fn(),
    takeHandoff: () => null,
    subscribe: () => () => {},
    capture: (event, properties) => events.push([event, properties]),
  };
  return { port, events };
}

describe("FilesManager", () => {
  it("remembers tool imports once, asks for persistence and never sends names", async () => {
    const { port, events } = fakePort();
    const manager = new FilesManager(port);
    await manager.remember(new File(["abc"], "secret-name.png"), "/tools/pixelate/");
    expect(manager.getSnapshot().entries.map((item) => item.name)).toEqual(["secret-name.png"]);
    expect(port.persist).toHaveBeenCalledTimes(1);
    expect(JSON.stringify(events)).not.toContain("secret-name");
  });

  it("does not keep files over the size limit", async () => {
    const { port } = fakePort();
    const manager = new FilesManager(port);
    const big = new File([], "big.png");
    Object.defineProperty(big, "size", { value: TOOL_IMPORT_MAX_BYTES + 1 });
    await manager.remember(big, "/tools/pixelate/");
    expect(manager.getSnapshot().entries).toEqual([]);
    expect(manager.getSnapshot().notice).toBe("files.notice.too.large");
  });

  it("moves items to the Trash, puts them away and empties it after confirmation", async () => {
    const { port } = fakePort();
    const manager = new FilesManager(port);
    await manager.importFiles([new File(["a"], "a.png"), new File(["b"], "b.png")], "/");
    await manager.trash(["/a.png"]);
    manager.setFolder(FilesFolder.Trash);
    expect(manager.visibleEntries().map((item) => item.name)).toEqual(["a.png"]);
    await manager.restore(["/a.png"]);
    expect(manager.folderCount(FilesFolder.Trash)).toBe(0);
    await manager.trash(["/a.png", "/b.png"]);
    manager.requestEmptyTrash();
    expect(manager.getSnapshot().confirmEmpty).toBe(true);
    await manager.emptyTrash();
    expect(manager.getSnapshot().entries).toEqual([]);
  });

  it("downloads one file directly and several as a dated zip", async () => {
    const { port } = fakePort();
    const manager = new FilesManager(port);
    await manager.importFiles([new File(["a"], "a.png"), new File(["b"], "b.png")], "/");
    await manager.download(["/a.png"]);
    await manager.download(["/a.png", "/b.png"]);
    const calls = vi.mocked(port.download).mock.calls;
    expect(calls[0][0]).toHaveLength(1);
    expect(calls[1][0]).toHaveLength(2);
    expect(calls[1][1]).toMatch(/^Xprite Files \d{4}-\d{2}-\d{2}\.zip$/);
  });

  it("loads a dropped item into the tool on this page", async () => {
    const { port } = fakePort();
    const manager = new FilesManager(port);
    await manager.importFiles([new File(["a"], "a.png", { type: "image/png" })], "/");
    const open = vi.fn(async () => {});
    manager.registerTarget({ path: "/tools/pixelate/", accept: "image/*,.png", open });
    const item = manager.entry("/a.png")!;
    expect(manager.accepts(manager.pageTarget()!, item)).toBe(true);
    await manager.openInTool("/tools/pixelate/", "/tools/pixelate/", item);
    expect(open).toHaveBeenCalledTimes(1);
    expect(port.openInTool).not.toHaveBeenCalled();
  });

  it("renames with Finder rules", async () => {
    const { port } = fakePort();
    const manager = new FilesManager(port);
    await manager.importFiles([new File(["a"], "a.png")], "/");
    await manager.rename("/a.png", "  new/name.png ");
    expect(manager.entry("/a.png")?.name).toBe("new-name.png");
  });
});

describe("FilesManager empty folders", () => {
  it("hides empty folders by default and toggles them", async () => {
    const { port } = fakePort();
    const manager = new FilesManager(port);
    expect(manager.getSnapshot().showEmpty).toBe(false);
    manager.toggleEmptyFolders();
    expect(manager.getSnapshot().showEmpty).toBe(true);
    manager.toggleEmptyFolders();
    expect(manager.getSnapshot().showEmpty).toBe(false);
  });
});

describe("FilesManager Finder window state", () => {
  it("opens enclosing folders up to Files and tracks the front window", async () => {
    const { port } = fakePort();
    const manager = new FilesManager(port);
    await manager.openWindow("menubar" as never, "/tools/pixelate/");
    expect(manager.getSnapshot()).toMatchObject({ open: true, active: true });
    manager.openEnclosing();
    expect(manager.getSnapshot().folder).toBe(FilesFolder.Root);
    manager.setActive(false);
    expect(manager.getSnapshot().active).toBe(false);
    manager.closeWindow();
    expect(manager.getSnapshot()).toMatchObject({ open: false, active: false });
  });
});
