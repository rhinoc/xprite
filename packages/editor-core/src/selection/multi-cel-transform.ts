import { EditorAllocationError } from "$/base/errors";
import type { AsepriteImageSamples } from "$/base/image";
import { MAX_IMAGE_DIMENSION, MAX_IMAGE_PIXELS } from "$/base/image-limits";
import { BITS_PER_BYTE, UINT8_MAX } from "$/base/numeric-constants";
import type { PixelBuffer, PixelMask, Rgba } from "$/base/primitives";
import { normalBlend, samplePixel } from "$/canvas/raster";
import {
  encodeAsepriteSamples,
  expandAsepriteSamples,
  paletteForColors,
  libreSpriteWorkingBrushColor,
  libreSpriteWorkingBrushIndex,
} from "$/color";
import { activateTimelineCel, ensureTimeline, syncTimeline } from "$/document";
import type { EditorDocument } from "$/document";
import { extractSelection, rasterizeSelectionTransform } from "$/selection/transform";
import type { SelectionTransform } from "$/selection/types";
import {
  isBackgroundLayer,
  layerAncestors,
  LAYER_REFERENCE,
  selectedLayerTree,
  validTimelineRange,
} from "$/timeline";
import type { SpriteTimeline, TimelineCel } from "$/timeline";

interface Target {
  frame: number;
  layer: number;
  cel: TimelineCel;
  source: PixelBuffer;
  samples?: AsepriteImageSamples;
}

export interface MultiCelTransformOptions {
  enabled: boolean;
  autoOpaque: boolean;
  background: Rgba;
  backgroundIndex?: number | null;
}

export type TransformSelectionSamples = (
  source: AsepriteImageSamples,
  transform: SelectionTransform,
  transparentIndex: number,
) => AsepriteImageSamples | undefined;

export const MULTI_CEL_IMAGE_LAYERS_REQUIRED =
  "Select image-layer cels to transform this selection together";

function editable(timeline: SpriteTimeline, layer: number): boolean {
  const current = timeline.layers[layer];
  return (
    !!current &&
    current.kind !== "group" &&
    !(current.flags & LAYER_REFERENCE) &&
    !current.locked &&
    layerAncestors(timeline, layer).every((parent) => !parent.locked)
  );
}

function identity(cel: TimelineCel): object {
  return cel.asepriteSamples ?? cel.pixels;
}

function transformSites(timeline: SpriteTimeline, enabled: boolean) {
  const range = timeline.range;
  if (!range || !validTimelineRange(timeline, range) || (!enabled && range.kind !== "cels"))
    return null;
  const frames = range.kind === "layers" ? timeline.frames.map((_, index) => index) : range.frames;
  const layers =
    range.kind === "frames"
      ? timeline.layers.map((_, index) => index)
      : selectedLayerTree(timeline, range.layers);
  return (function* sites() {
    yield { frame: timeline.activeFrame, layer: timeline.activeLayer };
    for (const frame of frames) for (const layer of layers) yield { frame, layer };
  })();
}

/** Groups expand to editable descendants; a mixed tilemap batch cannot be partially applied. */
export function canTransformTimelineSelection(
  document: Pick<EditorDocument, "timeline">,
  enabled = true,
): boolean {
  const timeline = document.timeline;
  if (!timeline) return false;
  const sites = transformSites(timeline, enabled);
  if (!sites) return false;
  let found = false;
  for (const { frame, layer } of sites) {
    const cel = timeline.frames[frame]?.cels[layer];
    if (!editable(timeline, layer) || !cel) continue;
    if (timeline.layers[layer].kind === "tilemap" || cel.tilemap) return false;
    found = true;
  }
  return found;
}

function allocation(width: number, height: number, total = width * height): void {
  if (
    !Number.isSafeInteger(width) ||
    !Number.isSafeInteger(height) ||
    width < 1 ||
    height < 1 ||
    width > MAX_IMAGE_DIMENSION ||
    height > MAX_IMAGE_DIMENSION ||
    total > MAX_IMAGE_PIXELS
  )
    throw new EditorAllocationError(width, height);
}

