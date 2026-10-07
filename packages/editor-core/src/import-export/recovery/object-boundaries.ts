import {
  EDITOR_ASEPRITE_LIMITS,
  readAsepriteChunkRanges,
  type AsepriteChunkRange,
} from "$/import-export/aseprite";
import { decodeRecoveryEnvelope } from "$/import-export/recovery/envelope";

/** Natural ASE chunk boundaries in the complete recovery envelope.
 * Consumers decide which objects to group, retain or split for their own transport. */
export function readRecoveryChunkRanges(bytes: Uint8Array): readonly AsepriteChunkRange[] {
  const { project } = decodeRecoveryEnvelope(bytes);
  const projectStart = project.byteOffset - bytes.byteOffset;
  return readAsepriteChunkRanges(project, { limits: EDITOR_ASEPRITE_LIMITS }).map(
    ({ start, end }) => ({
      start: projectStart + start,
      end: projectStart + end,
    }),
  );
}
