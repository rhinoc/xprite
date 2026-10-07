import { encodePng } from "$/adapters/files/images";
import { importAsepriteInWorker } from "$/adapters/workers/aseprite-import-client";
import { tUi } from "$/i18n";
import {
  downloadBlob,
  isAbortError,
  pickSaveFile,
  requestFileWritePermission,
  writeFileHandle,
  type SaveFilePicker,
  type SaveFilePickerOptions,
  type WritableFileHandle,
} from "@xprite/bedrock/browser/file-system";
import { inflateZlibExact } from "@xprite/editor-core/base";
import { markImmutableEditorProject } from "@xprite/editor-core/document";
import {
  AsepriteCodecError,
  EDITOR_ASEPRITE_LIMITS,
  decodeAsepriteProject,
  encodeAseprite,
  encodeAsepriteSync,
  asepriteFromProject,
  asepriteFileName,
  pngFileName,
  projectPngImage,
  type AsepriteEncodeOptions,
  type AsepriteDecodeOptions,
} from "@xprite/editor-core/import-export";
import {
  SessionSaveIntent,
  type SessionProject,
  type SessionWriteResult,
} from "@xprite/editor-core/session";

const ASEPRITE_MIME = "application/x-aseprite";
const DEVELOPMENT_DIAGNOSTIC_ARTIFACT_ENDPOINT = "/__debug/diagnostic-artifact";
const DEVELOPMENT_ARTIFACT_NAME_FALLBACK = "unnamed.aseprite";
/** Aseprite project budget. This bounds both the encoded file and the
 * sum of decoded cel bytes before any timeline graph is allocated. */
export const DEFAULT_MAX_ASEPRITE_PROJECT_BYTES = EDITOR_ASEPRITE_LIMITS.maxFileBytes;

type DeflateStream = new (format: "deflate") => TransformStream<Uint8Array, Uint8Array>;
type CompressionStreamConstructor = DeflateStream;
export type SaveFileHandle = WritableFileHandle;

export interface AsepriteFileOptions {
  /** Embedded runtimes provide a bounded decoder while sharing browser preflight policy. */
  inflate?: AsepriteDecodeOptions["inflate"];
  /** Override browser globals in tests or embedded hosts. */
  decompressionStream?: DeflateStream;
  compressionStream?: CompressionStreamConstructor;
  fetch?: typeof globalThis.fetch;
  saveFilePicker?: SaveFilePicker;
  /** A handle already selected by the user; Save writes here without reopening a picker. */
  fileHandle?: SaveFileHandle;
  /** Permission request started synchronously by the owning adapter's user-gesture handler. */
  fileHandlePermission?: () => Promise<"granted" | "denied" | "prompt">;
  /** Called after the destination selected by the picker has been written. */
  onFileHandleSaved?: (handle: SaveFileHandle) => void;
  onFileDataSaved?: (blob: Blob, name: string, bytes?: Uint8Array) => void;
  /** Borrow the exact file input for hashing. Do not mutate or retain these bytes. */
  onSourceBytes?: (bytes: Uint8Array) => void;
  maxInflatedBytes?: number;
  maxProjectBytes?: number;
  encode?: AsepriteEncodeOptions;
}

function withDiagnosticDetails(
  reason: unknown,
  diagnosticDetails: Readonly<Record<string, unknown>>,
): Error {
  const error = reason instanceof Error ? reason : new Error(String(reason));
  const annotated = error as Error & { diagnosticDetails?: Record<string, unknown> };
  annotated.diagnosticDetails = { ...annotated.diagnosticDetails, ...diagnosticDetails };
  return error;
}

async function persistFailedAsepriteArtifact(
  bytes: Uint8Array,
  fileName: string,
): Promise<Readonly<Record<string, unknown>> | undefined> {
  if (!import.meta.env.DEV || typeof globalThis.fetch !== "function") return undefined;
  const id =
    typeof globalThis.crypto?.randomUUID === "function"
      ? globalThis.crypto.randomUUID()
      : `${Date.now()}-${Math.random().toString(36).slice(2, 10)}`;
  try {
    const response = await fetch(DEVELOPMENT_DIAGNOSTIC_ARTIFACT_ENDPOINT, {
      method: "POST",
      headers: {
        "content-type": "application/octet-stream",
        "x-diagnostic-id": id,
        "x-diagnostic-file-name": encodeURIComponent(
          fileName || DEVELOPMENT_ARTIFACT_NAME_FALLBACK,
        ),
      },
      body: new Blob([new Uint8Array(bytes) as unknown as BlobPart]),
    });
    if (!response.ok) return { id, saved: false, status: response.status };
    return (await response.json()) as Readonly<Record<string, unknown>>;
  } catch (error) {
    return {
      id,
      saved: false,
      reason: error instanceof Error ? error.message : String(error),
    };
  }
}