function extractSamples(
  cel: TimelineCel,
  mask: PixelMask,
  transparentIndex: number,
): AsepriteImageSamples | undefined {
  const raw = cel.asepriteSamples;
  if (!raw) return undefined;
  const stride = raw.depth / BITS_PER_BYTE;
  const data = new Uint8Array(mask.width * mask.height * stride);
  if (raw.depth === 8) data.fill(transparentIndex);
  for (let y = 0; y < mask.height; y++)
    for (let x = 0; x < mask.width; x++) {
      const sx = mask.x + x - cel.x,
        sy = mask.y + y - cel.y;
      if (!mask.data[y * mask.width + x] || sx < 0 || sy < 0 || sx >= raw.width || sy >= raw.height)
        continue;
      const from = (sy * raw.width + sx) * stride;
      data.set(raw.data.subarray(from, from + stride), (y * mask.width + x) * stride);
    }
  return { depth: raw.depth, width: mask.width, height: mask.height, data };
}

/** Owns a frozen target set. Original cel buffers are never changed by preview. */
export class MultiCelSelectionTransform {
  private cachedTransform: SelectionTransform | null = null;
  private cachedTimeline: SpriteTimeline | null = null;

  private constructor(
    private readonly document: EditorDocument,
    private readonly timeline: SpriteTimeline,
    private readonly mask: PixelMask,
    private readonly targets: readonly Target[],
    private readonly options: MultiCelTransformOptions,
  ) {}

  static create(
    document: EditorDocument,
    mask: PixelMask,
    options: MultiCelTransformOptions,
  ): MultiCelSelectionTransform | null {
    syncTimeline(document);
    const timeline = ensureTimeline(document);
    const sites = transformSites(timeline, options.enabled);
    if (!sites) return null;
    const seen = new Map<number, Set<object>>(),
      targets: Target[] = [];
    let total = 0;
    for (const site of sites) {
      if (!editable(timeline, site.layer)) continue;
      const cel = timeline.frames[site.frame]?.cels[site.layer];
      if (!cel) continue;
      if (cel.tilemap || timeline.layers[site.layer].kind === "tilemap")
        throw new RangeError(MULTI_CEL_IMAGE_LAYERS_REQUIRED);
      let images = seen.get(site.layer);
      if (!images) {
        images = new Set();
        seen.set(site.layer, images);
      }
      if (images.has(identity(cel))) continue;
      images.add(identity(cel));
      total += mask.width * mask.height;
      allocation(mask.width, mask.height, total);
      targets.push({
        ...site,
        cel,
        source: extractSelection(
          { ...document.layer, pixels: cel.pixels, x: cel.x, y: cel.y },
          mask,
        ),
        samples: extractSamples(cel, mask, timeline.transparentIndex ?? 0),
      });
    }
    if (!targets.length) return null;
    return new MultiCelSelectionTransform(
      document,
      timeline,
      { ...mask, data: mask.data.slice() },
      targets,
      { ...options },
    );
  }

  belongsTo(document: EditorDocument): boolean {
    return this.document === document;
  }

