import type { EditorProject } from "$/document";
import {
  AsepriteCodecError,
  decodeAseprite,
  decodeAsepriteSync,
} from "$/import-export/aseprite/decode";
import type {
  AsepriteDecodeOptions,
  AsepritePreflightHeader,
  AsepritePreflightResult,
} from "$/import-export/aseprite/model";
import { projectFromAseprite } from "$/import-export/aseprite/project";
import { EDITOR_ASEPRITE_LIMITS } from "$/import-export/aseprite/project-limits";

const RGBA_BYTES_PER_PIXEL = 4;

export interface AsepriteProjectDecodeOptions extends Omit<
  AsepriteDecodeOptions,
  "preflight" | "allowUnsupported"
> {
  /** Additional canvas allocation bound for the importing environment. */
  maxCanvasBytes?: number;
  /** Relinquish the decoded sprite pixels to the returned project. */
  takeProjectOwnership?: boolean;
  /** Presentation of a rejected scan remains the caller's responsibility. */
  errors?: {
    preflight?: (result: AsepritePreflightResult) => Error;
    canvas?: (header: AsepritePreflightHeader, maxCanvasBytes: number) => Error;
  };
}

/** All project entry points inspect the same scan and canvas allocation before
 * inflation. Ownership and eager/lazy projection stay explicit per caller. */
function projectDecodeOptions(options: AsepriteProjectDecodeOptions): AsepriteDecodeOptions {
  const { maxCanvasBytes, takeProjectOwnership: _ownership, errors, ...decode } = options;
  const limits = { ...EDITOR_ASEPRITE_LIMITS, ...options.limits };
  const canvasBytes = Math.min(
    maxCanvasBytes ?? limits.maxDecodedBytes,
    limits.maxCelPixels * RGBA_BYTES_PER_PIXEL,
    limits.maxDecodedBytes,
  );
  if (!Number.isSafeInteger(canvasBytes) || canvasBytes < 0)
    throw new RangeError("Canvas byte limit must be a non-negative safe integer");
  return {
    ...decode,
    limits,
    preflight: true,
    allowUnsupported: false,
    onPreflight(result) {
      if (!result.ok || !result.header)
        throw (
          errors?.preflight?.(result) ??
          new AsepriteCodecError("Aseprite preflight rejected this file", result.issues)
        );
      const header = result.header;
      const pixels = header.width * header.height;
      if (!Number.isSafeInteger(pixels) || pixels * RGBA_BYTES_PER_PIXEL > canvasBytes)
        throw (
          errors?.canvas?.(header, canvasBytes) ??
          new AsepriteCodecError("Aseprite canvas exceeds the project resource limit")
        );
      options.onPreflight?.(result);
    },
  };
}

export async function decodeAsepriteProject(
  bytes: ArrayBuffer | Uint8Array,
  options: AsepriteProjectDecodeOptions = {},
): Promise<EditorProject> {
  const sprite = await decodeAseprite(bytes, projectDecodeOptions(options));
  return projectFromAseprite(sprite, { takeOwnership: options.takeProjectOwnership });
}

export function decodeAsepriteProjectSync(
  bytes: ArrayBuffer | Uint8Array,
  options: AsepriteProjectDecodeOptions = {},
): EditorProject {
  const sprite = decodeAsepriteSync(bytes, projectDecodeOptions(options));
  return projectFromAseprite(sprite, { takeOwnership: options.takeProjectOwnership });
}