function fileFormat(name: string | undefined): "png" | "aseprite" {
  return name?.toLowerCase().endsWith(".png") ? "png" : "aseprite";
}

function assertInflateSize(expectedBytes: number, maxInflatedBytes: number): void {
  if (!Number.isSafeInteger(expectedBytes) || expectedBytes < 0)
    throw new AsepriteCodecError("Aseprite compressed cel has an invalid decoded length");
  if (
    !Number.isSafeInteger(maxInflatedBytes) ||
    maxInflatedBytes < 0 ||
    expectedBytes > maxInflatedBytes
  )
    throw new AsepriteCodecError(
      tUi("ui.aseprite.compressed.cel.exceeds.the.byte.browser.limit", {
        value1: maxInflatedBytes,
      }),
    );
}

/** Inflate one zlib-wrapped cel while enforcing its exact declared size. */
export async function inflateAsepriteDeflate(
  bytes: Uint8Array,
  expectedBytes: number,
  options: Pick<AsepriteFileOptions, "decompressionStream" | "maxInflatedBytes"> = {},
): Promise<Uint8Array> {
  const maxInflatedBytes = options.maxInflatedBytes ?? DEFAULT_MAX_ASEPRITE_PROJECT_BYTES;
  assertInflateSize(expectedBytes, maxInflatedBytes);
  const Stream =
    options.decompressionStream ??
    (globalThis as typeof globalThis & { DecompressionStream?: DeflateStream }).DecompressionStream;
  if (typeof Stream !== "function") return inflateZlibExact(bytes, expectedBytes);
  const input = new Blob([new Uint8Array(bytes) as unknown as BlobPart]);
  const output = input.stream().pipeThrough(new Stream("deflate"));
  const reader = output.getReader();
  const result = new Uint8Array(expectedBytes);
  let total = 0;
  try {
    while (true) {
      const next = await reader.read();
      if (next.done) break;
      const value = next.value;
      if (value.byteLength > expectedBytes - total || value.byteLength > maxInflatedBytes - total) {
        await reader.cancel();
        throw new AsepriteCodecError(
          tUi("ui.aseprite.compressed.cel.expands.beyond.its.declared.bytes", {
            value1: expectedBytes,
          }),
        );
      }
      result.set(value, total);
      total += value.byteLength;
    }
  } finally {
    reader.releaseLock();
  }
  if (total !== expectedBytes)
    throw new AsepriteCodecError(
      tUi("ui.aseprite.compressed.cel.decoded.bytes.expected", {
        value1: total,
        value2: expectedBytes,
      }),
    );
  return result;
}

/** Compress one cel with browser zlib, retaining an encoded-size bound while
 * collecting the stream for the core's async encoder. */
async function deflateAseprite(
  bytes: Uint8Array,
  options: AsepriteFileOptions,
): Promise<Uint8Array> {
  const Stream =
    options.compressionStream ??
    (globalThis as typeof globalThis & { CompressionStream?: CompressionStreamConstructor })
      .CompressionStream;
  if (typeof Stream !== "function")
    throw new Error("This browser does not provide CompressionStream('deflate')");
  const maxEncodedBytes =
    options.encode?.limits?.maxFileBytes ?? EDITOR_ASEPRITE_LIMITS.maxFileBytes;
  const input = new Blob([new Uint8Array(bytes) as unknown as BlobPart]);
  const output = input.stream().pipeThrough(new Stream("deflate"));
  const reader = output.getReader();
  const parts: Uint8Array[] = [];
  let total = 0;
  try {
    while (true) {
      const next = await reader.read();
      if (next.done) break;
      total += next.value.byteLength;
      if (total > maxEncodedBytes) {
        await reader.cancel();
        throw new AsepriteCodecError(
          tUi("ui.compressed.aseprite.data.exceeds.the.byte.browser.limit", {
            value1: maxEncodedBytes,
          }),
        );
      }
      parts.push(next.value);
    }
  } finally {
    reader.releaseLock();
  }
  const result = new Uint8Array(total);
  let offset = 0;
  for (const part of parts) {
    result.set(part, offset);
    offset += part.byteLength;
  }
  return result;
}

