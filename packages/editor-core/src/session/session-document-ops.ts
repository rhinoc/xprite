import { UINT8_MAX } from "$/base/numeric-constants";
import type { PixelBuffer, Rect, Rgba } from "$/base/primitives";
import { compositeDocumentFrame, quantizePalette } from "$/color";
import type { EditorDocument, EditorProject } from "$/document";
import type { RasterEditor } from "$/editor/RasterEditor";
import { asepriteFromProject, encodeAseprite, type AsepriteEncodeOptions } from "$/import-export";
import type { EditorSessionSnapshot } from "$/session/types";

const RGBA_CHANNELS = 4;

/** Default Aseprite project export options shared across save adapters and agent exports. */
export const DEFAULT_ASEPRITE_PROJECT_EXPORT_OPTIONS = {
  preserveGroupMetadata: true,
} as const;

export type SessionAsepriteProjectInput = Pick<EditorProject, "timeline" | "palette"> & {
  image: { width: number; height: number };
};

export interface DocumentLayerPixelSource {
  readonly pixels: PixelBuffer;
  readonly origin: { readonly x: number; readonly y: number };
}

/**
 * Shared Aseprite encoding policy: always preserve authored group metadata and default to
 * compressed cels whenever a deflate implementation is supplied.
 */
export function encodeSessionAsepriteProject(
  project: SessionAsepriteProjectInput,
  options: AsepriteEncodeOptions = {},
): Promise<Uint8Array> {
  const sprite = asepriteFromProject(project, DEFAULT_ASEPRITE_PROJECT_EXPORT_OPTIONS);
  const compress = options.compress ?? Boolean(options.deflate);
  return encodeAseprite(sprite, {
    ...options,
    compress,
  });
}

/** Encode a live editor document's persistence snapshot using the shared Aseprite policy. */
export function encodeEditorDocumentAseprite(
  core: Pick<RasterEditor, "getPersistenceSnapshot">,
  options: AsepriteEncodeOptions = {},
): Promise<Uint8Array> {
  const snapshot = core.getPersistenceSnapshot();
  const timeline = snapshot?.document.timeline;
  if (!snapshot || !timeline) throw new Error("Document has no timeline to encode as Aseprite");
  const { document } = snapshot;
  return encodeSessionAsepriteProject(
    {
      image: { width: document.width, height: document.height },
      timeline,
      palette: document.palette,
    },
    options,
  );
}

/** Single source of truth for whether a document view has pending session IO or uncommitted edits. */
export function isSessionDocumentBusy(
  core: Pick<
    RasterEditor,
    "getSnapshot" | "hasPendingDocumentEdit" | "imageEditing" | "importExport"
  >,
  session: Partial<Pick<EditorSessionSnapshot, "busy" | "pendingImport" | "replacement">>,
): boolean {
  return Boolean(
    session.busy ||
    session.pendingImport ||
    session.replacement ||
    core.hasPendingDocumentEdit() ||
    core.getSnapshot().inlineText ||
    core.imageEditing.getEffectPreview() ||
    core.importExport.getSpriteSheetPreview(),
  );
}

/** Both raster image layers and projected tilemap layers expose readable RGBA cel buffers. */
export function isReadablePixelLayerKind(kind: string | undefined): boolean {
  return !kind || kind === "image" || kind === "tilemap";
}

/**
 * Resolve the live or cel-backed RGBA buffer and sprite-space origin for one layer/frame.
 * Works identically for raster image layers and tilemap layers.
 */
export function resolveDocumentLayerPixels(
  doc: EditorDocument,
  frameIndex: number,
  layerIndex: number,
): DocumentLayerPixelSource | null {
  const timeline = doc.timeline;
  if (!timeline) return null;
  const frame = timeline.frames[frameIndex];
  if (!frame || layerIndex < 0 || layerIndex >= timeline.layers.length) return null;
  const cel = frame.cels[layerIndex];
  const isActive = frameIndex === timeline.activeFrame && layerIndex === timeline.activeLayer;
  const pixels = isActive ? doc.layer.pixels : cel?.pixels;
  if (!pixels) return null;
  const origin = isActive ? { x: doc.layer.x, y: doc.layer.y } : { x: cel?.x ?? 0, y: cel?.y ?? 0 };
  return { pixels, origin };
}

