import {
  decodeAsset,
  decodeImage,
  savePng,
  SavePngMode,
  type SaveFileHandle,
} from "$/adapters/files/images";
import { IndexedDbDocumentFileHandles } from "$/adapters/storage/indexeddb/file-handles";
import {
  IndexedDbFileIdentities,
  type IdentifiableFileHandle,
} from "$/adapters/storage/indexeddb/file-identities";
import {
  IndexedDbRecentImages,
  type IndexedDbRecentImagesOptions,
} from "$/adapters/storage/indexeddb/recents";
import { ImageImportWorkerClient } from "$/adapters/workers/import-client";
import { tUi } from "$/i18n";
import { DiagnosticSource, type DiagnosticsPort } from "$/managers/ports/diagnostics";
import {
  pickOpenFiles,
  pickSaveFile,
  requestFileWritePermission,
  type ReadableFileHandle,
  type SaveFilePickerOptions,
} from "@xprite/bedrock/browser/file-system";
import { ImageDimensionError } from "@xprite/bedrock/browser/images";
import { sha256Hex } from "@xprite/bedrock/browser/runtime-crypto";
import type { PixelBuffer } from "@xprite/editor-core/base";
import {
  asepriteFileName,
  ASEPRITE_SIGNATURE_BYTES,
  isAsepriteData,
  isAsepriteFileName,
  pngFileName,
  type PixelateOptions,
} from "@xprite/editor-core/import-export";
import {
  SessionSaveIntent,
  type EditorSessionPorts,
  type SessionProject,
} from "@xprite/editor-core/session";

interface OpenFileHandle extends SaveFileHandle, ReadableFileHandle {}
type BrowserSessionSource =
  | File
  | { url: string; name: string }
  | { name: string; loadProject: () => Promise<SessionProject> };

/** Browser-owned files and handles stay in adapters, keyed to durable workspace slots. */
export class BrowserSessionPorts implements EditorSessionPorts<string> {
  private readonly recents: IndexedDbRecentImages;
  private readonly fileIdentities: IndexedDbFileIdentities;
  private readonly fileHandles: IndexedDbDocumentFileHandles;
  private readonly diagnostics?: DiagnosticsPort;
  constructor(
    options: IndexedDbRecentImagesOptions & {
      fileHandleDatabaseName?: string;
      diagnostics?: DiagnosticsPort;
    } = {},
  ) {
    this.recents = new IndexedDbRecentImages(options);
    this.fileIdentities = new IndexedDbFileIdentities({
      databaseName: options.databaseName ? `${options.databaseName}-identities` : undefined,
      factory: options.factory,
    });
    this.diagnostics = options.diagnostics;
    this.fileHandles = new IndexedDbDocumentFileHandles({
      databaseName:
        options.fileHandleDatabaseName ??
        (options.databaseName ? `${options.databaseName}-handles` : undefined),
      factory: options.factory,
    });
  }
  listRecentImages = () => this.recents.list();
  readRecentImage = (id: string) => this.recents.read(id);
  saveRecentImages = (images: Parameters<IndexedDbRecentImages["save"]>[0]) =>
    this.recents.save(images);
  private nextId = 1;
  private readonly sources = new Map<string, BrowserSessionSource>();
  private readonly sourceChecksums = new Map<string, Promise<string | undefined>>();
  private readonly sourceFileHandles = new Map<string, SaveFileHandle>();
  private readonly documentFileHandles = new Map<string, SaveFileHandle>();
  private worker: ImageImportWorkerClient | null = null;
  private closed = false;

