import { MAX_IMAGE_DIMENSION, MAX_IMAGE_PIXELS } from "$/base/image-limits";
import { UINT8_MAX, BITS_PER_BYTE } from "$/base/numeric-constants";
import type { PixelMask, Point, Rgba } from "$/base/primitives";
import type { ViewSettings } from "$/canvas/types";
import { documentPastePosition, libreSpriteViewportDocumentBounds } from "$/canvas/view";
import { cloneTilemapClipboard, cloneClipboardTileset } from "$/clipboard/tile";
import type { ClipboardImage } from "$/clipboard/types";
import { workingColorProfile } from "$/color/icc-profile";
import {
  encodeAsepriteSamples,
  paletteForColors,
  type AsepriteImageSamples,
} from "$/color/samples";
import type { EditorDocument } from "$/document/types";
import type { AsepriteColorProfile } from "$/import-export/aseprite/model";
import { extractSelection } from "$/selection/transform";
import { rasterizeTilemap } from "$/tilemap/model";
import { selectedLayerTree } from "$/timeline/layer-operations";
import { compositeTimeline } from "$/timeline/operations/composite-timeline";
import { renderTimelineFrame } from "$/timeline/timeline";

export type { ClipboardImage } from "$/clipboard/types";
export function validateClipboardImage(image: ClipboardImage): void {
  const p = image.pixels;
  if (
    !Number.isSafeInteger(p.width) ||
    !Number.isSafeInteger(p.height) ||
    p.width < 1 ||
    p.height < 1 ||
    p.width > MAX_IMAGE_DIMENSION ||
    p.height > MAX_IMAGE_DIMENSION ||
    p.width * p.height > MAX_IMAGE_PIXELS ||
    p.data.length !== p.width * p.height * 4
  )
    throw new RangeError("Invalid clipboard image dimensions");
  const raw = image.asepriteSamples;
  if (
    raw &&
    (![8, 16].includes(raw.depth) ||
      raw.width !== p.width ||
      raw.height !== p.height ||
      !(raw.data instanceof Uint8Array) ||
      raw.data.length !== raw.width * raw.height * (raw.depth / BITS_PER_BYTE))
  )
    throw new RangeError("Invalid Aseprite clipboard samples");
  const tile = image.tilemap;
  if (tile) {
    const { map, tileset: set, selected } = tile,
      w = set.tileWidth,
      h = set.tileHeight;
    if (
      !Number.isSafeInteger(w) ||
      !Number.isSafeInteger(h) ||
      w < 1 ||
      h < 1 ||
      !Number.isSafeInteger(set.tileCount) ||
      set.tileCount < 1 ||
      !Number.isSafeInteger(map.width) ||
      !Number.isSafeInteger(map.height) ||
      map.width < 1 ||
      map.height < 1 ||
      map.width * w !== p.width ||
      map.height * h !== p.height ||
      !(map.tiles instanceof Uint32Array) ||
      map.tiles.length !== map.width * map.height ||
      selected.length !== map.tiles.length ||
      set.pixels.length !== w * h * set.tileCount * 4 ||
      map.tiles.some((v) => (v & 0x1fffffff) >= set.tileCount)
    )
      throw new RangeError("Invalid clipboard Tilemap");
  }
  const m = image.mask;
  if (
    m &&
    (m.width !== p.width ||
      m.height !== p.height ||
      !Number.isSafeInteger(m.x) ||
      !Number.isSafeInteger(m.y) ||
      m.data.length !== m.width * m.height)
  )
    throw new RangeError("Invalid clipboard selection");
}
export function cloneClipboardImage(image: ClipboardImage): ClipboardImage {
  validateClipboardImage(image);
  return {
    ...(image.tilemap
      ? { tilemap: cloneTilemapClipboard(image.tilemap), transparentIndex: image.transparentIndex }
      : {}),
    pixels: { ...image.pixels, data: image.pixels.data.slice() },
    mask: image.mask ? { ...image.mask, data: image.mask.data.slice() } : null,
    palette: image.palette?.map((color) => [...color] as unknown as Rgba),
    sourceProfile: cloneClipboardColorProfile(image.sourceProfile),
    ...(image.asepriteSamples
      ? {
          asepriteSamples: { ...image.asepriteSamples, data: image.asepriteSamples.data.slice() },
          transparentIndex: image.transparentIndex,
          sourceBackground: image.sourceBackground,
        }
      : {}),
  };
}
/** new_image_from_mask: a normal copy samples raw cel pixels (not layer opacity),
 * Copy Merged samples the visible frame composition, both clipped to the mask. */