/** Copy a sprite-space rectangle from a cel or composite pixel buffer, padding out-of-bounds with transparency. */
export function extractPixelBufferRegion(
  source: PixelBuffer | undefined,
  origin: { readonly x: number; readonly y: number },
  rect: Rect,
): PixelBuffer {
  const pixels: PixelBuffer = {
    width: rect.width,
    height: rect.height,
    data: new Uint8ClampedArray(rect.width * rect.height * RGBA_CHANNELS),
  };
  if (!source) return pixels;
  for (let y = 0; y < rect.height; y++) {
    const sy = rect.y + y - origin.y;
    if (sy < 0 || sy >= source.height) continue;
    for (let x = 0; x < rect.width; x++) {
      const sx = rect.x + x - origin.x;
      if (sx < 0 || sx >= source.width) continue;
      const from = (sy * source.width + sx) * RGBA_CHANNELS;
      pixels.data.set(
        source.data.subarray(from, from + RGBA_CHANNELS),
        (y * rect.width + x) * RGBA_CHANNELS,
      );
    }
  }
  return pixels;
}

/** Bounding box of non-transparent pixels inside a buffer, or null when completely transparent. */
export function computeAlphaBounds(pixels: PixelBuffer): Rect | null {
  let minX = -1;
  let minY = -1;
  let maxX = -1;
  let maxY = -1;
  const { data, width, height } = pixels;
  for (let y = 0; y < height; y++) {
    const row = y * width * RGBA_CHANNELS;
    for (let x = 0; x < width; x++) {
      if (data[row + x * RGBA_CHANNELS + 3] !== 0) {
        if (minX < 0 || x < minX) minX = x;
        if (x > maxX) maxX = x;
        if (minY < 0) minY = y;
        maxY = y;
      }
    }
  }
  return minX < 0 ? null : { x: minX, y: minY, width: maxX - minX + 1, height: maxY - minY + 1 };
}

/**
 * Compute the clipped sprite-space destination rectangle for placing `sourceSize` at `position`
 * inside `canvasSize`, or null when the image falls completely outside the canvas.
 */
export function clipOverlayToCanvas(
  sourceSize: { readonly width: number; readonly height: number },
  position: { readonly x: number; readonly y: number },
  canvasSize: { readonly width: number; readonly height: number },
): Rect | null {
  const x = Math.max(position.x, 0);
  const y = Math.max(position.y, 0);
  const width = Math.min(sourceSize.width + Math.min(position.x, 0), canvasSize.width - x);
  const height = Math.min(sourceSize.height + Math.min(position.y, 0), canvasSize.height - y);
  if (width <= 0 || height <= 0) return null;
  return { x, y, width, height };
}

/**
 * Clip an imported overlay buffer to `rect` (placed at `position`) and alpha-over composite
 * transparent / semi-transparent pixels over an optional `base` region of the same dimensions.
 */
export function compositeOverlayRegion(
  source: PixelBuffer,
  position: { readonly x: number; readonly y: number },
  rect: Rect,
  base?: PixelBuffer,
): Uint8ClampedArray {
  const offsetX = rect.x - position.x;
  const offsetY = rect.y - position.y;
  const clipped = new Uint8ClampedArray(rect.width * rect.height * RGBA_CHANNELS);
  for (let row = 0; row < rect.height; row++) {
    const srcStart = ((offsetY + row) * source.width + offsetX) * RGBA_CHANNELS;
    clipped.set(
      source.data.subarray(srcStart, srcStart + rect.width * RGBA_CHANNELS),
      row * rect.width * RGBA_CHANNELS,
    );
  }
  if (!base) return clipped;
  for (let at = 0; at < clipped.length; at += RGBA_CHANNELS) {
    const alpha = clipped[at + 3];
    if (alpha === 0) {
      clipped.set(base.data.subarray(at, at + RGBA_CHANNELS), at);
      continue;
    }
    if (alpha === UINT8_MAX) continue;
    const inverse = UINT8_MAX - alpha;
    const baseAlpha = base.data[at + 3];
    const scaledBaseAlpha = (baseAlpha * inverse) / UINT8_MAX;
    const outAlpha = alpha + scaledBaseAlpha;
    if (outAlpha === 0) continue;
    for (let channel = 0; channel < 3; channel++) {
      clipped[at + channel] = Math.round(
        (clipped[at + channel] * alpha + base.data[at + channel] * scaledBaseAlpha) / outAlpha,
      );
    }
    clipped[at + 3] = Math.round(outAlpha);
  }
  return clipped;
}

/** Extract a multi-frame document palette across all timeline frames using shared quantization rules. */
export function extractDocumentFramesPalette(doc: EditorDocument, maxColors: number): Rgba[] {
  const timeline = doc.timeline;
  const frameCount = timeline?.frames.length ?? 1;
  const frames = Array.from({ length: frameCount }, (_, frame) =>
    compositeDocumentFrame(doc, frame),
  );
  return quantizePalette(frames, maxColors, true, undefined, timeline?.transparentIndex ?? -1);
}