/** Attach browser diagnostic context without coupling portable codecs to file I/O. */
export async function annotateAsepriteDecodeFailure(
  reason: unknown,
  bytes: Uint8Array,
  fileName: string,
): Promise<Error> {
  const diagnosticArtifact = await persistFailedAsepriteArtifact(bytes, fileName);
  return withDiagnosticDetails(reason, {
    aseprite: { fileName, byteLength: bytes.byteLength },
    ...(diagnosticArtifact ? { developmentArtifact: diagnosticArtifact } : {}),
  });
}

export async function decodeAsepriteBlob(
  blob: Blob,
  fileName: string,
  options: AsepriteFileOptions = {},
): Promise<SessionProject> {
  if (!(blob instanceof Blob)) throw new TypeError("decodeAsepriteBlob expects a Blob");
  const maxProjectBytes = options.maxProjectBytes ?? DEFAULT_MAX_ASEPRITE_PROJECT_BYTES;
  if (!Number.isSafeInteger(maxProjectBytes) || maxProjectBytes < 1)
    throw new RangeError("maxProjectBytes must be a positive safe integer");
  if (blob.size > maxProjectBytes)
    throw new AsepriteCodecError(
      tUi("ui.aseprite.file.exceeds.the.browser.resource.limit.for.aseprite.projects.bytes", {
        value1: maxProjectBytes,
      }),
    );
  const bytes = new Uint8Array(await blob.arrayBuffer());
  if (bytes.byteLength > maxProjectBytes)
    throw new AsepriteCodecError(
      tUi("ui.aseprite.file.exceeds.the.browser.resource.limit.for.aseprite.projects.bytes", {
        value1: maxProjectBytes,
      }),
    );
  try {
    options.onSourceBytes?.(bytes);
    const limits = {
      ...EDITOR_ASEPRITE_LIMITS,
      maxFileBytes: maxProjectBytes,
      maxDecodedBytes: options.maxProjectBytes ?? EDITOR_ASEPRITE_LIMITS.maxDecodedBytes,
      maxExpandedBytes: Math.min(
        EDITOR_ASEPRITE_LIMITS.maxExpandedBytes,
        options.maxProjectBytes ?? EDITOR_ASEPRITE_LIMITS.maxExpandedBytes,
      ),
      maxCelPixels: Math.min(EDITOR_ASEPRITE_LIMITS.maxCelPixels, Math.floor(maxProjectBytes / 4)),
    };
    if (!options.inflate && !options.decompressionStream) {
      const pending = importAsepriteInWorker({ bytes, fileName, limits });
      if (pending) return await pending;
    }
    const project = await decodeAsepriteProject(bytes, {
      fileName,
      takeOwnership: true,
      takeInflatedOwnership: !options.inflate,
      deferPixels: !options.inflate,
      takeProjectOwnership: true,
      limits,
      maxCanvasBytes: maxProjectBytes,
      errors: {
        preflight: (preflight) =>
          new AsepriteCodecError(
            tUi("ui.aseprite.preflight.rejected.this.file", {
              value1: preflight.issues.map((issue) => issue.message).join("; "),
            }),
            preflight.issues,
          ),
        canvas: (header, maxCanvasBytes) =>
          new AsepriteCodecError(
            tUi(
              "ui.aseprite.canvas.exceeds.the.browser.resource.limit.for.aseprite.projects.bytes",
              {
                value1: header.width,
                value2: header.height,
                value3: maxCanvasBytes,
              },
            ),
          ),
      },
      inflate:
        options.inflate ??
        ((compressed, expected) => inflateAsepriteDeflate(compressed, expected, options)),
    });
    return markImmutableEditorProject(project);
  } catch (reason) {
    throw await annotateAsepriteDecodeFailure(reason, bytes, fileName);
  }
}

export async function decodeAsepriteSource(
  source: Blob | { url: string },
  fileName: string,
  options: AsepriteFileOptions = {},
): Promise<SessionProject> {
  if (source instanceof Blob) return decodeAsepriteBlob(source, fileName, options);
  const fetcher = options.fetch ?? globalThis.fetch;
  if (typeof fetcher !== "function") throw new Error("This browser cannot fetch an Aseprite asset");
  const response = await fetcher(source.url);
  if (
    response.ok === false ||
    (response.ok === undefined && typeof response.status === "number" && response.status >= 400)
  )
    throw new Error(tUi("ui.could.not.fetch.aseprite.asset", { value1: response.status }));
  return decodeAsepriteBlob(await response.blob(), fileName, options);
}