  registerFile(file: File, handle?: SaveFileHandle) {
    const source = this.register(file);
    if (handle) this.sourceFileHandles.set(source, handle);
    return { source, name: file.name };
  }
  hydrateDocumentHandles = async (documentKeys: readonly string[]) => {
    try {
      for (const [documentKey, handle] of await this.fileHandles.load(documentKeys))
        this.documentFileHandles.set(documentKey, handle);
    } catch {
      // A saved project still opens when the browser no longer exposes a stored handle.
    }
  };
  private rememberDocumentHandle(documentKey: string, handle: SaveFileHandle) {
    this.documentFileHandles.set(documentKey, handle);
    void this.fileHandles.save(documentKey, handle).catch(() => {
      // The current session retains the handle even if browser storage rejects the clone.
    });
  }
  private forgetDocumentHandle(documentKey: string) {
    if (!this.documentFileHandles.delete(documentKey)) return;
    void this.fileHandles.delete(documentKey).catch(() => {});
  }
  /** Returns null when this browser needs the ordinary file-input fallback. */
  pickFiles(): Promise<readonly { source: string; name: string }[]> | null {
    let selection: Promise<OpenFileHandle[]> | null;
    try {
      // Invoke the picker in the original click stack so the browser keeps user activation.
      selection = pickOpenFiles({ multiple: true });
    } catch (error) {
      return Promise.reject(error);
    }
    if (!selection) return null;
    return selection.then(async (handles) => {
      const sources: { source: string; name: string }[] = [];
      try {
        for (const handle of handles) {
          const file = await handle.getFile();
          sources.push(this.registerFile(file, handle));
        }
        return sources;
      } catch (reason) {
        for (const source of sources) this.releaseSource(source.source);
        throw reason;
      }
    });
  }
  bindSourceToDocument(source: string, documentKey: string) {
    const handle = this.sourceFileHandles.get(source);
    if (handle) this.rememberDocumentHandle(documentKey, handle);
  }
  releaseDocumentHandle(documentKey: string) {
    this.forgetDocumentHandle(documentKey);
  }
  registerAsset(url: string, name: string) {
    return { source: this.register({ url, name }), name };
  }
  registerProject(name: string, loadProject: () => Promise<SessionProject>) {
    return { source: this.register({ name, loadProject }), name };
  }
  private register(source: BrowserSessionSource) {
    if (this.closed) throw new Error("Image session is closed");
    const token = `image-source-${this.nextId++}`;
    this.sources.set(token, source);
    return token;
  }
  identifySource = async (token: string): Promise<string | null> => {
    const source = this.sources.get(token);
    return source instanceof File
      ? this.fileIdentities.identify(
          source,
          this.sourceFileHandles.get(token) as IdentifiableFileHandle | undefined,
          await this.sourceChecksums.get(token),
        )
      : null;
  };
  private async savedIdentity(
    documentKey?: string,
    data?: { blob: Blob; name: string; bytes?: Uint8Array },
  ): Promise<string | undefined> {
    const handle = documentKey
      ? (this.documentFileHandles.get(documentKey) as IdentifiableFileHandle | undefined)
      : undefined;
    if (!data && !handle?.getFile) return undefined;
    try {
      const file = data
        ? new File([data.blob], data.name, { type: data.blob.type })
        : await handle!.getFile!();
      return await this.fileIdentities.identify(
        file,
        handle,
        data?.bytes ? await sha256Hex(data.bytes) : undefined,
      );
    } catch {
      return undefined;
    }
  }
  decode = (token: string): Promise<PixelBuffer> => {
    const source = this.sources.get(token);
    if (!source) return Promise.reject(new Error("Image source is no longer available"));
    if ("loadProject" in source) return source.loadProject().then((project) => project.image);
    if (!(source instanceof File)) return decodeAsset(source.url);
    return decodeImage(source).catch((reason: unknown) => {
      if (reason instanceof ImageDimensionError) throw reason;
      throw Object.assign(new Error(tUi("ui.file.import.invalid", { name: source.name })), {
        cause: reason,
      });
    });
  };
  decodeProject = async (token: string): Promise<SessionProject | null> => {
    const source = this.sources.get(token);
    if (!source) throw new Error("Image source is no longer available");
    if ("loadProject" in source) return source.loadProject();
    const name = source.name;
    const asepriteData =
      source instanceof File &&
      isAsepriteData(new Uint8Array(await source.slice(0, ASEPRITE_SIGNATURE_BYTES).arrayBuffer()));
    if (!asepriteData) {
      const { decodeAnimatedImageSource } = await import("$/adapters/files/animated-images");
      const animation = await decodeAnimatedImageSource(source, name);
      if (animation) return animation;
      // The extension also routes damaged Aseprite files to their codec's precise errors.
      if (!isAsepriteFileName(name)) return null;
    }
    const { decodeAsepriteSource } = await import("$/adapters/files/aseprite-files");
    try {
      return await decodeAsepriteSource(source, name, {
        onSourceBytes:
          source instanceof File
            ? (bytes) => {
                if (this.closed || this.sources.get(token) !== source) return;
                // Start hashing the same input now; retain only its small digest promise.
                this.sourceChecksums.set(
                  token,
                  sha256Hex(bytes).catch(() => undefined),
                );
              }
            : undefined,
      });
    } catch (reason) {
      this.sourceChecksums.delete(token);
      if (reason instanceof Error) {
        const annotated = reason as Error & { diagnosticDetails?: Record<string, unknown> };
        annotated.diagnosticDetails = {
          ...annotated.diagnosticDetails,
          source:
            source instanceof File
              ? {
                  kind: "browser-file",
                  name: source.name,
                  size: source.size,
                  mimeType: source.type,
                  lastModified: source.lastModified,
                }
              : { kind: "browser-asset-url", name: source.name, url: source.url },
        };
      }
      throw reason;
    }
  };
  releaseSource = (token: string) => {
    this.sources.delete(token);
    this.sourceChecksums.delete(token);
    this.sourceFileHandles.delete(token);
  };
  private getWorker() {
    if (this.closed) throw new Error("Image session is closed");
    return (
      this.worker ??
      (this.worker = new ImageImportWorkerClient({
        onFatalError: (error) => this.diagnostics?.capture(error, DiagnosticSource.ImportWorker),
      }))
    );
  }
  analyze = (pixels: PixelBuffer) => this.getWorker().analyze(pixels);
  pixelate = (pixels: PixelBuffer, options: PixelateOptions) =>
    this.getWorker().pixelate(pixels, options);
  private compatibleDocumentHandle(documentKey: string | undefined, kind?: "png" | "aseprite") {
    if (!documentKey) return undefined;
    const handle = this.documentFileHandles.get(documentKey);
    if (!handle?.name) return undefined;
    const extension = handle.name.toLowerCase().match(/\.[^.]+$/)?.[0];
    if (kind === "png") return extension === ".png" ? handle : undefined;
    if (kind === "aseprite")
      return extension === ".ase" || extension === ".aseprite" ? handle : undefined;
    return extension === ".png" || extension === ".ase" || extension === ".aseprite"
      ? handle
      : undefined;
  }
  write = (pixels: PixelBuffer, name: string, intent: SessionSaveIntent, documentKey?: string) => {
    if (this.closed) return Promise.reject(new Error("Image session is closed"));
    const existing =
      intent === SessionSaveIntent.Save
        ? this.compatibleDocumentHandle(documentKey, "png")
        : undefined;
    // savePng invokes the Bedrock picker before its first await. Keep this call
    // in the originating user-activation stack, with no queued task.
    let savedData: { blob: Blob; name: string } | undefined;
    const writing = savePng(pixels, name, {
      onFileDataSaved: (blob, name) => {
        savedData = { blob, name };
      },
      mode: intent === SessionSaveIntent.Export ? SavePngMode.Download : SavePngMode.Auto,
      ...(existing ? { fileHandle: existing } : {}),
      ...(documentKey && intent !== SessionSaveIntent.Export
        ? { onFileHandleSaved: (handle) => this.rememberDocumentHandle(documentKey, handle) }
        : {}),
    });
    return writing.then(async (result) => {
      if (
        intent === SessionSaveIntent.SaveAs &&
        "method" in result &&
        result.method === "download" &&
        documentKey
      )
        this.forgetDocumentHandle(documentKey);
      if ("method" in result && intent !== SessionSaveIntent.Export) {
        const recentIdentity = await this.savedIdentity(
          result.method === "download" ? undefined : documentKey,
          savedData,
        );
        return {
          ...result,
          ...(savedData ? { byteLength: savedData.blob.size } : {}),
          ...(recentIdentity ? { recentIdentity } : {}),
        };
      }
      return result;
    });
  };
  writeProject = (
    project: SessionProject,
    name: string,
    intent: SessionSaveIntent,
    documentKey?: string,
  ) => {
    if (this.closed) return Promise.reject(new Error("Image session is closed"));
    const existing =
      intent === SessionSaveIntent.Save ? this.compatibleDocumentHandle(documentKey) : undefined;
    const fileHandlePermissionActivation = globalThis.navigator?.userActivation?.isActive ?? false;
    let fileHandlePermission: (() => Promise<"granted" | "denied" | "prompt">) | undefined;
    if (existing?.requestPermission) {
      let permissionResult: Promise<
        { status: "granted" | "denied" | "prompt" } | { error: unknown }
      >;
      try {
        // Start the permission prompt before the lazy codec import yields the click activation.
        const permission = requestFileWritePermission(existing);
        permissionResult = Promise.resolve(permission).then(
          (status) => ({ status: status ?? "prompt" }),
          (error) => ({ error }),
        );
      } catch (error) {
        permissionResult = Promise.resolve({ error });
      }
      fileHandlePermission = async () => {
        const outcome = await permissionResult;
        if ("error" in outcome) throw outcome.error;
        return outcome.status;
      };
    }
    let selected: Promise<{ handle: SaveFileHandle } | { error: unknown }> | undefined;
    if (!existing && intent !== SessionSaveIntent.Export) {
      try {
        // Open the system picker before loading the codec module so click activation is retained.
        const pickerOptions: SaveFilePickerOptions = {
          suggestedName: /\.png$/i.test(name) ? pngFileName(name) : asepriteFileName(name),
          types: [
            {
              description: tUi("ui.aseprite.sprite"),
              accept: { "application/x-aseprite": [".ase", ".aseprite"] },
            },
            { description: tUi("ui.png.image"), accept: { "image/png": [".png"] } },
          ],
        };
        const selection = pickSaveFile(pickerOptions);
        selected = selection
          ? Promise.resolve(selection).then(
              (handle) => ({ handle }),
              (error) => ({ error }),
            )
          : undefined;
      } catch (error) {
        selected = Promise.resolve({ error });
      }
    }
    const saveFilePicker = selected
      ? async () => {
          const outcome = await selected!;
          if ("error" in outcome) throw outcome.error;
          return outcome.handle;
        }
      : undefined;
    let savedData: { blob: Blob; name: string; bytes?: Uint8Array } | undefined;
    return import("$/adapters/files/aseprite-files")
      .then(({ saveAseprite }) =>
        saveAseprite(project, name, intent, {
          onFileDataSaved: (blob, name, bytes) => {
            savedData = { blob, name, ...(bytes ? { bytes } : {}) };
          },
          ...(existing ? { fileHandle: existing } : {}),
          ...(fileHandlePermission ? { fileHandlePermission } : {}),
          ...(existing ? { fileHandlePermissionActivation } : {}),
          ...(saveFilePicker ? { saveFilePicker } : {}),
          ...(documentKey && intent !== SessionSaveIntent.Export
            ? { onFileHandleSaved: (handle) => this.rememberDocumentHandle(documentKey, handle) }
            : {}),
        }),
      )
      .then(async (result) => {
        if (
          intent === SessionSaveIntent.SaveAs &&
          "method" in result &&
          result.method === "download" &&
          documentKey
        )
          this.forgetDocumentHandle(documentKey);
        if ("method" in result && intent !== SessionSaveIntent.Export) {
          const recentIdentity = await this.savedIdentity(
            result.method === "download" ? undefined : documentKey,
            savedData,
          );
          return {
            ...result,
            ...(savedData ? { byteLength: savedData.blob.size } : {}),
            ...(recentIdentity ? { recentIdentity } : {}),
          };
        }
        return result;
      });
  };
  dispose = () => {
    if (this.closed) return;
    this.closed = true;
    this.sources.clear();
    this.sourceChecksums.clear();
    this.sourceFileHandles.clear();
    this.documentFileHandles.clear();
    this.fileHandles.close();
    this.fileIdentities.close();
    this.recents.close();
    this.worker?.close();
    this.worker = null;
  };
}
