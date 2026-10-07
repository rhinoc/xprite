import { inflateZlibExact } from "$/base/zlib";
import {
  AsepriteCelType,
  type AsepriteCel,
  type AsepriteSprite,
} from "$/import-export/aseprite/model";
import { asepriteFromProject, projectFromAseprite } from "$/import-export/aseprite/project";
import { parseSliceChunks, serializeSliceChunks } from "$/sprite";
import { flattenLayers, type SpriteTimeline, type TimelineFrame } from "$/timeline";

export enum ShareReduction {
  CurrentFrame = "currentFrame",
  VisibleLayers = "visibleLayers",
  FlattenVisibleLayers = "flattenVisibleLayers",
  CleanTransparentRgb = "cleanTransparentRgb",
}

export type ShareReductionOptions = Readonly<Record<ShareReduction, boolean>>;

export const FULL_PROJECT_SHARE: ShareReductionOptions = {
  currentFrame: false,
  visibleLayers: false,
  flattenVisibleLayers: false,
  cleanTransparentRgb: false,
};

const RGBA_BYTES = 4;
const ALPHA_OFFSET = 3;
const RGB_DEPTH = 32;
const SLICE_CHUNK = 0x2022;
const USER_DATA_CHUNK = 0x2020;
const TOO_LARGE = "This shared project is too large. Export a file instead.";

function hasHiddenRgb(pixels: Uint8Array): boolean {
  for (let at = 0; at < pixels.length; at += RGBA_BYTES)
    if (!pixels[at + ALPHA_OFFSET] && (pixels[at] || pixels[at + 1] || pixels[at + 2])) return true;
  return false;
}

export function shareReductionAvailability(sprite: AsepriteSprite): ShareReductionOptions {
  return {
    currentFrame: sprite.frames.length > 1,
    visibleLayers: sprite.layers.some((layer) => !layer.visible),
    flattenVisibleLayers:
      sprite.layers.length > 1 || sprite.layers.some((layer) => layer.reference),
    cleanTransparentRgb:
      sprite.depth === RGB_DEPTH &&
      (sprite.frames.some((frame) =>
        frame.cels.some(
          (cel) => cel.encodedPixels?.hasHiddenRgb || (cel.pixels && hasHiddenRgb(cel.pixels)),
        ),
      ) ||
        !!sprite.tilesets?.some((tileset) => hasHiddenRgb(tileset.pixels))),
  };
}

/** Only shared copies are normalized. Hidden RGB can matter to later alpha edits,
 * so this transform is explicitly selected rather than applied by the codec. */
function cleanTransparentRgb(sprite: AsepriteSprite): AsepriteSprite {
  if (sprite.depth !== RGB_DEPTH) return sprite;
  const cleaned = new Map<Uint8Array, Uint8Array>();
  const clean = (pixels: Uint8Array): Uint8Array => {
    const previous = cleaned.get(pixels);
    if (previous) return previous;
    if (!hasHiddenRgb(pixels)) return pixels;
    const result = pixels.slice();
    for (let at = 0; at < result.length; at += RGBA_BYTES)
      if (!result[at + ALPHA_OFFSET]) result[at] = result[at + 1] = result[at + 2] = 0;
    cleaned.set(pixels, result);
    return result;
  };
  return {
    ...sprite,
    frames: sprite.frames.map((frame) => ({
      ...frame,
      cels: frame.cels.map((cel) => {
        if (cel.encodedPixels?.hasHiddenRgb)
          return {
            ...cel,
            encodedPixels: undefined,
            pixels: clean(inflateZlibExact(cel.encodedPixels.bytes, cel.encodedPixels.byteLength)),
          };
        return { ...cel, pixels: cel.pixels ? clean(cel.pixels) : undefined };
      }),
    })),
    tilesets: sprite.tilesets?.map((tileset) => ({ ...tileset, pixels: clean(tileset.pixels) })),
  };
}

function visibleLayers(sprite: AsepriteSprite, composeGroups: boolean): AsepriteSprite {
  const visible = (index: number): boolean => {
    const layer = sprite.layers[index];
    return layer.visible && (layer.parentIndex === undefined || visible(layer.parentIndex));
  };
  const indices = sprite.layers.flatMap((_, index) => (visible(index) ? [index] : []));
  if (!indices.length) throw new Error("No visible layers to share.");
  const remap = new Map(indices.map((index, next) => [index, next]));
  const order = (index: number, retained: readonly number[]) =>
    composeGroups
      ? retained.filter(
          (candidate) =>
            candidate < index &&
            sprite.layers[candidate].parentIndex === sprite.layers[index].parentIndex,
        ).length
      : retained.indexOf(index);
  const originalOrder = sprite.layers.map((_, index) => index);
  return {
    ...sprite,
    layers: indices.map((index, next) => ({
      ...sprite.layers[index],
      index: next,
      parentIndex:
        sprite.layers[index].parentIndex === undefined
          ? undefined
          : remap.get(sprite.layers[index].parentIndex!),
    })),
    frames: sprite.frames.map((frame) => ({
      ...frame,
      cels: frame.cels.flatMap((cel) =>
        remap.has(cel.layerIndex)
          ? [
              {
                ...cel,
                layerIndex: remap.get(cel.layerIndex)!,
                // Removing hidden rows must not change the relative paint order
                // of visible cels that use Aseprite's per-frame z-index offsets.
                zIndex: frame.cels.some((entry) => entry.zIndex !== 0)
                  ? cel.zIndex +
                    order(cel.layerIndex, originalOrder) -
                    order(cel.layerIndex, indices)
                  : cel.zIndex,
              },
            ]
          : [],
      ),
    })),
  };
}

