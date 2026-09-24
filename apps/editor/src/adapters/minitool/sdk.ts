interface MiniToolApi {
  getLaunchOptions?(): Promise<{ miniToolEnv?: { buildVersion?: number; userDataPath?: string } }>;
  setStorage?(options: { key: string; data: string }): Promise<unknown>;
  getStorage?(options: { key: string }): Promise<{ data?: string | null }>;
  removeStorage?(options: { key: string }): Promise<unknown>;
  getFileStorageInfo?(): Promise<{
    usedBytes: number;
    limitBytes: number;
    writeChunkMaxBytes: number;
    readChunkMaxBytes: number;
  }>;
  mkdir?(options: { dirPath: string; recursive: boolean }): Promise<unknown>;
  writeFile?(options: { filePath: string; data: string; encoding: "base64" }): Promise<unknown>;
  appendFile?(options: { filePath: string; data: string; encoding: "base64" }): Promise<unknown>;
  readFile?(options: {
    filePath: string;
    encoding: "base64";
    position: number;
    length: number;
  }): Promise<{ data: string; bytesRead: number; eof: boolean }>;
  unlink?(options: { filePath: string }): Promise<unknown>;
  saveImageToPhotosAlbum?(options: { filePath: string }): Promise<unknown>;
  writeTempFile?(options: { data: string }): Promise<{ filePath: string }>;
  postNote?(options: {
    title?: string;
    content?: string;
    mediaInfo: { image_resources: { url: string }[] };
  }): Promise<unknown>;
}

interface MiniToolWindow extends Window {
  xhs?: {
    miniTool?: MiniToolApi;
    launchOptions?: { miniToolEnv?: { buildVersion?: number; userDataPath?: string } };
  };
}

const STORAGE_VERSION = 9460;
const FILES_VERSION = 9490;
const STORAGE_CHUNK_BYTES = 192 * 1024;
const BASE64_SLICE_BYTES = 8192;
const STORE_DIRECTORY = "xprite";
const STORE_PREFIX = "xprite:v1:";
const PREFERENCES_KEY = "preferences";
const INLINE_IMAGE_BYTES = 100 * 1024;
const BRIDGE_TIMEOUT_MS = 12_000;
const USER_ACTION_TIMEOUT_MS = 120_000;
const STORAGE_QUOTA_MESSAGE =
  "小红书本地存储空间不足，本次保存未完成。请先导出需要保留的图片，再关闭并在主页删除不需要的浏览器副本，然后重试保存。";
enum MiniToolMethod {
  GetLaunchOptions = "getLaunchOptions",
  GetStorage = "getStorage",
  SetStorage = "setStorage",
  RemoveStorage = "removeStorage",
  GetFileStorageInfo = "getFileStorageInfo",
  Mkdir = "mkdir",
  WriteFile = "writeFile",
  AppendFile = "appendFile",
  ReadFile = "readFile",
  Unlink = "unlink",
  SaveImageToPhotosAlbum = "saveImageToPhotosAlbum",
  WriteTempFile = "writeTempFile",
  PostNote = "postNote",
}
interface MiniToolStorage {
  getStorage(options: { key: string }): Promise<{ data?: string | null }>;
  setStorage(options: { key: string; data: string }): Promise<unknown>;
  removeStorage(options: { key: string }): Promise<unknown>;
}
const preferences = new Map<string, string>();
let preferenceQueue = Promise.resolve();
let api: MiniToolApi;
let storageApi: MiniToolStorage;
let directory: string | null = null;
let chunkBytes = STORAGE_CHUNK_BYTES;

export function encodeBase64(bytes: Uint8Array): string {
  const parts: string[] = [];
  for (let start = 0; start < bytes.length; start += BASE64_SLICE_BYTES)
    parts.push(String.fromCharCode(...bytes.subarray(start, start + BASE64_SLICE_BYTES)));
  return btoa(parts.join(""));
}

export function decodeBase64(value: string): Uint8Array {
  const binary = atob(value);
  return Uint8Array.from(binary, (character) => character.charCodeAt(0));
}