export function copyDocumentSelection(
  doc: EditorDocument,
  merged = false,
  tilesMode = false,
): ClipboardImage | null {
  const mask = doc.selection;
  if (!mask || !mask.data.some(Boolean)) return null;
  const timeline = doc.timeline,
    active = timeline?.frames[timeline.activeFrame].cels[timeline.activeLayer],
    set = timeline?.tilesets?.find((s) => s.id === timeline.layers[timeline.activeLayer].tilesetId);
  if (tilesMode && !merged && active?.tilemap && set) {
    const w = set.tileWidth,
      h = set.tileHeight,
      left = Math.floor((mask.x - active.x) / w),
      top = Math.floor((mask.y - active.y) / h),
      width = Math.ceil((mask.x + mask.width - active.x) / w) - left,
      height = Math.ceil((mask.y + mask.height - active.y) / h) - top,
      tiles = new Uint32Array(width * height),
      selected = new Uint8Array(width * height),
      data = new Uint8Array(width * w * height * h);
    for (let y = 0; y < mask.height; y++)
      for (let x = 0; x < mask.width; x++)
        if (mask.data[y * mask.width + x])
          selected[
            Math.floor((mask.y + y - active.y) / h - top) * width +
              Math.floor((mask.x + x - active.x) / w - left)
          ] = UINT8_MAX;
    for (let y = 0; y < height; y++)
      for (let x = 0; x < width; x++) {
        if (!selected[y * width + x]) continue;
        const sx = left + x,
          sy = top + y;
        if (sx >= 0 && sy >= 0 && sx < active.tilemap.width && sy < active.tilemap.height)
          tiles[y * width + x] = active.tilemap.tiles[sy * active.tilemap.width + sx];
        for (let yy = 0; yy < h; yy++)
          data.fill(UINT8_MAX, ((y * h + yy) * width + x) * w, ((y * h + yy) * width + x + 1) * w);
      }
    const map = { width, height, tiles };
    return {
      pixels: rasterizeTilemap(
        map,
        set,
        timeline?.colorDepth,
        doc.palette,
        timeline?.transparentIndex,
      ),
      mask: {
        x: active.x + left * w,
        y: active.y + top * h,
        width: width * w,
        height: height * h,
        data,
      },
      tilemap: { map, selected, tileset: cloneClipboardTileset(set) },
      transparentIndex: timeline?.transparentIndex,
      palette: doc.palette?.map((c) => [...c] as Rgba),
      sourceProfile: cloneClipboardColorProfile(workingColorProfile(timeline)),
    };
  }
  const layer = merged
    ? { ...doc.layer, pixels: compositeTimeline(doc, undefined, undefined, false), x: 0, y: 0 }
    : doc.layer;
  const pixels = extractSelection(layer, mask),
    t = doc.timeline,
    cel = t?.frames[t.activeFrame].cels[t.activeLayer],
    depth = t?.colorDepth,
    background = !!(t && t.layers[t.activeLayer].flags & 8);
  let asepriteSamples: AsepriteImageSamples | undefined;
  if (!merged && cel?.asepriteSamples && (depth === 8 || depth === 16)) {
    const stride = depth / BITS_PER_BYTE,
      data = new Uint8Array(mask.width * mask.height * stride);
    if (depth === 8) data.fill(t?.transparentIndex ?? 0);
    for (let y = 0; y < mask.height; y++)
      for (let x = 0; x < mask.width; x++) {
        if (!mask.data[y * mask.width + x]) continue;
        const sx = mask.x + x - cel.x,
          sy = mask.y + y - cel.y;
        if (sx < 0 || sy < 0 || sx >= cel.asepriteSamples.width || sy >= cel.asepriteSamples.height)
          continue;
        const at = (sy * cel.asepriteSamples.width + sx) * stride;
        data.set(cel.asepriteSamples.data.subarray(at, at + stride), (y * mask.width + x) * stride);
      }
    asepriteSamples = encodeAsepriteSamples(
      pixels,
      depth,
      paletteForColors(doc.palette),
      background ? -1 : (t?.transparentIndex ?? 0),
      { depth, width: mask.width, height: mask.height, data },
    );
  }
  if (!asepriteSamples && (depth === 8 || depth === 16))
    asepriteSamples = encodeAsepriteSamples(
      pixels,
      depth,
      paletteForColors(doc.palette),
      background && !merged ? -1 : (t?.transparentIndex ?? 0),
    );
  return {
    pixels,
    mask: { ...mask, data: mask.data.slice() },
    palette: doc.palette?.map((color) => [...color] as unknown as Rgba),
    sourceProfile: cloneClipboardColorProfile(workingColorProfile(t)),
    ...(asepriteSamples
      ? {
          asepriteSamples,
          transparentIndex: t?.transparentIndex,
          sourceBackground: background && !merged,
        }
      : {}),
  };
}

/** Render selected visible layers for one frame, then apply the document mask.
 * The range copy creates one merged raster cel per selected frame. */
