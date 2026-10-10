import { ToolFailureCategory, ToolOperationError } from "$/managers/ports/telemetry";
import {
  AsepriteCodecError,
  decodeAsepriteProject,
  EDITOR_ASEPRITE_LIMITS,
} from "@xprite/editor-core/import-export";

const MAX_PROJECT_BYTES = EDITOR_ASEPRITE_LIMITS.maxFileBytes;
const DEFLATE_FORMAT = "deflate";

/** Bounded browser decompression; parsing and project conversion belong to core. */
async function inflate(bytes: Uint8Array, expected: number): Promise<Uint8Array> {
  if (!Number.isSafeInteger(expected) || expected < 0 || expected > MAX_PROJECT_BYTES)
    throw new Error("The file exceeds the browser's memory limit.");
  const stream = new Blob([new Uint8Array(bytes).buffer])
    .stream()
    .pipeThrough(new DecompressionStream(DEFLATE_FORMAT));
  const reader = stream.getReader();
  const result = new Uint8Array(expected);
  let offset = 0;
  try {
    while (true) {
      const { done, value } = await reader.read();
      if (done) break;
      if (offset + value.byteLength > expected) {
        await reader.cancel();
        throw new Error("The file contains invalid compressed pixels.");
      }
      result.set(value, offset);
      offset += value.byteLength;
    }
  } finally {
    reader.releaseLock();
  }
  if (offset !== expected) throw new Error("The file contains incomplete compressed pixels.");
  return result;
}

export async function decodeViewerFile(file: File) {
  if (file.size > MAX_PROJECT_BYTES)
    throw new ToolOperationError(
      ToolFailureCategory.Limit,
      "The file exceeds the supported project size.",
    );
  const bytes = new Uint8Array(await file.arrayBuffer());
  const limits = EDITOR_ASEPRITE_LIMITS;
  return decodeAsepriteProject(bytes, {
    fileName: file.name,
    limits,
    inflate,
    takeOwnership: true,
    errors: {
      preflight: (result) =>
        new AsepriteCodecError(
          result.issues.map((issue) => issue.message).join("; "),
          result.issues,
        ),
      canvas: () => new AsepriteCodecError("The canvas exceeds the browser's memory limit."),
    },
  });
}
