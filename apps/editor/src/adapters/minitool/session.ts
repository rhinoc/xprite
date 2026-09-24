import { decodeAnimatedImageSource } from "$/adapters/files/animated-images";
import { decodeAsepriteBlob } from "$/adapters/files/aseprite-files";
import { deflateMiniToolCel } from "$/adapters/minitool/aseprite-files";
import {
  inlineAssetBlob,
  readJson,
  writeJson,
  encodeBase64,
  decodeBase64,
  saveAlbumImage,
} from "$/adapters/minitool/sdk";
import type { WorkspaceSessionPorts } from "$/managers/workspace/document-workspace";
import { decodeImageBlob, encodePngBlob } from "@xprite/bedrock/browser/images";
import { sha256Hex } from "@xprite/bedrock/browser/runtime-crypto";
import {
  analyzePixelArt,
  pixelateImage,
  encodeAseprite,
  asepriteFromProject,
} from "@xprite/editor-core/import-export";
import {
  SessionSaveIntent,
  type SessionRecentImage,
  type SessionProject,
} from "@xprite/editor-core/session";

const RECENTS_KEY = "recents";
type Source = { name: string; blob: Blob } | { name: string; load: () => Promise<SessionProject> };
interface RecentRecord {
  id: string;
  name: string;
  type: "png" | "aseprite";
  data: string;
}

export class MiniToolSession implements WorkspaceSessionPorts {
  private sources = new Map<string, Source>();
  private nextSource = 1;
  private recentWrites = Promise.resolve();
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
      return this.write(project.image, name, intent);
    throw new Error("请使用本地项目保存；小红书不支持下载 Aseprite 文件。");
  };
  loadRecentImages = async (): Promise<SessionRecentImage[]> => {
    await this.recentWrites;
    const records = await readJson<RecentRecord[]>(RECENTS_KEY, []);
    return Promise.all(
      records.map(async (record) => {
        const blob = new Blob([decodeBase64(record.data) as BlobPart], {
          type: record.type === "png" ? "image/png" : "application/x-aseprite",
        });
        if (record.type === "aseprite") {
          const project = await decodeAsepriteBlob(blob, record.name);
          return { id: record.id, name: record.name, image: project.image, project };
        }
        return { id: record.id, name: record.name, image: await decodeImageBlob(blob) };
      }),
    );
  };
  saveRecentImages = (images: readonly SessionRecentImage[]): Promise<void> => {
    const snapshots = structuredClone(images);
    const result = this.recentWrites.then(async () => {
      const records: RecentRecord[] = [];
      for (const item of snapshots) {
        const bytes = item.project
          ? await encodeAseprite(
              asepriteFromProject(item.project, { preserveGroupMetadata: true }),
              { compress: true, deflate: deflateMiniToolCel },
            )
          : new Uint8Array(await (await encodePngBlob(item.image)).arrayBuffer());
        records.push({
          id: item.id,
          name: item.name,
          type: item.project ? "aseprite" : "png",
          data: encodeBase64(bytes),
        });
      }
      await writeJson(RECENTS_KEY, records);
    });
    this.recentWrites = result.catch(() => {});
    return result;
  };
  dispose = () => {
    this.closed = true;
    this.sources.clear();
  };
}
