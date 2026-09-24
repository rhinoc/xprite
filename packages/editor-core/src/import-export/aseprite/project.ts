import { UINT8_MAX } from "$/base/numeric-constants";
import type { PixelBuffer, Rgba } from "$/base/primitives";
import { assertSupportedColorProfile } from "$/color/icc-profile";
import { encodeAsepriteSamples, type AsepriteImageSamples } from "$/color/samples";
import { activateTimelineCel, syncTimeline } from "$/document/document";
import { assertDimension, assertPixelCount } from "$/document/pixel-validation";
import type { EditorDocument } from "$/document/types";
import {
  parseAnimationLoopMetadata,
  withAnimationLoopMetadata,
} from "$/import-export/aseprite/animation-loop-properties";
import {
  AsepriteCelType,
  AsepriteLayerType,
  type AsepriteSprite,
  type AsepriteCel,
  type AsepriteLayer,
  type AsepriteUserData,
} from "$/import-export/aseprite/model";
import { parseSliceChunks, serializeSliceChunks } from "$/sprite/slice-metadata";
import { rasterizeTilemap, refreshTilemapProjections, type TilemapImage } from "$/tilemap/model";
import { assertLayerHierarchy } from "$/timeline/layer-operations";
import { ensureLayerUuids, layerUuidsEnabled } from "$/timeline/layer-uuid";
import { compositeTimeline } from "$/timeline/operations/composite-timeline";
import { timelineTags } from "$/timeline/operations/timeline-range";
import {
  layerAncestors,
  assertSupportedAnimationTags,
  assertSupportedBackgroundStack,
  type SpriteTimeline,
  type TimelineCel,
  type TimelineLayer,
} from "$/timeline/timeline";

export interface AsepriteEditorProject {
  image: PixelBuffer;
  timeline: SpriteTimeline;
  palette?: readonly Rgba[];
}

function copyUserData(data: AsepriteUserData | undefined): AsepriteUserData | undefined {
  return data
    ? {
        ...data,
        color: data.color ? ([...data.color] as [number, number, number, number]) : undefined,
        properties: data.properties?.slice(),
      }
    : undefined;
}
/** Convert only after codec preflight succeeds. Unsupported rendering semantics
 * fail before installing a partial/flattened document. */