export async function initializeMiniTool(): Promise<void> {
  const xhs = (window as MiniToolWindow).xhs;
  api = bridgeApi(xhs?.miniTool ?? {});
  const options = xhs?.launchOptions?.miniToolEnv?.buildVersion
    ? xhs.launchOptions
    : await api.getLaunchOptions?.();
  const buildVersion = Number(options?.miniToolEnv?.buildVersion);
  const version =
    Number.isFinite(buildVersion) && buildVersion > 0 ? Math.floor(buildVersion / 1000) : null;
  const nativeStorage =
    version !== null &&
    version >= STORAGE_VERSION &&
    typeof api.getStorage === "function" &&
    typeof api.setStorage === "function";
  storageApi = nativeStorage
    ? {
        getStorage: (options) => api.getStorage!(options),
        setStorage: (options) => api.setStorage!(options),
        removeStorage: async (options) => api.removeStorage?.(options),
      }
    : browserPreviewStorage();
  if (
    nativeStorage &&
    version !== null &&
    version >= FILES_VERSION &&
    options?.miniToolEnv?.userDataPath &&
    api.writeFile &&
    api.readFile &&
    api.getFileStorageInfo &&
    api.mkdir &&
    api.appendFile &&
    api.unlink &&
    api.removeStorage
  ) {
    directory = `${options.miniToolEnv.userDataPath}/${STORE_DIRECTORY}`;
    const limits = await api.getFileStorageInfo();
    if (
      !Number.isFinite(limits.writeChunkMaxBytes) ||
      !Number.isFinite(limits.readChunkMaxBytes) ||
      limits.writeChunkMaxBytes < 4 ||
      limits.readChunkMaxBytes < 4
    )
      throw new Error("小红书文件存储能力不可用。");
    chunkBytes = Math.max(
      1,
      Math.floor(
        Math.min(limits.writeChunkMaxBytes, limits.readChunkMaxBytes, STORAGE_CHUNK_BYTES) / 4,
      ) * 3,
    );
    await api.mkdir({ dirPath: directory, recursive: true });
  }
  const saved = await readJson<Record<string, string>>(PREFERENCES_KEY, {});
  for (const [key, value] of Object.entries(saved))
    if (typeof value === "string") preferences.set(key, value);
}

/** Both callback and Promise forms are documented; normalize them at the host boundary. */
function bridgeApi(native: MiniToolApi): MiniToolApi {
  const result: Record<string, (options?: Record<string, unknown>) => Promise<unknown>> = {};
  for (const name of Object.values(MiniToolMethod)) {
    const method = native[name];
    if (typeof method !== "function") continue;
    result[name] = (options = {}) =>
      new Promise((resolve, reject) => {
        let settled = false;
        const timer = setTimeout(
          () => finish(false, new Error("小红书没有响应操作请求，请关闭预览后重试。")),
          name === MiniToolMethod.SaveImageToPhotosAlbum || name === MiniToolMethod.PostNote
            ? USER_ACTION_TIMEOUT_MS
            : BRIDGE_TIMEOUT_MS,
        );
        const finish = (success: boolean, value: unknown) => {
          if (settled) return;
          settled = true;
          clearTimeout(timer);
          if (success) {
            resolve(value);
            return;
          }
          const detail = value as { errMsg?: unknown; message?: unknown } | null;
          const message = String(detail?.errMsg ?? detail?.message ?? value);
          if (
            name === MiniToolMethod.GetStorage &&
            /(?:key|data|item).*(?:not.?found|not.?exist)|(?:not.?found|not.?exist).*(?:key|data|item)|键.*不存在/i.test(
              message,
            )
          ) {
            resolve({ data: null });
            return;
          }
          const error = value instanceof Error ? value : new Error(message);
          const writesStorage =
            name === MiniToolMethod.SetStorage ||
            name === MiniToolMethod.WriteFile ||
            name === MiniToolMethod.AppendFile;
          reject(
            writesStorage &&
              /quota.*exceed|total.*over.*limit|storage.*(?:full|limit)|配额|空间不足/i.test(
                message,
              )
              ? Object.assign(new Error(STORAGE_QUOTA_MESSAGE), { cause: error })
              : error,
          );
        };
        try {
          const pending = (method as (options: Record<string, unknown>) => unknown).call(native, {
            ...options,
            success: (value: unknown) => finish(true, value),
            fail: (error: unknown) => finish(false, error),
          });
          if (pending && typeof (pending as Promise<unknown>).then === "function")
            void (pending as Promise<unknown>).then(
              (value) => finish(true, value),
              (error) => finish(false, error),
            );
        } catch (error) {
          finish(false, error);
        }
      });
  }
  return result as MiniToolApi;
}

