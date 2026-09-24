import {
  decodeAsepriteBlob,
  DEFAULT_MAX_ASEPRITE_PROJECT_BYTES,
} from "$/adapters/files/aseprite-files";
import { activateTimelineCel } from "@xprite/editor-core";
import type { EditorDocument } from "@xprite/editor-core";
import type { EditorPersistenceSnapshot } from "@xprite/editor-core";
import {
  encodeAsepriteSync,
  encodeAseprite,
  asepriteFromProject,
  projectFromDocument,
  type AsepriteEncodeOptions,
} from "@xprite/editor-core/import-export";

const MAGIC = new Uint8Array([65, 83, 69, 82, 69, 67, 79, 86]); // ASERECOV
const HEADER_BYTES = 20;
const MAX_METADATA_BYTES = 64 * 1024;
export const MAX_RECOVERY_BYTES =
  DEFAULT_MAX_ASEPRITE_PROJECT_BYTES + MAX_METADATA_BYTES + HEADER_BYTES;

interface Metadata {
  name: string;
  format?: "png" | "aseprite";
  dirty: boolean;
  activeFrame: number;
  activeLayer: number;
  composeGroups: boolean;
}

function validateMetadata(value: unknown): asserts value is Metadata {
  const m = value as Metadata | null;
  if (
    !m ||
    typeof m.name !== "string" ||
    typeof m.dirty !== "boolean" ||
    (m.format !== undefined && m.format !== "png" && m.format !== "aseprite") ||
    typeof m.composeGroups !== "boolean" ||
    !Number.isSafeInteger(m.activeFrame) ||
    m.activeFrame < 0 ||
    !Number.isSafeInteger(m.activeLayer) ||
    m.activeLayer < 0
  )
    throw new Error("Invalid recovery metadata");
}

/** Portable, versioned recovery envelope around the established ASE codec.
 * Own the working copy because projectFromDocument synchronizes timeline state.
 * Hosts can supply compression without requiring CompressionStream support. */
export async function encodeRecoverySnapshot(
  snapshot: EditorPersistenceSnapshot,
  deflate?: AsepriteEncodeOptions["deflate"],
): Promise<Uint8Array> {
  if (snapshot.version !== 1) throw new Error("Unsupported recovery snapshot version");
  const doc = structuredClone(snapshot.document);
  const metadata: Metadata = {
    name: doc.name,
    format: doc.format,
    dirty: snapshot.dirty,
    activeFrame: doc.timeline?.activeFrame ?? 0,
    activeLayer: doc.timeline?.activeLayer ?? 0,
    composeGroups: doc.timeline?.composeGroups === true,
  };
  validateMetadata(metadata);
  const meta = new TextEncoder().encode(JSON.stringify(metadata));
  if (meta.length > MAX_METADATA_BYTES)
    throw new RangeError("Recovery metadata exceeds its size limit");
  const sprite = asepriteFromProject(projectFromDocument(doc), { preserveGroupMetadata: true });
  const options = {
    limits: {
      maxFileBytes: DEFAULT_MAX_ASEPRITE_PROJECT_BYTES,
      maxDecodedBytes: DEFAULT_MAX_ASEPRITE_PROJECT_BYTES,
      maxFrames: 4096,
      maxLayers: 256,
      maxCelPixels: DEFAULT_MAX_ASEPRITE_PROJECT_BYTES / 4,
    },
  };
  const ase = deflate
    ? await encodeAseprite(sprite, { ...options, compress: true, deflate })
    : encodeAsepriteSync(sprite, options);
  const bytes = new Uint8Array(HEADER_BYTES + meta.length + ase.length);
  bytes.set(MAGIC);
  const header = new DataView(bytes.buffer);
  header.setUint32(8, 1, true);
  header.setUint32(12, meta.length, true);
  header.setUint32(16, ase.length, true);
  bytes.set(meta, HEADER_BYTES);
  bytes.set(ase, HEADER_BYTES + meta.length);
  return bytes;
}

export async function decodeRecoverySnapshot(
  bytes: Uint8Array,
): Promise<EditorPersistenceSnapshot> {
  if (
    !(bytes instanceof Uint8Array) ||
    bytes.length < HEADER_BYTES ||
    bytes.length > MAX_RECOVERY_BYTES
  )
    throw new Error("Invalid recovery snapshot size");
  if (!MAGIC.every((value, index) => bytes[index] === value))
    throw new Error("Invalid recovery snapshot magic");
  const header = new DataView(bytes.buffer, bytes.byteOffset, bytes.byteLength);
  if (header.getUint32(8, true) !== 1) throw new Error("Unsupported recovery snapshot version");
  const metaLength = header.getUint32(12, true),
    aseLength = header.getUint32(16, true);
  if (
    metaLength < 2 ||
    metaLength > MAX_METADATA_BYTES ||
    aseLength < 128 ||
    aseLength > DEFAULT_MAX_ASEPRITE_PROJECT_BYTES ||
    HEADER_BYTES + metaLength + aseLength !== bytes.length
  )
    throw new Error("Invalid recovery snapshot bounds");
  const metadata: unknown = JSON.parse(
    new TextDecoder("utf-8", { fatal: true }).decode(
      bytes.subarray(HEADER_BYTES, HEADER_BYTES + metaLength),
    ),
  );
  validateMetadata(metadata);
  const ase = bytes.slice(HEADER_BYTES + metaLength);
  const project = await decodeAsepriteBlob(new Blob([ase]), metadata.name);
  if (
    !project.timeline ||
    metadata.activeFrame >= project.timeline.frames.length ||
    metadata.activeLayer >= project.timeline.layers.length
  )
    throw new Error("Invalid recovery active cel");
  project.timeline.composeGroups = metadata.composeGroups;
  const document: EditorDocument = {
    name: metadata.name,
    format: metadata.format,
    width: project.image.width,
    height: project.image.height,
    palette: project.palette,
    timeline: project.timeline,
    selection: null,
    layer: {
      name: "",
      visible: true,
      locked: false,
      x: 0,
      y: 0,
      pixels: { width: 1, height: 1, data: new Uint8ClampedArray(4) },
    },
  };
  activateTimelineCel(document, metadata.activeFrame, metadata.activeLayer);
  return { version: 1, document, dirty: metadata.dirty };
}
