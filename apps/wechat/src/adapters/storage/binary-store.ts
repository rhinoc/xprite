import { cloneGraph } from "@xprite/editor-core/base";

const STORE_DIRECTORY = "xprite-workspace";
const FILE_KEY_PREFIX = "xprite:workspace:file:";

/** Native files are immutable generations; publish pointers only after read-back. */
export class WechatBinaryStore {
  private readonly fs = wx.getFileSystemManager();
  private readonly directory = `${wx.env.USER_DATA_PATH}/${STORE_DIRECTORY}`;
  constructor() {
    try {
      this.fs.accessSync(this.directory);
    } catch {
      this.fs.mkdirSync(this.directory, true);
    }
  }
  read(key: string): Uint8Array | null {
    const path: unknown = wx.getStorageSync(FILE_KEY_PREFIX + key);
    if (!path) return null;
    if (typeof path !== "string" || !path.startsWith(this.directory + "/"))
      throw new Error("Invalid workspace file pointer");
    const data = this.fs.readFileSync(path, "base64");
    if (typeof data !== "string") throw new Error("Invalid workspace file data");
    return new Uint8Array(wx.base64ToArrayBuffer(data));
  }
  write(key: string, bytes: Uint8Array): void {
    const previous: unknown = wx.getStorageSync(FILE_KEY_PREFIX + key);
    const path = `${this.directory}/${Date.now()}-${Math.random().toString(36).slice(2)}.bin`;
    try {
      this.fs.writeFileSync(
        path,
        wx.arrayBufferToBase64(bytes.slice().buffer as ArrayBuffer),
        "base64",
      );
      const data = this.fs.readFileSync(path, "base64");
      const checked =
        typeof data === "string" ? new Uint8Array(wx.base64ToArrayBuffer(data)) : null;
      if (
        !checked ||
        checked.length !== bytes.length ||
        checked.some((value, index) => value !== bytes[index])
      )
        throw new Error(
          `Workspace write verification failed: expected ${bytes.length}, received ${checked?.length ?? "non-ArrayBuffer"} (${Object.prototype.toString.call(data)})`,
        );
      wx.setStorageSync(FILE_KEY_PREFIX + key, path);
    } catch (error) {
      try {
        this.fs.unlinkSync(path);
      } catch {}
      throw error;
    }
    if (typeof previous === "string" && previous.startsWith(this.directory + "/")) {
      try {
        this.fs.unlinkSync(previous);
      } catch {}
    }
  }
  remove(key: string): void {
    const path: unknown = wx.getStorageSync(FILE_KEY_PREFIX + key);
    wx.removeStorageSync(FILE_KEY_PREFIX + key);
    if (typeof path === "string" && path.startsWith(this.directory + "/")) {
      try {
        this.fs.unlinkSync(path);
      } catch {}
    }
  }
  readJson<T>(key: string, initial: T): T {
    const data: unknown = wx.getStorageSync(`xprite:workspace:json:${key}`);
    return data ? cloneGraph(data as T) : initial;
  }
  writeJson(key: string, value: unknown): void {
    wx.setStorageSync(`xprite:workspace:json:${key}`, cloneGraph(value));
  }
}