export function projectFromAseprite(sprite: AsepriteSprite): AsepriteEditorProject {
  assertDimension(sprite.width, "width");
  assertDimension(sprite.height, "height");
  assertPixelCount(sprite.width, sprite.height);
  if (![8, 16, 32].includes(sprite.depth)) throw new Error("Unsupported Aseprite pixel depth");
  assertSupportedColorProfile(sprite.colorProfile, sprite.depth);

  for (const layer of sprite.layers)
    if (
      (layer.type !== AsepriteLayerType.Image &&
        layer.type !== AsepriteLayerType.Group &&
        layer.type !== AsepriteLayerType.Tilemap) ||
      layer.blendMode < 0 ||
      layer.blendMode > 18
    )
      throw new Error(
        `Layer “${layer.name}” uses an unsupported ${layer.type !== AsepriteLayerType.Image ? layer.type : layer.reference ? "reference" : "blend"} feature. The existing document has not been replaced.`,
      );
  const importedLayers = sprite.layers.map((layer, index) => ({
    id: `ase-layer-${index}`,
    userData: copyUserData(layer.userData),
    name: layer.name,
    visible: layer.visible,
    locked: layer.locked,
    opacity:
      sprite.flags & 1 &&
      !(layer.flags & 8) &&
      (layer.type !== AsepriteLayerType.Group || !!(sprite.flags & 2))
        ? layer.opacity
        : UINT8_MAX,
    flags: layer.flags,
    source: layer,
    kind: (layer.type === AsepriteLayerType.Group
      ? "group"
      : layer.type === AsepriteLayerType.Tilemap
        ? "tilemap"
        : "image") as TimelineLayer["kind"],
    tilesetId: layer.tilesetIndex,
    parentId: layer.parentIndex === undefined ? null : `ase-layer-${layer.parentIndex}`,
    blendMode:
      layer.flags & 8 || (layer.type === AsepriteLayerType.Group && !(sprite.flags & 2))
        ? 0
        : layer.blendMode,
  }));
  assertSupportedBackgroundStack(importedLayers);
  assertSupportedAnimationTags(sprite.tags, sprite.frames.length);
  const images = new Map<Uint8Array, PixelBuffer>(),
    resolving = new Set<AsepriteCel>(),
    sampleImageCopies = new Map<Uint8Array, AsepriteImageSamples>(),
    palettes = new Map<object, readonly Rgba[]>();
  const framePalette = (frame: number) => {
    const p = sprite.frames[frame].palette ?? sprite.palette;
    if (!p) return undefined;
    let colors = palettes.get(p);
    if (!colors) {
      colors = p.entries.map((e) => [e.red, e.green, e.blue, e.alpha] as Rgba);
      palettes.set(p, colors);
    }
    return colors;
  };
  const tilemaps = new Map<Uint32Array, TilemapImage>(),
    resolvingMaps = new Set<AsepriteCel>();
  const tilemapFor = (cel: AsepriteCel): TilemapImage | undefined => {
    if (cel.tilemap) {
      let map = tilemaps.get(cel.tilemap.tiles);
      if (!map) {
        map = { ...cel.tilemap, tiles: cel.tilemap.tiles.slice() };
        tilemaps.set(cel.tilemap.tiles, map);
      }
      return map;
    }
    if (
      cel.type === AsepriteCelType.Linked &&
      sprite.layers[cel.layerIndex].type === AsepriteLayerType.Tilemap
    ) {
      if (resolvingMaps.has(cel)) throw new Error("Cyclic tilemap link");
      resolvingMaps.add(cel);
      const target = sprite.frames[cel.linkedFrame ?? -1]?.cels.find(
        (c) => c.layerIndex === cel.layerIndex,
      );
      if (!target || target === cel) throw new Error("Invalid tilemap link");
      const map = tilemapFor(target);
      resolvingMaps.delete(cel);
      return map;
    }
    return undefined;
  };
  const pixelsFor = (cel: AsepriteCel, frame: number): PixelBuffer => {
    const map = tilemapFor(cel);
    if (map) {
      const set = sprite.tilesets?.find((s) => s.id === sprite.layers[cel.layerIndex].tilesetIndex);
      if (!set) throw new Error("Missing Tileset");
      return rasterizeTilemap(
        map,
        set,
        sprite.depth as 8 | 16 | 32,
        framePalette(frame),
        sprite.header.transparentIndex,
      );
    }
    const existing = cel.pixels && images.get(cel.pixels);
    if (existing) return existing;
    if (resolving.has(cel)) throw new Error("Invalid cyclic linked cel");
    resolving.add(cel);
    let pixels: PixelBuffer;
    if (cel.type === AsepriteCelType.Linked && !cel.pixels) {
      const target = sprite.frames[cel.linkedFrame ?? -1]?.cels.find(
        (item) => item.layerIndex === cel.layerIndex,
      );
      if (!target) throw new Error("Invalid linked cel target");
      pixels = pixelsFor(target, cel.linkedFrame!);
    } else {
      if (
        !cel.pixels ||
        cel.width < 1 ||
        cel.height < 1 ||
        cel.pixels.length !== cel.width * cel.height * 4
      )
        throw new Error("Invalid image cel");
      pixels = { width: cel.width, height: cel.height, data: new Uint8ClampedArray(cel.pixels) };
    }
    resolving.delete(cel);
    if (cel.pixels) images.set(cel.pixels, pixels);
    return pixels;
  };
  const loopCount = parseAnimationLoopMetadata(sprite);
  const timeline: SpriteTimeline = {
    ...(loopCount === undefined ? {} : { loopCount }),
    slices: parseSliceChunks(sprite.chunks),
    tilesets: sprite.tilesets?.map((s) => ({
      ...s,
      pixels: s.pixels.slice(),
      asepritePixels: s.asepritePixels?.slice(),
      userData: copyUserData(s.userData),
      tileUserData: s.tileUserData?.map((data) => copyUserData(data) ?? {}),
    })),
    gridBounds: {
      x: sprite.header.gridX,
      y: sprite.header.gridY,
      width: sprite.header.gridWidth || 16,
      height: sprite.header.gridHeight || 16,
    },
    colorDepth: sprite.depth as 8 | 16 | 32,
    transparentIndex: sprite.header.transparentIndex,
    pixelRatio: [sprite.header.pixelWidth || 1, sprite.header.pixelHeight || 1],
    useLayerUuids: !!(sprite.flags & 4),
    userData: copyUserData(sprite.userData),
    colorProfile: sprite.colorProfile
      ? {
          ...sprite.colorProfile,
          ...(sprite.colorProfile.type === "icc" ? { data: sprite.colorProfile.data.slice() } : {}),
        }
      : undefined,
    composeGroups: false,
    asepriteSource: sprite,
    activeFrame: 0,
    activeLayer: 0,
    layers: importedLayers,
    frames: sprite.frames.map((frame, index) => {
      const cels: (TimelineCel | null)[] = sprite.layers.map(() => null);
      for (const cel of frame.cels) {
        if (cel.layerIndex >= cels.length || cels[cel.layerIndex])
          throw new Error("Invalid duplicate/layer cel");
        let asepriteSamples: AsepriteImageSamples | undefined;
        if (sprite.depth !== 32 && !tilemapFor(cel)) {
          if (!cel.asepritePixels)
            throw new Error("Missing original asepriteSamples image samples");
          asepriteSamples = sampleImageCopies.get(cel.asepritePixels);
          if (!asepriteSamples) {
            asepriteSamples = {
              depth: sprite.depth as 8 | 16,
              width: cel.width,
              height: cel.height,
              data: cel.asepritePixels.slice(),
            };
            sampleImageCopies.set(cel.asepritePixels, asepriteSamples);
          }
        }
        cels[cel.layerIndex] = {
          tilemap: tilemapFor(cel),
          pixels: pixelsFor(cel, index),
          asepriteSamples,
          x: cel.x,
          y: cel.y,
          opacity: cel.opacity,
          zIndex: cel.zIndex,
          source: cel,
          userData: copyUserData(cel.userData),
          preciseBounds: cel.preciseBounds,
        };
      }
      return { duration: frame.duration, cels, source: frame, palette: framePalette(index) };
    }),
  };
  assertLayerHierarchy(timeline);
  const doc: EditorDocument = {
    name: "Imported sprite",
    width: sprite.width,
    height: sprite.height,
    layer: {
      name: "",
      visible: true,
      locked: false,
      x: 0,
      y: 0,
      pixels: { width: 1, height: 1, data: new Uint8ClampedArray(4) },
    },
    selection: null,
    timeline: refreshTilemapProjections(timeline),
  };
  activateTimelineCel(doc, 0, timeline.activeLayer);
  return { timeline: doc.timeline!, image: compositeTimeline(doc), palette: framePalette(0) };
}
/** Encode the current graph, preserving metadata rather than reverting to the
 * original decoded cels. Linked image identities become Aseprite linked cels. */
