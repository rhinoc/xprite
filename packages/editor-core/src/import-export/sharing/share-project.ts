import {
  AsepriteCelType,
  AsepriteLayerType,
  EDITOR_ASEPRITE_LIMITS,
  asepriteFromProject,
  encodeAsepriteSync,
  type AsepriteSprite,
} from "$/import-export/aseprite";
import { asepriteCelDecodedBytes } from "$/import-export/aseprite/cel-memory";
import { asepriteFileName } from "$/import-export/file-names";
import { sharedAsepriteCandidates } from "$/import-export/sharing/aseprite-packing";
import {
  FULL_PROJECT_SHARE,
  scopeSharedAseprite,
  type ShareReductionOptions,
} from "$/import-export/sharing/share-scope";

const MAX_SHARE_NAME_CHARACTERS = 64;
const RGBA_BYTES = 4;
const PIXEL_LIMIT_MESSAGE =
  "This shared project is too large. Reduce shared frames or layers, or export a file.";

export interface ShareProjectSource {
  name: string;
  sprite: AsepriteSprite;
  currentFrame: number;
  composeGroups: boolean;
  reductions?: ShareReductionOptions;
}

/** Borrow committed project pixels; sharing never changes the source document. */
export function shareProjectFromProject(
  project: Parameters<typeof asepriteFromProject>[0],
  name: string,
  currentFrame: number,
  composeGroups: boolean,
): ShareProjectSource {
  const fileName = asepriteFileName(name);
  const extension = fileName.slice(fileName.lastIndexOf("."));
  return {
    name:
      Array.from(fileName.slice(0, -extension.length))
        .slice(0, MAX_SHARE_NAME_CHARACTERS - extension.length)
        .join("") + extension,
    currentFrame,
    composeGroups,
    sprite: asepriteFromProject(project, {
      preserveGroupMetadata: true,
      borrowImageData: true,
    }),
  };
}

/** Estimate the receiver's decoded cel/tileset working set without reading pixels.
 * Lazy encoded cels and tilemaps remain encoded until the worker processes them. */
function assertSharePixelBudget(sprite: AsepriteSprite, maxProjectBytes: number): void {
  let bytes =
    sprite.tilesets?.reduce(
      (total, set) => total + set.pixels.byteLength + (set.asepritePixels?.byteLength ?? 0),
      0,
    ) ?? 0;
  for (const frame of sprite.frames) {
    for (const cel of frame.cels) {
      if (cel.type === AsepriteCelType.Linked) continue;
      const layer = sprite.layers[cel.layerIndex];
      const tileset =
        layer.type === AsepriteLayerType.Tilemap
          ? sprite.tilesets?.find((set) => set.id === layer.tilesetIndex)
          : undefined;
      bytes += tileset
        ? cel.width * cel.height * tileset.tileWidth * tileset.tileHeight * RGBA_BYTES
        : asepriteCelDecodedBytes(cel.width, cel.height, sprite.depth);
      if (bytes > maxProjectBytes) throw new Error(PIXEL_LIMIT_MESSAGE);
    }
  }
  if (bytes > maxProjectBytes) throw new Error(PIXEL_LIMIT_MESSAGE);
}

/** Select inexpensive subsets before a worker message clones pixel buffers.
 * Flattening and pixel normalization stay deferred; selecting a small part of
 * a large document must not require copying or decoding the original first. */
export function prepareShareProjectSource(
  source: ShareProjectSource,
  reductions: ShareReductionOptions,
  maxProjectBytes: number,
): ShareProjectSource {
  const sprite = scopeSharedAseprite(
    source.sprite,
    source.currentFrame,
    {
      ...FULL_PROJECT_SHARE,
      currentFrame: reductions.currentFrame,
      visibleLayers: reductions.visibleLayers || reductions.flattenVisibleLayers,
    },
    maxProjectBytes,
    source.composeGroups,
  );
  assertSharePixelBudget(sprite, maxProjectBytes);
  return {
    ...source,
    sprite,
    currentFrame: reductions.currentFrame ? 0 : source.currentFrame,
    reductions: { ...reductions, currentFrame: false, visibleLayers: false },
  };
}

/** Scope and encode in the background runtime. Each reversible representation
 * is yielded separately so compression need only retain the current winner. */
export function sharedProjectCandidates(
  source: ShareProjectSource,
  maxProjectBytes: number,
): { frameCount: number; layerCount: number; candidates: Generator<Uint8Array> } {
  const sprite = scopeSharedAseprite(
    source.sprite,
    source.currentFrame,
    source.reductions ?? FULL_PROJECT_SHARE,
    maxProjectBytes,
    source.composeGroups,
  );
  const bytes = encodeAsepriteSync(sprite, {
    limits: {
      ...EDITOR_ASEPRITE_LIMITS,
      maxFileBytes: maxProjectBytes,
      maxDecodedBytes: maxProjectBytes,
      maxExpandedBytes: maxProjectBytes,
    },
  });
  return {
    frameCount: sprite.frames.length,
    layerCount: sprite.layers.length,
    candidates: sharedAsepriteCandidates(bytes, source.name),
  };
}