/** Official fallback for preview hosts or clients without a supported Storage API. */
function browserPreviewStorage(): MiniToolStorage {
  const readStorage = (): Storage => {
    try {
      const storage = window.localStorage;
      if (!storage) throw new Error();
      return storage;
    } catch {
      throw new Error("当前预览环境无法访问本地存储。请允许站点存储，或在小红书 App 中扫码预览。");
    }
  };
  return {
    getStorage: async ({ key }) => ({ data: readStorage().getItem(key) }),
    setStorage: async ({ key, data }) => {
      readStorage().setItem(key, data);
    },
    removeStorage: async ({ key }) => {
      readStorage().removeItem(key);
    },
  };
}

/** Writes finish before a catalog publishes the new immutable generation. */
export async function writeBytes(key: string, bytes: Uint8Array): Promise<void> {
  if (directory) {
    const pointerKey = `${STORE_PREFIX}file:${key}`;
    const old = await storageApi.getStorage({ key: pointerKey });
    // Keep the old generation until publication; the full new payload needs free space.
    const limits = await api.getFileStorageInfo!();
    if (
      !Number.isSafeInteger(limits.usedBytes) ||
      !Number.isSafeInteger(limits.limitBytes) ||
      limits.usedBytes < 0 ||
      limits.limitBytes < 1
    )
      throw new Error("小红书文件存储容量信息不可用。");
    const remainingBytes = Math.max(0, limits.limitBytes - limits.usedBytes);
    if (bytes.length > remainingBytes)
      throw new Error(
        `${STORAGE_QUOTA_MESSAGE}（本次需要 ${bytes.length.toLocaleString()} 字节，当前剩余 ${remainingBytes.toLocaleString()} 字节。）`,
      );
    // Storage keys can contain colons; percent-encoding them is not a valid native filename.
    // The pointer already identifies the key, so the immutable file needs only a generation ID.
    const filePath = `${directory}/${Date.now()}-${Math.random().toString(36).slice(2)}.bin`;
    try {
      const chunks = Math.max(1, Math.ceil(bytes.length / chunkBytes));
      for (let index = 0; index < chunks; index++) {
        const options = {
          filePath,
          data: encodeBase64(bytes.subarray(index * chunkBytes, (index + 1) * chunkBytes)),
          encoding: "base64" as const,
        };
        await (index === 0 ? api.writeFile!(options) : api.appendFile!(options));
      }
      const saved = await readContainerFile(filePath);
      if (saved.length !== bytes.length || saved.some((byte, index) => byte !== bytes[index]))
        throw new Error("小工具存储写入校验失败。");
      await storageApi.setStorage({
        key: pointerKey,
        data: JSON.stringify({ filePath, length: bytes.length }),
      });
    } catch (error) {
      await api.unlink?.({ filePath }).catch(() => {});
      throw error;
    }
    if (old.data) {
      const previous = JSON.parse(old.data) as { filePath: string };
      await api.unlink?.({ filePath: previous.filePath }).catch(() => {});
    }
    return;
  }
  const id = `${Date.now()}-${Math.random().toString(36).slice(2)}`;
  const count = Math.max(1, Math.ceil(bytes.length / STORAGE_CHUNK_BYTES));
  const old = await storageApi.getStorage({ key: STORE_PREFIX + key });
  let attemptedChunks = 0;
  try {
    for (let index = 0; index < count; index++) {
      attemptedChunks = index + 1;
      await storageApi.setStorage({
        key: `${STORE_PREFIX}${key}:${id}:${index}`,
        data: JSON.stringify(
          encodeBase64(
            bytes.subarray(index * STORAGE_CHUNK_BYTES, (index + 1) * STORAGE_CHUNK_BYTES),
          ),
        ),
      });
    }
    await storageApi.setStorage({
      key: STORE_PREFIX + key,
      data: JSON.stringify({ id, count, length: bytes.length }),
    });
  } catch (error) {
    for (let index = 0; index < attemptedChunks; index++)
      await storageApi
        .removeStorage({ key: `${STORE_PREFIX}${key}:${id}:${index}` })
        .catch(() => {});
    throw error;
  }
  if (old.data && storageApi.removeStorage) {
    const previous = JSON.parse(old.data) as { id: string; count: number };
    for (let index = 0; index < previous.count; index++)
      await storageApi
        .removeStorage({ key: `${STORE_PREFIX}${key}:${previous.id}:${index}` })
        .catch(() => {});
  }
}

