import {
  activateTimelineCel,
  ensureTimeline,
  markImmutableEditorProject,
  syncTimeline,
  type EditorDocument,
  type EditorPersistenceSnapshot,
} from "$/document";
import {
  EDITOR_ASEPRITE_LIMITS,
  decodeAsepriteProject,
  encodeAseprite,
  asepriteFromProject,
  type AsepriteDecodeOptions,
  type AsepriteEncodeOptions,
} from "$/import-export/aseprite";
import {
  decodeRecoveryEnvelope,
  encodeRecoveryEnvelope,
  encodeRecoveryMetadata,
  type RecoveryMetadata,
} from "$/import-export/recovery/envelope";

export interface RecoveryDecodeOptions {
  inflate?: AsepriteDecodeOptions["inflate"];
  maxProjectBytes?: number;
  takeInflatedOwnership?: boolean;
  deferPixels?: boolean;
}

/** Own metadata containers because timeline synchronization replaces their state.
 * Committed snapshot pixels are immutable; copying them again doubles peak memory.
 * The caller keeps the detached graph and borrowed pixel buffers immutable until
 * this operation completes. Each host supplies its own compression capability. */
export async function encodeRecoverySnapshot(
  snapshot: Readonly<EditorPersistenceSnapshot>,
  deflate: NonNullable<AsepriteEncodeOptions["deflate"]>,
): Promise<Uint8Array> {
  if (snapshot.version !== 1) throw new Error("Unsupported recovery snapshot version");
  const doc = { ...snapshot.document, layer: { ...snapshot.document.layer } };
  const metadata: RecoveryMetadata = {
    name: doc.name,
    format: doc.format,
    dirty: snapshot.dirty,
    activeFrame: doc.timeline?.activeFrame ?? 0,
    activeLayer: doc.timeline?.activeLayer ?? 0,
    composeGroups: doc.timeline?.composeGroups === true,
  };
  const meta = encodeRecoveryMetadata(metadata);
  syncTimeline(doc);
  const timeline = ensureTimeline(doc);
  const sprite = asepriteFromProject(
    { image: { width: doc.width, height: doc.height }, timeline, palette: doc.palette },
    { preserveGroupMetadata: true, borrowImageData: true },
  );
  const project = await encodeAseprite(sprite, {
    limits: EDITOR_ASEPRITE_LIMITS,
    compress: true,
    deflate,
  });
  return encodeRecoveryEnvelope(meta, project);
}

export async function decodeRecoverySnapshot(
  bytes: Uint8Array,
  options: RecoveryDecodeOptions = {},
): Promise<EditorPersistenceSnapshot> {
  const { metadata, project: projectBytes } = decodeRecoveryEnvelope(bytes);
  const maxProjectBytes = options.maxProjectBytes ?? EDITOR_ASEPRITE_LIMITS.maxFileBytes;
  if (!Number.isSafeInteger(maxProjectBytes) || maxProjectBytes < 1)
    throw new RangeError("maxProjectBytes must be a positive safe integer");
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
  const project = markImmutableEditorProject(
    await decodeAsepriteProject(projectBytes, {
      fileName: metadata.name,
      limits,
      maxCanvasBytes: Math.min(maxProjectBytes, limits.maxCelPixels * 4),
      // Lazy pixels retain a private input, never the caller's mutable envelope.
      takeOwnership: false,
      takeInflatedOwnership: options.takeInflatedOwnership ?? !options.inflate,
      deferPixels: options.deferPixels ?? !options.inflate,
      takeProjectOwnership: true,
      inflate: options.inflate,
    }),
  );
  if (
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