export function asepriteFromProject(
  project: AsepriteEditorProject,
  options: { preserveGroupMetadata?: boolean } = {},
): AsepriteSprite {
  const t = ensureLayerUuids(project.timeline),
    original = t.asepriteSource,
    depth = t.colorDepth ?? 32;
  assertLayerHierarchy(t);
  const composeGroups = options.preserveGroupMetadata || t.composeGroups === true;
  const useLayerUuids = layerUuidsEnabled(t);
  const layers: AsepriteLayer[] = t.layers.map((layer, index) => ({
    ...layer.source,
    index,
    userData:
      layer.userData === null ? undefined : copyUserData(layer.userData ?? layer.source?.userData),
    type:
      layer.kind === "group"
        ? AsepriteLayerType.Group
        : layer.kind === "tilemap"
          ? AsepriteLayerType.Tilemap
          : AsepriteLayerType.Image,
    tilesetIndex: layer.tilesetId,
    uuid: useLayerUuids ? layer.source?.uuid : undefined,
    flags: (layer.flags & ~3) | (layer.visible ? 1 : 0) | (layer.locked ? 0 : 2),
    visible: layer.visible,
    editable: !layer.locked,
    locked: layer.locked,
    background: !!(layer.flags & 8),
    collapsed: !!(layer.flags & 32),
    reference: !!(layer.flags & 64),
    continuous: !!(layer.flags & 16),
    name: layer.name,
    childLevel: layerAncestors(t, index).length,
    parentIndex: layer.parentId ? t.layers.findIndex((l) => l.id === layer.parentId) : undefined,
    blendMode: layer.kind === "group" && !composeGroups ? 0 : (layer.blendMode ?? 0),
    opacity: layer.kind === "group" && !composeGroups ? 0 : layer.opacity,
    defaultWidth: 0,
    defaultHeight: 0,
  }));
  const seen = t.layers.map(
    () => new Map<PixelBuffer | AsepriteImageSamples | TilemapImage, number>(),
  );
  const framePalettes = t.frames.map((frame) => ({
    frameIndex: frame.source?.palette?.frameIndex,
    entries: (frame.palette ?? project.palette ?? []).map(([red, green, blue, alpha], i) => ({
      ...frame.source?.palette?.entries[i],
      red,
      green,
      blue,
      alpha,
    })),
  }));
  const frames = t.frames.map((frame, index) => ({
    ...frame.source,
    index,
    duration: frame.duration,
    palette: framePalettes[index].entries.length ? framePalettes[index] : undefined,
    cels: frame.cels.flatMap((cel, layerIndex): AsepriteCel[] => {
      if (!cel || t.layers[layerIndex].kind === "group") return [];
      if (cel.tilemap) {
        const linkedFrame = seen[layerIndex].get(cel.tilemap);
        seen[layerIndex].set(cel.tilemap, linkedFrame ?? index);
        return [
          {
            ...cel.source,
            layerIndex,
            x: cel.x,
            y: cel.y,
            opacity: cel.opacity,
            zIndex: cel.zIndex,
            userData:
              cel.userData === null
                ? undefined
                : copyUserData(cel.userData ?? cel.source?.userData),
            width: cel.tilemap.width,
            height: cel.tilemap.height,
            pixels: undefined,
            asepritePixels: undefined,
            ...(linkedFrame === undefined
              ? {
                  type: AsepriteCelType.Tilemap,
                  rawType: 3,
                  tilemap: { ...cel.tilemap, tiles: cel.tilemap.tiles.slice() },
                }
              : { type: AsepriteCelType.Linked, rawType: 1, linkedFrame, tilemap: undefined }),
          },
        ];
      }
      const asepriteSamples =
        depth === 32
          ? undefined
          : encodeAsepriteSamples(
              cel.pixels,
              depth,
              framePalettes[index],
              t.layers[layerIndex].flags & 8 ? -1 : (t.transparentIndex ?? 0),
              cel.asepriteSamples,
            );
      const identity = asepriteSamples ?? cel.pixels,
        linkedFrame = seen[layerIndex].get(identity);
      seen[layerIndex].set(identity, linkedFrame ?? index);
      return [
        {
          ...cel.source,
          asepritePixels: asepriteSamples?.data,
          preciseBounds: cel.preciseBounds,
          layerIndex,
          x: cel.x,
          y: cel.y,
          opacity: cel.opacity,
          zIndex: cel.zIndex,
          userData:
            cel.userData === null ? undefined : copyUserData(cel.userData ?? cel.source?.userData),
          width: cel.pixels.width,
          height: cel.pixels.height,
          ...(linkedFrame === undefined
            ? {
                type: AsepriteCelType.Raw,
                rawType: 0,
                pixels: new Uint8Array(cel.pixels.data),
              }
            : { type: AsepriteCelType.Linked, rawType: 1, linkedFrame, pixels: undefined }),
        },
      ];
    }),
  }));
  const loopMetadata = withAnimationLoopMetadata(
    original?.externalFiles,
    t.userData === null ? undefined : copyUserData(t.userData ?? original?.userData),
    t.loopCount,
  );
  return {
    ...original,
    externalFiles: loopMetadata.externalFiles,
    width: project.image.width,
    height: project.image.height,
    depth,
    flags:
      (((original?.flags ?? 0) | 1) & ~2 & ~4) | (composeGroups ? 2 : 0) | (useLayerUuids ? 4 : 0),
    layers,
    frames,
    tilesets: t.tilesets?.map((s) => ({
      ...s,
      pixels: s.pixels.slice(),
      asepritePixels: s.asepritePixels?.slice(),
      userData: copyUserData(s.userData),
      tileUserData: s.tileUserData?.map((data) => copyUserData(data) ?? {}),
    })),
    palette: framePalettes[0]?.entries.length
      ? framePalettes[0]
      : project.palette
        ? {
            entries: project.palette.map(([red, green, blue, alpha], index) => ({
              red,
              green,
              blue,
              alpha,
              ...(original?.palette?.entries[index]?.name !== undefined
                ? { name: original.palette.entries[index].name }
                : {}),
            })),
          }
        : original?.palette,
    userData: loopMetadata.userData,
    colorProfile: t.colorProfile === null ? undefined : (t.colorProfile ?? original?.colorProfile),
    tags: [...timelineTags(t)],
    chunks: [
      ...(original?.chunks ?? []).filter((c) => c.type !== 0x2022 && c.type !== 0x2020),
      ...serializeSliceChunks(t.slices ?? parseSliceChunks(original?.chunks ?? [])),
    ],
    format: original?.format ?? "aseprite",
    header: {
      ...(original?.header ?? {
        fileSize: 0,
        magic: 0xa5e0,
        speed: 100,
        next: 0,
        frit: 0,
        transparentIndex: 0,
        ncolors: 256,
        pixelWidth: 1,
        pixelHeight: 1,
        gridX: 0,
        gridY: 0,
        gridWidth: 16,
        gridHeight: 16,
        ignore: [0, 0, 0] as const,
      }),
      transparentIndex: t.transparentIndex ?? original?.header.transparentIndex ?? 0,
      ...(t.pixelRatio ? { pixelWidth: t.pixelRatio[0], pixelHeight: t.pixelRatio[1] } : {}),
      ...(t.gridBounds
        ? {
            gridX: t.gridBounds.x,
            gridY: t.gridBounds.y,
            gridWidth: t.gridBounds.width,
            gridHeight: t.gridBounds.height,
          }
        : {}),
    },
  };
}
export function projectFromDocument(doc: EditorDocument): AsepriteEditorProject {
  syncTimeline(doc);
  const image = compositeTimeline(doc);
  return { image, timeline: doc.timeline!, palette: doc.palette };
}