function currentFrameOnly(sprite: AsepriteSprite, currentFrame: number): AsepriteSprite {
  const frame = sprite.frames[currentFrame];
  if (!frame) throw new RangeError("Invalid share frame.");
  const resolve = (cel: AsepriteCel, seen = new Set<AsepriteCel>()): AsepriteCel => {
    if (cel.type !== AsepriteCelType.Linked) return cel;
    if (seen.has(cel)) throw new Error("Cyclic cel link");
    seen.add(cel);
    const linked = sprite.frames[cel.linkedFrame ?? -1]?.cels.find(
      (entry) => entry.layerIndex === cel.layerIndex,
    );
    if (!linked) throw new Error("Invalid cel link");
    return resolve(linked, seen);
  };
  const palette = frame.palette ?? sprite.palette;
  const slices = parseSliceChunks(sprite.chunks).flatMap((slice) => {
    const key = [...slice.keys].reverse().find((entry) => entry.frame <= currentFrame);
    return key ? [{ ...slice, keys: [{ ...key, frame: 0 }] }] : [];
  });
  return {
    ...sprite,
    palette,
    frames: [
      {
        ...frame,
        index: 0,
        palette: palette ? { ...palette, frameIndex: 0 } : undefined,
        chunks: frame.chunks?.map((chunk) => ({ ...chunk, frameIndex: 0 })),
        cels: frame.cels.map((cel) => {
          if (cel.type !== AsepriteCelType.Linked) return cel;
          const target = resolve(cel);
          return {
            ...cel,
            type: target.type,
            rawType: target.rawType,
            linkedFrame: undefined,
            width: target.width,
            height: target.height,
            pixels: target.pixels,
            encodedPixels: target.encodedPixels,
            asepritePixels: target.asepritePixels,
            tilemap: target.tilemap,
          };
        }),
      },
    ],
    tags: sprite.tags
      .filter((tag) => tag.from <= currentFrame && tag.to >= currentFrame)
      .map((tag) => ({ ...tag, from: 0, to: 0 })),
    chunks: [
      ...sprite.chunks
        .filter(
          (chunk) =>
            chunk.type !== SLICE_CHUNK &&
            chunk.type !== USER_DATA_CHUNK &&
            (chunk.frameIndex === undefined || chunk.frameIndex === currentFrame),
        )
        .map((chunk) => ({ ...chunk, frameIndex: chunk.frameIndex === undefined ? undefined : 0 })),
      ...serializeSliceChunks(slices),
    ],
  };
}

/** Preserve the original model when no scope reduction is selected. Selected
 * frames materialize linked cels, and selected layers rebuild their references. */
export function scopeSharedAseprite(
  sprite: AsepriteSprite,
  currentFrame: number,
  options: ShareReductionOptions,
  maxProjectBytes: number,
  composeGroups = false,
): AsepriteSprite {
  let result = options.currentFrame ? currentFrameOnly(sprite, currentFrame) : sprite;
  if (options.visibleLayers || options.flattenVisibleLayers)
    result = visibleLayers(result, composeGroups);
  if (options.flattenVisibleLayers) {
    // Render one frame at a time; retain only cropped cels and stop before the
    // accumulated output exceeds the receiver's decoded-pixel budget.
    if (sprite.width * sprite.height * RGBA_BYTES > maxProjectBytes) throw new Error(TOO_LARGE);
    const project = projectFromAseprite(result);
    const timeline = { ...project.timeline, composeGroups };
    let bytes = 0;
    let flattened: SpriteTimeline | undefined;
    const frames: TimelineFrame[] = [];
    for (const frame of timeline.frames) {
      const single = flattenLayers(
        { ...timeline, frames: [frame], activeFrame: 0 },
        sprite.width,
        sprite.height,
        true,
      );
      const output = single.frames[0];
      bytes += output.cels.reduce((sum, cel) => sum + (cel?.pixels.data.byteLength ?? 0), 0);
      if (bytes > maxProjectBytes) throw new Error(TOO_LARGE);
      flattened ??= single;
      frames.push(output);
    }
    result = asepriteFromProject(
      {
        ...project,
        timeline: {
          ...timeline,
          layers: flattened!.layers,
          frames,
          activeLayer: 0,
          colorDepth: RGB_DEPTH,
          tilesets: [],
        },
      },
      { preserveGroupMetadata: true, borrowImageData: true },
    );
  }
  if (options.visibleLayers && !options.flattenVisibleLayers) {
    const tilesetIds = new Set(result.layers.map((layer) => layer.tilesetIndex));
    result = {
      ...result,
      tilesets: result.tilesets?.filter((tileset) => tilesetIds.has(tileset.id)),
    };
  }
  return options.cleanTransparentRgb ? cleanTransparentRgb(result) : result;
}