export function copyTimelineRangeSelection(
  doc: EditorDocument,
  frameIndex: number,
  layerIndices: readonly number[],
): ClipboardImage | null {
  const mask = doc.selection,
    t = doc.timeline;
  if (!mask || !mask.data.some(Boolean) || !t?.frames[frameIndex]) return null;
  const selected = new Set(selectedLayerTree(t, layerIndices));
  const visibleTimeline = {
    ...t,
    activeFrame: frameIndex,
    layers: t.layers.map((layer, index) => ({ ...layer, visible: selected.has(index) })),
  };
  const merged = renderTimelineFrame(
    visibleTimeline,
    doc.width,
    doc.height,
    frameIndex,
    undefined,
    false,
  );
  const pixels = extractSelection(
    { name: doc.layer.name, pixels: merged, x: 0, y: 0, visible: true, locked: false },
    mask,
  );
  const palette = t.frames[frameIndex].palette ?? doc.palette,
    depth = t.colorDepth;
  let asepriteSamples: AsepriteImageSamples | undefined;
  if (depth === 8 || depth === 16)
    asepriteSamples = encodeAsepriteSamples(
      pixels,
      depth,
      paletteForColors(palette),
      t.transparentIndex ?? 0,
    );
  return {
    pixels,
    mask: { ...mask, data: mask.data.slice() },
    palette: palette?.map((color) => [...color] as Rgba),
    sourceProfile: cloneClipboardColorProfile(workingColorProfile(t)),
    ...(asepriteSamples
      ? { asepriteSamples, transparentIndex: t.transparentIndex, sourceBackground: false }
      : {}),
  };
}

export function clipboardPasteMask(image: ClipboardImage, position: Point): PixelMask {
  validateClipboardImage(image);
  return {
    x: Math.floor(position.x),
    y: Math.floor(position.y),
    width: image.pixels.width,
    height: image.pixels.height,
    data:
      image.mask?.data.slice() ??
      new Uint8Array(image.pixels.width * image.pixels.height).fill(UINT8_MAX),
  };
}
/** Preserve a copied selection's placement when its center is in view; otherwise
 * center it in the viewport. Images without a selection use the default placement.
 */
export function clipboardPastePosition(
  image: ClipboardImage,
  doc: Pick<EditorDocument, "width" | "height">,
  viewport: { width: number; height: number },
  view: Pick<ViewSettings, "zoom" | "pan">,
): Point {
  if (!image.mask) return documentPastePosition(image.pixels, doc, viewport, view);
  type Span = { start: number; end: number };
  const viewportBounds = libreSpriteViewportDocumentBounds(viewport, doc, view);
  const visibleX: Span = {
    start: viewportBounds.x,
    end: viewportBounds.x + viewportBounds.width,
  };
  const visibleY: Span = {
    start: viewportBounds.y,
    end: viewportBounds.y + viewportBounds.height,
  };
  const pixels = image.pixels;
  const clampInto = (value: number, span: Span) =>
    Math.max(span.start, Math.min(value, span.end - 1));
  const contains = (span: Span, value: number) => value >= span.start && value < span.end;
  const centeredOrigin = (span: Span, imageExtent: number) =>
    span.start + Math.trunc((span.end - span.start) / 2) - Math.trunc(imageExtent / 2);
  const positionInViewport = (originalOrigin: number, imageExtent: number, visible: Span) => {
    const imageCenter = originalOrigin + Math.trunc(imageExtent / 2);
    if (!contains(visible, imageCenter)) return centeredOrigin(visible, imageExtent);

    // Project the original translation into the viewport's allowed origin set.
    const allowedOrigins = {
      start: visible.start - imageExtent,
      end: visible.end,
    };
    return clampInto(originalOrigin, allowedOrigins);
  };
  const placed = {
    x: positionInViewport(image.mask.x, pixels.width, visibleX),
    y: positionInViewport(image.mask.y, pixels.height, visibleY),
  };

  // If either dimension cannot hold the whole image, preserve the historical
  // one-pixel document overlap rule on both axes.
  const requireWholeImageInside = pixels.width >= doc.width || pixels.height >= doc.height;
  const fitDocumentAxis = (origin: number, imageExtent: number, documentExtent: number) => {
    const allowedOrigins = requireWholeImageInside
      ? { start: 0, end: Math.max(0, documentExtent - imageExtent) + 1 }
      : { start: 1 - imageExtent, end: documentExtent };
    return clampInto(origin, allowedOrigins);
  };
  return {
    x: fitDocumentAxis(placed.x, pixels.width, doc.width),
    y: fitDocumentAxis(placed.y, pixels.height, doc.height),
  };
}

export function cloneClipboardColorProfile(
  profile: AsepriteColorProfile | undefined,
): AsepriteColorProfile | undefined {
  return profile
    ? { ...profile, ...(profile.type === "icc" ? { data: profile.data.slice() } : {}) }
    : undefined;
}
