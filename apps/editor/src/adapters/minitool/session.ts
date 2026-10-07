import { decodeAnimatedImageSource } from "$/adapters/files/animated-images";
import { decodeAsepriteBlob } from "$/adapters/files/aseprite-files";
import { deflateMiniToolCel } from "$/adapters/minitool/aseprite-files";
import {
  inlineAssetBlob,
  readJson,
  writeJson,
  readBytes,
  writeBytes,
  removeBytes,
  saveAlbumImage,
} from "$/adapters/minitool/sdk";
import type { WorkspaceSessionPorts } from "$/managers/ports/workspace-session";
import { decodeImageBlob, encodePngBlob } from "@xprite/bedrock/browser/images";
import { sha256Hex, randomId } from "@xprite/bedrock/browser/runtime-crypto";
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
  type SessionRecentImage,
  type SessionRecentEntry,
  type SessionRecentMetadata,
  recentImageRetainedBytes,
  type SessionProject,
} from "@xprite/editor-core/session";

const RECENT_CATALOG_READ_ATTEMPTS = 2;
const RECENTS_KEY = "recents-v2";
type Source = { name: string; blob: Blob } | { name: string; load: () => Promise<SessionProject> };
interface RecentRecord {
  id: string;
  name: string;
  width: number;
  height: number;
  bytes: number;
  generation: string;
  type: "png" | "aseprite";
}

export class MiniToolSession implements WorkspaceSessionPorts {
  private sources = new Map<string, Source>();
  private nextSource = 1;
  private recentWrites = Promise.resolve();
  private readonly recentVersions = new Map<string, { token: object; generation: string }>();
  private recentCatalogRevision = 0;
  private closed = false;
  pickFiles = () => null;
  bindSourceToDocument(): void {}
  releaseDocumentHandle(): void {}
  hydrateDocumentHandles = async () => {};
  registerAsset(url: string, name: string) {
    return this.register({ name, blob: inlineAssetBlob(url) });
  }
  registerFile(file: File) {
    return this.register({ name: file.name, blob: file });
  }
  registerProject(name: string, load: () => Promise<SessionProject>) {
    return this.register({ name, load });
  }
  private register(source: Source) {
    if (this.closed) throw new Error("文档会话已关闭。");
    const token = `minitool-source-${this.nextSource++}`;
    this.sources.set(token, source);
    return { source: token, name: source.name };
  }
  private source(token: string): Source {
    const source = this.sources.get(token);
    if (!source) throw new Error("文档来源已失效。");
    return source;
  }
  releaseSource = (token: string) => {
    this.sources.delete(token);
  };
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
    if ("load" in source) return source.load();
    if (/\.ase(?:prite)?$/i.test(source.name)) return decodeAsepriteBlob(source.blob, source.name);
    return decodeAnimatedImageSource(
      new File([source.blob], source.name, { type: source.blob.type }),
      source.name,
    );
  };
  analyze: WorkspaceSessionPorts["analyze"] = async (pixels) => analyzePixelArt(pixels);
  pixelate: WorkspaceSessionPorts["pixelate"] = async (pixels, options) =>
    pixelateImage(pixels, options);
  write: WorkspaceSessionPorts["write"] = async (pixels, name) => {
    await saveAlbumImage(await encodePngBlob(pixels));
    return { method: "file", name: name.replace(/\.[^.]*$/, "") + ".png", format: "png" };
  };
  writeProject: NonNullable<WorkspaceSessionPorts["writeProject"]> = async (
    project,
    name,
    intent,
  ) => {
    if (intent === SessionSaveIntent.Export || /\.png$/i.test(name))
      return this.write(projectPngImage(project), name, intent);
    throw new Error("请使用本地项目保存；小红书不支持下载 Aseprite 文件。");
  };
  listRecentImages = async (): Promise<SessionRecentMetadata[]> => {
    for (let attempt = 0; attempt < RECENT_CATALOG_READ_ATTEMPTS; attempt++) {
      await this.recentWrites;
      const revision = this.recentCatalogRevision;
      const records = await readJson<RecentRecord[]>(RECENTS_KEY, []);
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
    await this.recentWrites;
    const revision = this.recentCatalogRevision;
    const record = (await readJson<RecentRecord[]>(RECENTS_KEY, [])).find((item) => item.id === id);
    if (!record || revision !== this.recentCatalogRevision) return null;
    const previous = this.recentVersions.get(id);
    const contentVersion = previous?.generation === record.generation ? previous.token : {};
    this.recentVersions.set(id, { token: contentVersion, generation: record.generation });
    const bytes = await readBytes(`recent:${record.generation}`);
    if (!bytes) throw new Error("最近作品文件不存在。");
    const blob = new Blob([bytes as BlobPart], {
      type: record.type === "aseprite" ? "application/x-aseprite" : "image/png",
    });
    const project =
      record.type === "aseprite" ? await decodeAsepriteBlob(blob, record.name) : undefined;
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
    const next = this.recentWrites.then(async () => {
      const previous = await readJson<RecentRecord[]>(RECENTS_KEY, []);
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
                { compress: true, deflate: deflateMiniToolCel },
              )
            : new Uint8Array(await (await encodePngBlob(item.image)).arrayBuffer());
          const record: RecentRecord = {
            id: item.id,
            name: item.name,
            width: item.image.width,
            height: item.image.height,
            bytes: recentImageRetainedBytes(item),
            generation,
            type: item.project ? "aseprite" : "png",
          };
          created.push(record);
          await writeBytes(`recent:${generation}`, bytes);
          records.push(record);
          versions.set(item.id, { token: item.contentVersion ?? {}, generation });
        }
        await writeJson(RECENTS_KEY, records);
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
            await removeBytes(`recent:${record.generation}`).catch(() => {});
          }
      }
    });
    this.recentWrites = next.catch(() => {});
    return next;
  };
  dispose = () => {
    this.closed = true;
    this.sources.clear();
  };
}
