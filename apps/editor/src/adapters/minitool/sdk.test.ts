import { afterEach, beforeEach, expect, it, vi } from "vitest";

beforeEach(() => vi.resetModules());
afterEach(() => vi.unstubAllGlobals());

async function container() {
  const files = new Map<string, Uint8Array>();
  const storage = new Map<string, string>();
  const quota = { limitBytes: 1024, failAppend: false, failCatalog: false };
  const sdk = await import("$/adapters/minitool/sdk");
  const api = {
    getStorage: async ({ key }: { key: string }) => ({ data: storage.get(key) ?? null }),
    setStorage: async ({ key, data }: { key: string; data: string }) => {
      if (quota.failCatalog && key === "xprite:v1:file:projects")
        throw { errMsg: "setStorage:fail storage quota exceed reason total over limit" };
      storage.set(key, data);
    },
    removeStorage: async ({ key }: { key: string }) => {
      storage.delete(key);
    },
    getFileStorageInfo: async () => ({
      usedBytes: [...files.values()].reduce((sum, bytes) => sum + bytes.length, 0),
      limitBytes: quota.limitBytes,
      writeChunkMaxBytes: 8,
      readChunkMaxBytes: 8,
    }),
    mkdir: async () => {},
    writeFile: vi.fn(async ({ filePath, data }: { filePath: string; data: string }) => {
      files.set(filePath, sdk.decodeBase64(data));
    }),
    appendFile: async ({ filePath, data }: { filePath: string; data: string }) => {
      if (quota.failAppend)
        throw { errMsg: "appendFile:fail storage quota exceed reason total total over limit" };
      const previous = files.get(filePath)!;
      const next = sdk.decodeBase64(data);
      const joined = new Uint8Array(previous.length + next.length);
      joined.set(previous);
      joined.set(next, previous.length);
      files.set(filePath, joined);
    },
    readFile: async (options: { filePath: string; position: number; length: number }) => {
      const bytes = files.get(options.filePath)!;
      const part = bytes.subarray(options.position, options.position + options.length);
      return {
        data: sdk.encodeBase64(part),
        bytesRead: part.length,
        eof: options.position + part.length >= bytes.length,
      };
    },
    unlink: async ({ filePath }: { filePath: string }) => {
      files.delete(filePath);
    },
  };
  vi.stubGlobal("window", {
    xhs: {
      launchOptions: { miniToolEnv: { buildVersion: 9490001, userDataPath: "/usr" } },
      miniTool: api,
    },
  });
  await sdk.initializeMiniTool();
  return { sdk, api, files, storage, quota };
}

it("accounts for the live generation before writing and preserves it when quota is insufficient", async () => {
  const { sdk, api, files, quota } = await container();
  const original = new Uint8Array([1, 2, 3]);
  await sdk.writeBytes("document", original);
  const savedFiles = new Map(files);
  quota.limitBytes = 10;
  api.writeFile.mockClear();

  await expect(sdk.writeBytes("document", new Uint8Array(8))).rejects.toThrow(/存储空间不足/);

  expect(api.writeFile).not.toHaveBeenCalled();
  expect(files).toEqual(savedFiles);
  expect(await sdk.readBytes("document")).toEqual(original);
});

it("cleans a failed append, keeps the previous head, and allows retry", async () => {
  const { sdk, files, quota } = await container();
  const original = new Uint8Array([1, 2, 3]);
  await sdk.writeBytes("document", original);
  const savedFiles = new Map(files);
  const replacement = new Uint8Array(12).fill(4);
  quota.failAppend = true;

  await expect(sdk.writeBytes("document", replacement)).rejects.toThrow(/存储空间不足/);

  expect(files).toEqual(savedFiles);
  expect(await sdk.readBytes("document")).toEqual(original);
  quota.failAppend = false;
  await sdk.writeBytes("document", replacement);
  expect(await sdk.readBytes("document")).toEqual(replacement);
  expect(files.size).toBe(1);
});

it("removes unpublished project data if catalog publication exceeds quota", async () => {
  const { files, storage, quota } = await container();
  const { createMiniToolProjectStorage } = await import("$/adapters/minitool/project-storage");
  const { ProjectRepository } = await import("$/managers/storage/project-repository");
  const repository = new ProjectRepository(createMiniToolProjectStorage());
  const original = new Uint8Array([1, 2, 3]);
  const record = await repository.save({
    projectId: "project",
    expectedHead: null,
    bytes: original,
    metadata: { name: "Project" },
  });
  const savedFiles = new Map(files);
  const savedStorage = new Map(storage);
  quota.failCatalog = true;

  await expect(
    repository.save({
      projectId: "project",
      expectedHead: record.head.id,
      bytes: new Uint8Array([4, 5, 6]),
      metadata: { name: "Project" },
    }),
  ).rejects.toThrow(/存储空间不足/);

  expect(files).toEqual(savedFiles);
  expect(storage).toEqual(savedStorage);
  expect((await repository.load("project"))?.bytes).toEqual(original);
});

it("recovers a previous snapshot for explicit missing files and preserves permission failures", async () => {
  const { api, storage, quota } = await container();
  quota.limitBytes = 16 * 1024;
  const { createMiniToolProjectStorage } = await import("$/adapters/minitool/project-storage");
  const { ProjectRepository } = await import("$/managers/storage/project-repository");
  const repository = new ProjectRepository(createMiniToolProjectStorage());
  const input = {
    projectId: "project",
    bytes: new Uint8Array([1, 2, 3]),
    metadata: { name: "Project" },
  };
  const first = await repository.save({ ...input, expectedHead: null });
  const second = await repository.save({
    ...input,
    bytes: new Uint8Array([4, 5, 6]),
    expectedHead: first.head.id,
  });
  const payloadId = second.head.parts?.[0].id ?? second.head.id;
  const pointer = JSON.parse(storage.get(`xprite:v1:file:snapshot:${payloadId}`)!);
  const readFile = api.readFile;
  let code = "ENOENT";
  api.readFile = async (options) => {
    if (options.filePath === pointer.filePath) throw { code, errMsg: "readFile failed" };
    return readFile(options);
  };

  const recovered = await repository.load("project");
  expect(recovered?.recovered).toBe(true);
  expect(recovered?.bytes).toEqual(input.bytes);

  code = "EACCES";
  await expect(repository.load("project")).rejects.toThrow("readFile failed");
  repository.close();
});
