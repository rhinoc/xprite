import {
  annotateAsepriteDecodeFailure,
  inflateAsepriteDeflate,
  type AsepriteFileOptions,
} from "$/adapters/files/aseprite-files";
import { compressRecoveryBytes } from "$/adapters/workers/recovery-compression";
import type { EditorPersistenceSnapshot } from "@xprite/editor-core/document";
import {
  decodeRecoveryEnvelope,
  decodeRecoverySnapshot as decodeSnapshot,
  encodeRecoverySnapshot as encodeSnapshot,
  type AsepriteEncodeOptions,
} from "@xprite/editor-core/import-export";

type BrowserRecoveryDecodeOptions = Pick<
  AsepriteFileOptions,
  "inflate" | "decompressionStream" | "maxInflatedBytes" | "maxProjectBytes" | "onSourceBytes"
>;

/** Browser defaults around the portable recovery codec. Compression and optional
 * stream inflation belong to the host; envelopes and document reconstruction do not. */
export function encodeRecoverySnapshot(
  snapshot: EditorPersistenceSnapshot,
  deflate: NonNullable<AsepriteEncodeOptions["deflate"]> = compressRecoveryBytes,
): Promise<Uint8Array> {
  return encodeSnapshot(snapshot, deflate);
}

export async function decodeRecoverySnapshot(
  bytes: Uint8Array,
  options: BrowserRecoveryDecodeOptions = {},
): Promise<EditorPersistenceSnapshot> {
  const { metadata, project } = decodeRecoveryEnvelope(bytes);
  try {
    options.onSourceBytes?.(project.slice());
    return await decodeSnapshot(bytes, {
      maxProjectBytes: options.maxProjectBytes,
      inflate:
        options.inflate ??
        (options.decompressionStream || options.maxInflatedBytes !== undefined
          ? (compressed, expected) => inflateAsepriteDeflate(compressed, expected, options)
          : undefined),
      takeInflatedOwnership: !options.inflate,
      deferPixels: !options.inflate,
    });
  } catch (reason) {
    throw await annotateAsepriteDecodeFailure(reason, project, metadata.name);
  }
}