/** Encode a project and write it from the originating activation stack. */
export async function saveAseprite(
  project: SessionProject,
  name: string,
  intent: SessionSaveIntent,
  options: AsepriteFileOptions = {},
): Promise<SessionWriteResult> {
  const asepriteName = asepriteFileName(name);
  const fileName = /\.png$/i.test(name) ? pngFileName(name) : asepriteName;
  const outputFormat = fileFormat(fileName);
  const CompressionStream =
    options.compressionStream ??
    (
      globalThis as typeof globalThis & {
        CompressionStream?: CompressionStreamConstructor;
      }
    ).CompressionStream;
  const encode = async (): Promise<Uint8Array> => {
    // The render preference must not discard authored group properties on save.
    const sprite = asepriteFromProject(project, { preserveGroupMetadata: true });
    const shared = {
      fileName: asepriteName,
      ...options.encode,
      limits: { ...EDITOR_ASEPRITE_LIMITS, ...options.encode?.limits },
    };
    if (typeof CompressionStream === "function")
      return encodeAseprite(sprite, {
        ...shared,
        compress: true,
        deflate: (bytes) => deflateAseprite(bytes, options),
      });
    // Keep a usable raw-file fallback for older browsers. Explicitly clear a
    // caller's compression request because the synchronous encoder cannot
    // invoke a browser stream without losing the activation path.
    return encodeAsepriteSync(sprite, { ...shared, compress: false, preserveCelCompression: true });
  };
  const encodeOutput = async (
    format: "png" | "aseprite",
  ): Promise<{ blob: Blob; bytes?: Uint8Array }> => {
    if (format === "png") return { blob: await encodePng(projectPngImage(project)) };
    const bytes = await encode();
    return { blob: new Blob([bytes as unknown as BlobPart], { type: ASEPRITE_MIME }), bytes };
  };
  if (intent === SessionSaveIntent.Save && options.fileHandle) {
    const handle = options.fileHandle;
    const permission = options.fileHandlePermission?.() ?? requestFileWritePermission(handle);
    if (permission && (await permission) !== "granted")
      throw new Error(
        tUi("ui.write.permission.was.not.granted.for", { value1: handle.name ?? fileName }),
      );
    const format = fileFormat(handle.name);
    const output = await encodeOutput(format);
    await writeFileHandle(handle, output.blob);
    options.onFileDataSaved?.(output.blob, handle.name || fileName, output.bytes);
    return { method: "file", name: handle.name || fileName, format };
  }
  if (intent === SessionSaveIntent.Save || intent === SessionSaveIntent.SaveAs) {
    let selection: Promise<SaveFileHandle> | null = null;
    const pickerOptions: SaveFilePickerOptions = {
      suggestedName: fileName,
      types: [
        {
          description: tUi("ui.aseprite.sprite"),
          accept: { [ASEPRITE_MIME]: [".ase", ".aseprite"] },
        },
        { description: tUi("ui.png.image"), accept: { "image/png": [".png"] } },
      ],
    };
    try {
      // Start the picker before encoding yields, preserving the user gesture.
      selection = options.saveFilePicker
        ? options.saveFilePicker(pickerOptions)
        : pickSaveFile(pickerOptions);
    } catch (error) {
      selection = Promise.reject(error);
    }
    if (selection) {
      let handle: SaveFileHandle;
      try {
        handle = await selection;
      } catch (error) {
        if (isAbortError(error)) throw error;
        if (outputFormat === "png") {
          const blob = await encodePng(projectPngImage(project));
          downloadBlob(blob, fileName);
          options.onFileDataSaved?.(blob, fileName);
          return { method: "download", name: fileName, format: outputFormat };
        }
        const bytes = await encode();
        const blob = new Blob([bytes as unknown as BlobPart], { type: ASEPRITE_MIME });
        downloadBlob(blob, fileName);
        options.onFileDataSaved?.(blob, fileName, bytes);
        return { method: "download", name: fileName, format: outputFormat };
      }
      const format = fileFormat(handle.name);
      const output = await encodeOutput(format);
      await writeFileHandle(handle, output.blob);
      options.onFileDataSaved?.(output.blob, handle.name || fileName, output.bytes);
      options.onFileHandleSaved?.(handle);
      return { method: "picker", name: handle.name || fileName, format };
    }
  }
  if (outputFormat === "png") {
    const blob = await encodePng(projectPngImage(project));
    downloadBlob(blob, fileName);
    options.onFileDataSaved?.(blob, fileName);
    return { method: "download", name: fileName, format: outputFormat };
  }
  const bytes = await encode();
  const blob = new Blob([bytes as unknown as BlobPart], { type: ASEPRITE_MIME });
  downloadBlob(blob, fileName);
  options.onFileDataSaved?.(blob, fileName, bytes);
  return { method: "download", name: fileName, format: outputFormat };
}