  render(transform: SelectionTransform, samples: TransformSelectionSamples): SpriteTimeline {
    if (transform === this.cachedTransform && this.cachedTimeline) return this.cachedTimeline;
    const frames = this.timeline.frames.map((frame) => ({ ...frame, cels: [...frame.cels] }));
    let total = 0;
    for (const target of this.targets) {
      const background = isBackgroundLayer(this.timeline.layers[target.layer]);
      const currentTransform = {
        ...transform,
        source: target.source,
        mask: this.mask,
        opaque: this.options.autoOpaque ? background : transform.opaque,
      };
      const rendered = rasterizeSelectionTransform(currentTransform);
      const transformedSamples = target.samples
        ? samples(target.samples, currentTransform, this.timeline.transparentIndex ?? 0)
        : undefined;
      const result = this.merge(
        target,
        currentTransform,
        rendered.pixels,
        rendered.mask,
        transformedSamples,
        total,
      );
      if (result) {
        total += result.pixels.width * result.pixels.height;
        allocation(result.pixels.width, result.pixels.height, total);
      }
      const projected = new Map<readonly Rgba[] | undefined, PixelBuffer>();
      if (result)
        projected.set(
          this.timeline.frames[target.frame].palette ?? this.document.palette,
          result.pixels,
        );
      for (let frame = 0; frame < frames.length; frame++) {
        const cel = this.timeline.frames[frame].cels[target.layer];
        if (!cel || identity(cel) !== identity(target.cel)) continue;
        if (!result) {
          frames[frame].cels[target.layer] = null;
          continue;
        }
        const palette = this.timeline.frames[frame].palette ?? this.document.palette;
        let pixels = result.pixels;
        if (result.asepriteSamples?.depth === 8) {
          const cached = projected.get(palette);
          if (cached) pixels = cached;
          else {
            total += result.pixels.width * result.pixels.height;
            allocation(result.pixels.width, result.pixels.height, total);
            pixels = {
              ...result.pixels,
              data: expandAsepriteSamples(
                result.asepriteSamples,
                paletteForColors(palette),
                background ? -1 : (this.timeline.transparentIndex ?? 0),
              ),
            };
            projected.set(palette, pixels);
          }
        }
        frames[frame].cels[target.layer] = {
          ...cel,
          pixels,
          asepriteSamples: result.asepriteSamples,
          x: cel.x + result.x - target.cel.x,
          y: cel.y + result.y - target.cel.y,
        };
      }
    }
    const timeline = { ...this.timeline, frames };
    this.cachedTransform = transform;
    this.cachedTimeline = timeline;
    return timeline;
  }

  preview(
    document: EditorDocument,
    transform: SelectionTransform,
    samples: TransformSelectionSamples,
  ): EditorDocument {
    const timeline = this.render(transform, samples);
    const output = {
      ...document,
      layer: { ...document.layer },
      timeline: {
        ...timeline,
        layers: document.timeline?.layers ?? timeline.layers,
      },
    };
    activateTimelineCel(output, timeline.activeFrame, timeline.activeLayer);
    return output;
  }

