import { zlibSync, unzlibSync } from "fflate";

import { WechatBinaryStore } from "$/adapters/storage/binary-store";
import { decodeImageBlob, encodePngBlob } from "@xprite/bedrock/browser/images";
import { sha256Hex, randomId } from "@xprite/bedrock/browser/runtime-crypto";
import { decodeAnimatedImageSource, decodeAsepriteBlob } from "@xprite/editor-app/browser-io";
import type { WorkspaceSessionPorts } from "@xprite/editor-app/host-contracts";
import { cloneGraph } from "@xprite/editor-core/base";
import {
  analyzePixelArt,
  pixelateImage,
  encodeAseprite,
  asepriteFromProject,
  projectPngImage,
} from "@xprite/editor-core/import-export";
import {
  SessionSaveIntent,
  type SessionProject,
  type SessionRecentImage,
  type SessionRecentEntry,
  type SessionRecentMetadata,
  recentImageRetainedBytes,
} from "@xprite/editor-core/session";

const RECENT_CATALOG_READ_ATTEMPTS = 2;
const RECENTS_KEY = "recent-projects-v2";
const EXPORT_DIRECTORY = "xprite-exports";
const MIME_TYPES: Record<string, string> = {
  png: "image/png",
  jpg: "image/jpeg",
  jpeg: "image/jpeg",
  gif: "image/gif",
  webp: "image/webp",
  ase: "application/x-aseprite",
  aseprite: "application/x-aseprite",
};
type Source = { name: string; blob: Blob } | { name: string; load: () => Promise<SessionProject> };
type RecentRecord = {
  id: string;
  name: string;
  width: number;
  height: number;
  bytes: number;
  generation: string;
  aseprite: boolean;
};

export const wechatAsepriteOptions = {
  inflate: (bytes: Uint8Array, expected: number) => {
    const data = unzlibSync(bytes, { out: new Uint8Array(expected + 1) });
    if (data.length !== expected) throw new Error("Invalid inflated pixel length");
    return data;
  },
};