async function readContainerFile(filePath: string): Promise<Uint8Array> {
  const parts: Uint8Array[] = [];
  let position = 0;
  for (;;) {
    const result = await api.readFile!({
      filePath,
      encoding: "base64",
      position,
      length: chunkBytes,
    });
    const bytes = decodeBase64(result.data);
    if (bytes.length !== result.bytesRead) throw new Error("小工具存储读取长度不正确。");
    parts.push(bytes);
    position += result.bytesRead;
    if (result.eof) break;
    if (!result.bytesRead) throw new Error("小工具存储读取没有进展。");
  }
  const joined = new Uint8Array(position);
  let offset = 0;
  for (const part of parts) {
    joined.set(part, offset);
    offset += part.length;
  }
  return joined;
}

export async function readBytes(key: string): Promise<Uint8Array | null> {
  if (directory) {
    const pointer = await storageApi.getStorage({ key: `${STORE_PREFIX}file:${key}` });
    if (!pointer.data) return null;
    const record = JSON.parse(pointer.data) as { filePath: string; length: number };
    if (
      !record.filePath.startsWith(directory + "/") ||
      !Number.isSafeInteger(record.length) ||
      record.length < 0
    )
      throw new Error("小工具存储记录损坏。");
    const bytes = await readContainerFile(record.filePath);
    if (bytes.length !== record.length) throw new Error("小工具存储长度不正确。");
    return bytes;
  }
  const result = await storageApi.getStorage({ key: STORE_PREFIX + key });
  if (!result.data) return null;
  const record = JSON.parse(result.data) as { id: string; count: number; length: number };
  if (
    !Number.isSafeInteger(record.length) ||
    record.length < 0 ||
    !Number.isSafeInteger(record.count) ||
    record.count < 1 ||
    record.count !== Math.max(1, Math.ceil(record.length / STORAGE_CHUNK_BYTES))
  )
    throw new Error("小工具存储记录损坏。");
  const bytes = new Uint8Array(record.length);
  for (let index = 0; index < record.count; index++) {
    const part = await storageApi.getStorage({
      key: `${STORE_PREFIX}${key}:${record.id}:${index}`,
    });
    if (typeof part.data !== "string") throw new Error("小工具存储数据缺失。");
    const data: unknown = JSON.parse(part.data);
    if (typeof data !== "string") throw new Error("小工具存储分片格式不正确。");
    bytes.set(decodeBase64(data), index * STORAGE_CHUNK_BYTES);
  }
  return bytes;
}

export async function removeBytes(key: string): Promise<void> {
  if (directory) {
    const keyName = `${STORE_PREFIX}file:${key}`;
    const pointer = await storageApi.getStorage({ key: keyName });
    if (pointer.data) {
      const record = JSON.parse(pointer.data) as { filePath: string };
      await storageApi.removeStorage({ key: keyName });
      await api.unlink?.({ filePath: record.filePath });
    }
    return;
  }
  const result = await storageApi.getStorage({ key: STORE_PREFIX + key });
  if (result.data && storageApi.removeStorage) {
    const record = JSON.parse(result.data) as { id: string; count: number };
    await storageApi.removeStorage({ key: STORE_PREFIX + key });
    for (let index = 0; index < record.count; index++)
      await storageApi.removeStorage({ key: `${STORE_PREFIX}${key}:${record.id}:${index}` });
  }
}