  private merge(
    target: Target,
    transform: SelectionTransform,
    moved: PixelBuffer,
    mask: PixelMask,
    movedSamples: AsepriteImageSamples | undefined,
    previousPixels: number,
  ): TimelineCel | null {
    const cel = target.cel,
      timeline = this.timeline;
    const background = isBackgroundLayer(timeline.layers[target.layer]);
    const palette = timeline.frames[target.frame].palette ?? this.document.palette;
    const working = { ...timeline, activeLayer: target.layer, activeFrame: target.frame };
    const bg = libreSpriteWorkingBrushColor(
      this.options.background,
      working,
      palette,
      this.options.backgroundIndex ?? undefined,
    );
    const clear: Rgba = background ? [bg[0], bg[1], bg[2], UINT8_MAX] : [0, 0, 0, 0];
    const left = background ? 0 : Math.min(cel.x, mask.x),
      top = background ? 0 : Math.min(cel.y, mask.y);
    const right = background
      ? this.document.width
      : Math.max(cel.x + cel.pixels.width, mask.x + moved.width);
    const bottom = background
      ? this.document.height
      : Math.max(cel.y + cel.pixels.height, mask.y + moved.height);
    const width = right - left,
      height = bottom - top;
    allocation(width, height, previousPixels + width * height);
    const pixels: PixelBuffer = { width, height, data: new Uint8ClampedArray(width * height * 4) };
    const depth = timeline.colorDepth,
      stride = depth === 8 ? 1 : 2;
    const raw = depth === 8 || depth === 16 ? new Uint8Array(width * height * stride) : undefined;
    const clearIndex = background
      ? (libreSpriteWorkingBrushIndex(
          clear,
          working,
          palette,
          this.options.backgroundIndex ?? undefined,
        ) ?? 0)
      : (timeline.transparentIndex ?? 0);
    if (raw && depth === 8) raw.fill(clearIndex);
    if (background) for (let i = 0; i < width * height; i++) pixels.data.set(clear, i * 4);
    for (let y = 0; y < cel.pixels.height; y++)
      for (let x = 0; x < cel.pixels.width; x++) {
        const dx = cel.x + x - left,
          dy = cel.y + y - top;
        if (dx < 0 || dy < 0 || dx >= width || dy >= height) continue;
        const at = dy * width + dx,
          source = y * cel.pixels.width + x;
        pixels.data.set(cel.pixels.data.subarray(source * 4, source * 4 + 4), at * 4);
        if (raw && cel.asepriteSamples)
          raw.set(
            cel.asepriteSamples.data.subarray(source * stride, source * stride + stride),
            at * stride,
          );
      }
    if (!transform.copy)
      for (let y = 0; y < this.mask.height; y++)
        for (let x = 0; x < this.mask.width; x++) {
          const dx = this.mask.x + x - left,
            dy = this.mask.y + y - top;
          if (
            !this.mask.data[y * this.mask.width + x] ||
            dx < 0 ||
            dy < 0 ||
            dx >= width ||
            dy >= height
          )
            continue;
          const at = dy * width + dx;
          pixels.data.set(clear, at * 4);
          if (raw) {
            raw[at * stride] = depth === 8 ? clearIndex : clear[0];
            if (depth === 16) raw[at * stride + 1] = clear[3];
          }
        }
    for (let y = 0; y < moved.height; y++)
      for (let x = 0; x < moved.width; x++) {
        if (!mask.data[y * moved.width + x]) continue;
        const color = samplePixel(moved, { x, y });
        if (
          depth === 8 && movedSamples
            ? movedSamples.data[y * moved.width + x] === (timeline.transparentIndex ?? 0) &&
              !background
            : !color[3]
        )
          continue;
        const dx = mask.x + x - left,
          dy = mask.y + y - top;
        if (dx < 0 || dy < 0 || dx >= width || dy >= height) continue;
        const at = dy * width + dx;
        pixels.data.set(
          depth === 8 && movedSamples
            ? color
            : normalBlend(samplePixel(pixels, { x: dx, y: dy }), color, UINT8_MAX),
          at * 4,
        );
        if (raw && movedSamples) {
          const source = (y * moved.width + x) * stride;
          raw.set(movedSamples.data.subarray(source, source + stride), at * stride);
        }
      }
    const encoded =
      raw && (depth === 8 || depth === 16)
        ? encodeAsepriteSamples(
            pixels,
            depth,
            paletteForColors(palette),
            background ? -1 : (timeline.transparentIndex ?? 0),
            { width, height, depth, data: raw },
          )
        : undefined;
    const data = encoded
      ? expandAsepriteSamples(
          encoded,
          paletteForColors(palette),
          background ? -1 : (timeline.transparentIndex ?? 0),
        )
      : pixels.data;
    let minX = width,
      minY = height,
      maxX = -1,
      maxY = -1;
    for (let y = 0; y < height; y++)
      for (let x = 0; x < width; x++) {
        const at = y * width + x;
        if (
          background ||
          (encoded?.depth === 8
            ? encoded.data[at] !== (timeline.transparentIndex ?? 0)
            : data[at * 4 + 3])
        ) {
          minX = Math.min(minX, x);
          minY = Math.min(minY, y);
          maxX = Math.max(maxX, x);
          maxY = Math.max(maxY, y);
        }
      }
    if (maxX < 0) return null;
    const croppedWidth = maxX - minX + 1,
      croppedHeight = maxY - minY + 1;
    const bytes = new Uint8ClampedArray(croppedWidth * croppedHeight * 4);
    const rawBytes = encoded ? new Uint8Array(croppedWidth * croppedHeight * stride) : undefined;
    for (let y = 0; y < croppedHeight; y++) {
      const at = (y + minY) * width + minX;
      bytes.set(data.subarray(at * 4, (at + croppedWidth) * 4), y * croppedWidth * 4);
      if (rawBytes && encoded)
        rawBytes.set(
          encoded.data.subarray(at * stride, (at + croppedWidth) * stride),
          y * croppedWidth * stride,
        );
    }
    return {
      ...cel,
      x: left + minX,
      y: top + minY,
      pixels: { width: croppedWidth, height: croppedHeight, data: bytes },
      asepriteSamples:
        rawBytes && encoded
          ? { depth: encoded.depth, width: croppedWidth, height: croppedHeight, data: rawBytes }
          : undefined,
    };
  }
}