export class WechatWorkspaceSession implements WorkspaceSessionPorts {
  private readonly sources = new Map<string, Source>();
  private writes: Promise<void> = Promise.resolve();
  private readonly recentVersions = new Map<string, { token: object; generation: string }>();
  private recentCatalogRevision = 0;
  constructor(private readonly store: WechatBinaryStore) {}
  registerAsset(url: string, name: string) {
    const embedded = /^data:([^;,]+);base64,(.*)$/.exec(url);
    const bytes = embedded
      ? wx.base64ToArrayBuffer(embedded[2])
      : wx.getFileSystemManager().readFileSync(url.split("?", 1)[0]);
    if (!(bytes instanceof ArrayBuffer)) throw new Error("无法读取包内作品。");
    return this.register({
      name,
      blob: new Blob([bytes], { type: MIME_TYPES[name.split(".").at(-1)?.toLowerCase() ?? ""] }),
    });
  }
  registerFile(file: File) {
    return this.register({ name: file.name, blob: file });
  }
  registerProject(name: string, load: () => Promise<SessionProject>) {
    return this.register({ name, load });
  }
  private register(source: Source) {
    const token = randomId();
    this.sources.set(token, source);
    return { source: token, name: source.name };
  }
  private source(token: string) {
    const value = this.sources.get(token);
    if (!value) throw new Error("文档来源已失效。");
    return value;
  }
  releaseSource = (token: string) => {
    this.sources.delete(token);
  };
  bindSourceToDocument(): void {}
  releaseDocumentHandle(): void {}
  hydrateDocumentHandles = async () => {};
  pickFiles = async () => {
    try {
      const pick = await new Promise<number>((resolve, reject) =>
        wx.showActionSheet({
          itemList: ["从聊天选择文件", "从相册选择图片"],
          success: (result) => resolve(result.tapIndex),
          fail: reject,
        }),
      );
      if (pick === 0) {
        const files = await new Promise<WechatMiniprogram.ChooseMessageFileSuccessCallbackResult>(
          (resolve, reject) =>
            wx.chooseMessageFile({ count: 100, type: "all", success: resolve, fail: reject }),
        );
        return files.tempFiles.map((file) => this.fromNativeFile(file.path, file.name));
      }
      const images = await new Promise<WechatMiniprogram.ChooseMediaSuccessCallbackResult>(
        (resolve, reject) =>
          wx.chooseMedia({
            count: 9,
            mediaType: ["image"],
            sourceType: ["album"],
            sizeType: ["original"],
            success: resolve,
            fail: reject,
          }),
      );
      return images.tempFiles.map((file) =>
        this.fromNativeFile(file.tempFilePath, file.tempFilePath.split("/").at(-1) ?? "image.png"),
      );
    } catch (error) {
      if (
        error &&
        typeof error === "object" &&
        "errMsg" in error &&
        /cancel/.test(String(error.errMsg))
      )
        return [];
      throw error;
    }
  };
  private fromNativeFile(path: string, name: string) {
    const data = wx.getFileSystemManager().readFileSync(path);
    if (!(data instanceof ArrayBuffer)) throw new Error("无法读取文件。");
    return this.registerFile(
      new File([data], name, { type: MIME_TYPES[name.split(".").at(-1)?.toLowerCase() ?? ""] }),
    );
  }
  identifySource = async (token: string) => {
    const source = this.source(token);
    return "blob" in source
      ? `file:${source.name}:${await sha256Hex(new Uint8Array(await source.blob.arrayBuffer()))}`
      : null;
  };
  decode = async (token: string) => {
    const source = this.source(token);
    return "load" in source ? (await source.load()).image : decodeImageBlob(source.blob);
  };
  decodeProject = async (token: string) => {
    const source = this.source(token);
    return "load" in source ? source.load() : this.project(source.blob, source.name);
  };
  private project(blob: Blob, name: string) {
    return /\.ase(?:prite)?$/i.test(name)
      ? decodeAsepriteBlob(blob, name, wechatAsepriteOptions)
      : decodeAnimatedImageSource(new File([blob], name, { type: blob.type }), name);
  }
  analyze: WorkspaceSessionPorts["analyze"] = async (image) => analyzePixelArt(image);
  pixelate: WorkspaceSessionPorts["pixelate"] = async (image, options) =>
    pixelateImage(image, options);
  write: WorkspaceSessionPorts["write"] = async (image, name) =>
    this.exportBlob(await encodePngBlob(image), name.replace(/\.[^.]+$/, "") + ".png", "png");
  writeProject: NonNullable<WorkspaceSessionPorts["writeProject"]> = async (
    project,
    name,
    intent,
  ) => {
    if (intent === SessionSaveIntent.Export || /\.png$/i.test(name))
      return this.write(projectPngImage(project), name, intent);
    const bytes = await encodeAseprite(
      asepriteFromProject(project, { preserveGroupMetadata: true }),
      { compress: true, deflate: zlibSync },
    );
    return this.exportBlob(
      new Blob([bytes as BlobPart], { type: "application/x-aseprite" }),
      name.replace(/\.(ase|aseprite)$/i, "") + ".aseprite",
      "aseprite",
    );
  };
  private async exportBlob(blob: Blob, name: string, format: "png" | "aseprite") {
    const fs = wx.getFileSystemManager(),
      directory = `${wx.env.USER_DATA_PATH}/${EXPORT_DIRECTORY}`;
    try {
      fs.accessSync(directory);
    } catch {
      fs.mkdirSync(directory, true);
    }
    const filename = name.replace(/[\\/:*?"<>|]/g, "_");
    const filePath = `${directory}/${filename}`;
    fs.writeFileSync(filePath, await blob.arrayBuffer());
    if (format === "png")
      await new Promise<void>((resolve, reject) =>
        wx.saveImageToPhotosAlbum({ filePath, success: () => resolve(), fail: reject }),
      );
    else
      await new Promise<void>((resolve, reject) =>
        wx.shareFileMessage({
          filePath,
          fileName: filename,
          success: () => resolve(),
          fail: reject,
        }),
      );
    return { method: "file" as const, name: filename, format };
  }
  listRecentImages = async (): Promise<SessionRecentMetadata[]> => {
    for (let attempt = 0; attempt < RECENT_CATALOG_READ_ATTEMPTS; attempt++) {
      await this.writes;
      const revision = this.recentCatalogRevision;
      const records = this.store.readJson<RecentRecord[]>(RECENTS_KEY, []);
      if (revision !== this.recentCatalogRevision) continue;
      return records.map((record) => {
        const previous = this.recentVersions.get(record.id);
        const contentVersion = previous?.generation === record.generation ? previous.token : {};
        this.recentVersions.set(record.id, {
          token: contentVersion,
          generation: record.generation,
        });
        return {
          id: record.id,
          name: record.name,
          width: record.width,
          height: record.height,
          bytes: record.bytes,
          contentVersion,
        };
      });
    }
    throw new Error("最近作品记录已改变，请重新打开列表。");
  };
  readRecentImage = async (id: string): Promise<SessionRecentImage | null> => {
    await this.writes;
    const revision = this.recentCatalogRevision;
    const record = this.store
      .readJson<RecentRecord[]>(RECENTS_KEY, [])
      .find((item) => item.id === id);
    if (!record || revision !== this.recentCatalogRevision) return null;
    const previous = this.recentVersions.get(id);
    const contentVersion = previous?.generation === record.generation ? previous.token : {};
    this.recentVersions.set(id, { token: contentVersion, generation: record.generation });
    const bytes = this.store.read(`recent:${record.generation}`);
    if (!bytes) throw new Error("最近作品文件不存在。");
    const blob = new Blob([bytes as BlobPart], {
      type: record.aseprite ? "application/x-aseprite" : "image/png",
    });
    const project = record.aseprite
      ? await decodeAsepriteBlob(blob, record.name, wechatAsepriteOptions)
      : undefined;
    const image = project?.image ?? (await decodeImageBlob(blob));
    const current = this.recentVersions.get(id);
    if (current?.generation !== record.generation || current.token !== contentVersion) return null;
    return {
      id,
      name: record.name,
      image,
      ...(project ? { project } : {}),
      contentVersion,
    };
  };
  saveRecentImages = (images: readonly SessionRecentEntry[]): Promise<void> => {
    const snapshot = images.map((item) => (item.contentVersion ? { ...item } : cloneGraph(item)));
    const next = this.writes.then(async () => {
      const previous = this.store.readJson<RecentRecord[]>(RECENTS_KEY, []);
      const records: RecentRecord[] = [];
      const versions = new Map<string, { token: object; generation: string }>();
      const created: RecentRecord[] = [];
      let committed = false;
      try {
        for (const item of snapshot) {
          const old = previous.find((record) => record.id === item.id);
          const saved = this.recentVersions.get(item.id);
          const unchanged =
            old &&
            saved &&
            saved.token === item.contentVersion &&
            saved.generation === old.generation;
          if (unchanged) {
            records.push({ ...old, name: item.name });
            versions.set(item.id, saved);
            continue;
          }
          if (!("image" in item)) throw new Error("最近作品记录已改变，请重新打开列表。");
          const generation = randomId();
          const bytes = item.project
            ? await encodeAseprite(
                asepriteFromProject(item.project, { preserveGroupMetadata: true }),
                { compress: true, deflate: zlibSync },
              )
            : new Uint8Array(await (await encodePngBlob(item.image)).arrayBuffer());
          const record: RecentRecord = {
            id: item.id,
            name: item.name,
            width: item.image.width,
            height: item.image.height,
            bytes: recentImageRetainedBytes(item),
            generation,
            aseprite: !!item.project,
          };
          created.push(record);
          this.store.write(`recent:${generation}`, bytes);
          records.push(record);
          versions.set(item.id, { token: item.contentVersion ?? {}, generation });
        }
        this.store.writeJson(RECENTS_KEY, records);
        committed = true;
        this.recentCatalogRevision++;
        this.recentVersions.clear();
        for (const [id, version] of versions) this.recentVersions.set(id, version);
      } finally {
        const retained = new Set(
          (committed ? records : previous).map((record) => record.generation),
        );
        for (const record of [...previous, ...created])
          if (!retained.has(record.generation)) {
            try {
              this.store.remove(`recent:${record.generation}`);
            } catch {}
          }
      }
    });
    this.writes = next.catch(() => {});
    return next;
  };
  dispose = () => {
    this.sources.clear();
  };
}