export async function readJson<T>(key: string, initial: T): Promise<T> {
  const bytes = await readBytes(key);
  return bytes
    ? (JSON.parse(new TextDecoder().decode(bytes), (_key, value) => {
        if (
          value &&
          typeof value === "object" &&
          typeof value.__xpriteBinary === "string" &&
          typeof value.data === "string"
        ) {
          const buffer = decodeBase64(value.data).buffer;
          if (value.__xpriteBinary === "ArrayBuffer") return buffer;
          const types = {
            Uint8Array,
            Uint8ClampedArray,
            Uint16Array,
            Uint32Array,
            Int8Array,
            Int16Array,
            Int32Array,
            Float32Array,
            Float64Array,
          };
          const Constructor = types[value.__xpriteBinary as keyof typeof types];
          if (Constructor) return new Constructor(buffer);
        }
        return value;
      }) as T)
    : initial;
}

export function writeJson(key: string, value: unknown): Promise<void> {
  return writeBytes(
    key,
    new TextEncoder().encode(
      JSON.stringify(value, (_key, item) => {
        if (item instanceof ArrayBuffer)
          return { __xpriteBinary: "ArrayBuffer", data: encodeBase64(new Uint8Array(item)) };
        if (ArrayBuffer.isView(item))
          return {
            __xpriteBinary: item.constructor.name,
            data: encodeBase64(new Uint8Array(item.buffer, item.byteOffset, item.byteLength)),
          };
        return item;
      }),
    ),
  );
}

export const miniToolPreferences = {
  getItem: (key: string) => preferences.get(key) ?? null,
  setItem(key: string, value: string): void {
    preferences.set(key, value);
    const values = Object.fromEntries(preferences);
    preferenceQueue = preferenceQueue
      .catch(() => {})
      .then(() => writeJson(PREFERENCES_KEY, values));
    void preferenceQueue.catch((error) =>
      console.error("Unable to save Xprite preferences", error),
    );
  },
  removeItem(key: string): void {
    preferences.delete(key);
    const values = Object.fromEntries(preferences);
    preferenceQueue = preferenceQueue
      .catch(() => {})
      .then(() => writeJson(PREFERENCES_KEY, values));
    void preferenceQueue.catch((error) =>
      console.error("Unable to save Xprite preferences", error),
    );
  },
};

export async function saveAlbumImage(blob: Blob): Promise<void> {
  if (!/^image\/(png|jpeg|webp|gif)$/i.test(blob.type))
    throw new Error("小红书内请导出 PNG、JPEG、WebP 或 GIF 图片。");
  if (!api.saveImageToPhotosAlbum) throw new Error("当前小红书版本不支持保存图片。");
  const data = await blobDataUrl(blob);
  const filePath =
    blob.size > INLINE_IMAGE_BYTES && api.writeTempFile
      ? (await api.writeTempFile({ data })).filePath
      : data;
  await api.saveImageToPhotosAlbum({ filePath });
}

function blobDataUrl(blob: Blob): Promise<string> {
  return new Promise((resolve, reject) => {
    const reader = new FileReader();
    reader.onload = () => resolve(String(reader.result));
    reader.onerror = () => reject(reader.error);
    reader.readAsDataURL(blob);
  });
}

export function inlineAssetBlob(url: string): Blob {
  const match = /^data:([^;,]*)(;base64)?,([\s\S]*)$/.exec(url);
  if (!match) throw new Error("Xprite 小工具只能读取包内资源。");
  const bytes = match[2]
    ? decodeBase64(match[3])
    : new TextEncoder().encode(decodeURIComponent(match[3]));
  return new Blob([bytes as BlobPart], { type: match[1] || "application/octet-stream" });
}
