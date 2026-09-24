import { UINT8_MAX } from "$/base/numeric-constants";
import {
  assertSupportedColorProfile,
  colorProfilesEquivalent,
  convertPixelsBetweenProfiles,
  workingColorProfile,
} from "$/color/icc-profile";
import { encodeAsepriteSamples, expandAsepriteSamples, paletteForColors } from "$/color/samples";
import type { EditorDocument } from "$/document/types";
import type { AsepriteLayer } from "$/import-export/aseprite/model";
import { refreshTilemapProjections } from "$/tilemap/model";
import { createLayerUuid, layerUuidsEnabled } from "$/timeline/layer-uuid";
import type { SpriteTimeline } from "$/timeline/timeline";

export interface SpriteProperties {
  transparentIndex?: number;
  pixelRatio?: readonly [width: number, height: number];
  useLayerUuids?: boolean;
  userData?: import("$/import-export/aseprite/model").AsepriteUserData | null;
  colorProfile?: import("$/import-export/aseprite/model").AsepriteColorProfile | null;
  /** Reinterpret metadata only when false; convert pixel values when true. */
  convertColorProfile?: boolean;
}

function copyUserData(data: SpriteProperties["userData"]) {
  return data
    ? {
        ...data,
        color: data.color ? ([...data.color] as [number, number, number, number]) : undefined,
        properties: data.properties?.slice(),
      }
    : undefined;
}

function sameProfileMetadata(
  a: import("$/import-export/aseprite/model").AsepriteColorProfile | undefined,
  b: import("$/import-export/aseprite/model").AsepriteColorProfile | undefined,
) {
  if (a === b) return true;
  if (!a || !b || a.type !== b.type || a.gamma !== b.gamma) return false;
  if (a.type !== "icc" || b.type !== "icc") return true;
  return a.data.length === b.data.length && a.data.every((value, index) => value === b.data[index]);
}

/** Apply Sprite Properties while keeping indexed cel projections aligned with
 * the selected transparent palette slot. */
export function applySpriteProperties(
  doc: EditorDocument,
  timeline: SpriteTimeline,
  properties: SpriteProperties,
): SpriteTimeline {
  const transparentIndex =
    properties.transparentIndex === undefined
      ? timeline.transparentIndex
      : properties.transparentIndex;
  if (
    transparentIndex !== undefined &&
    (!Number.isInteger(transparentIndex) || transparentIndex < 0 || transparentIndex > UINT8_MAX)
  )
    throw new RangeError(`Transparent color must be a palette index from 0 to ${UINT8_MAX}.`);

  const baseRatio =
    timeline.pixelRatio ??
    ([
      timeline.asepriteSource?.header.pixelWidth || 1,
      timeline.asepriteSource?.header.pixelHeight || 1,
    ] as const);
  const pixelRatio = properties.pixelRatio ?? baseRatio;
  if (
    pixelRatio.length !== 2 ||
    pixelRatio.some((value) => !Number.isInteger(value) || value < 1 || value > UINT8_MAX)
  )
    throw new RangeError(`Pixel ratio components must be integers from 1 to ${UINT8_MAX}.`);

  const useLayerUuids = properties.useLayerUuids ?? layerUuidsEnabled(timeline);
  const layers =
    properties.useLayerUuids === undefined || useLayerUuids === layerUuidsEnabled(timeline)
      ? timeline.layers
      : timeline.layers.map((layer) => {
          const source: AsepriteLayer = {
            ...layer.source,
            uuid: useLayerUuids ? (layer.source?.uuid?.slice() ?? createLayerUuid()) : undefined,
          } as AsepriteLayer;
          return { ...layer, source };
        });

  const ratioChanged = pixelRatio[0] !== baseRatio[0] || pixelRatio[1] !== baseRatio[1];
  const maskChanged = transparentIndex !== timeline.transparentIndex;
  const userData =
    "userData" in properties
      ? properties.userData
        ? copyUserData(properties.userData)
        : null
      : timeline.userData;
  const userDataChanged =
    JSON.stringify(userData ?? null) !== JSON.stringify(timeline.userData ?? null);
  const sourceProfile = workingColorProfile(timeline);
  const targetProfile =
    "colorProfile" in properties ? (properties.colorProfile ?? undefined) : sourceProfile;
  const profileChanged =
    "colorProfile" in properties && !sameProfileMetadata(sourceProfile, targetProfile);
  const profileConvert =
    profileChanged &&
    properties.convertColorProfile === true &&
    !colorProfilesEquivalent(sourceProfile, targetProfile);
  if (profileChanged) assertSupportedColorProfile(targetProfile, timeline.colorDepth ?? 32);
  if (
    !maskChanged &&
    !ratioChanged &&
    layers === timeline.layers &&
    !userDataChanged &&
    !profileChanged
  )
    return timeline;

  let next: SpriteTimeline = {
    ...timeline,
    ...(transparentIndex === undefined ? {} : { transparentIndex }),
    pixelRatio: [...pixelRatio] as [number, number],
    useLayerUuids,
    layers,
    userData,
    ...(profileChanged ? { colorProfile: properties.colorProfile ?? null } : {}),
  };
  if (profileConvert) {
    const convertColors = (colors: readonly import("$/base/primitives").Rgba[] | undefined) =>
      colors?.map((color) => {
        const converted = convertPixelsBetweenProfiles(
          { width: 1, height: 1, data: new Uint8ClampedArray(color) },
          sourceProfile,
          targetProfile,
        ).data;
        return [
          converted[0],
          converted[1],
          converted[2],
          converted[3],
        ] as import("$/base/primitives").Rgba;
      });
    const convertedDocumentPalette = convertColors(doc.palette);
    doc.palette = convertedDocumentPalette;
    const depth = timeline.colorDepth ?? 32;
    next = {
      ...next,
      frames: timeline.frames.map((frame) => {
        const colors = frame.palette ? convertColors(frame.palette) : convertedDocumentPalette;
        const projectionsBySamples = new Map<object, Uint8ClampedArray>();
        return {
          ...frame,
          ...(frame.palette ? { palette: colors } : {}),
          cels: frame.cels.map((cel, layerIndex) => {
            if (!cel) return cel;
            if (depth === 8 && cel.asepriteSamples?.depth === 8) {
              let data = projectionsBySamples.get(cel.asepriteSamples);
              if (!data) {
                data = expandAsepriteSamples(
                  cel.asepriteSamples,
                  paletteForColors(colors),
                  timeline.layers[layerIndex].flags & 8 ? -1 : (transparentIndex ?? 0),
                );
                projectionsBySamples.set(cel.asepriteSamples, data);
              }
              return {
                ...cel,
                pixels: {
                  width: cel.asepriteSamples.width,
                  height: cel.asepriteSamples.height,
                  data,
                },
              };
            }
            const pixels = convertPixelsBetweenProfiles(cel.pixels, sourceProfile, targetProfile);
            return { ...cel, pixels, ...(depth === 16 ? { asepriteSamples: undefined } : {}) };
          }),
        };
      }),
      tilesets: timeline.tilesets?.map((set) => {
        const image = {
          width: set.tileWidth,
          height: set.tileHeight * set.tileCount,
          data: new Uint8ClampedArray(set.pixels),
        };
        const converted = convertPixelsBetweenProfiles(image, sourceProfile, targetProfile);
        const asepriteSamples =
          depth === 16
            ? encodeAsepriteSamples(
                converted,
                16,
                paletteForColors(convertedDocumentPalette),
                transparentIndex ?? 0,
              )
            : undefined;
        return {
          ...set,
          pixels: new Uint8Array(converted.data),
          ...(asepriteSamples ? { asepritePixels: asepriteSamples.data } : {}),
        };
      }),
    };
    if (next.tilesets?.length) next = refreshTilemapProjections(next);
  } else if (maskChanged && timeline.colorDepth === 8) {
    const projections = new Map<object, Map<readonly unknown[] | undefined, Uint8ClampedArray>>();
    next = {
      ...next,
      frames: timeline.frames.map((frame) => ({
        ...frame,
        cels: frame.cels.map((cel, layerIndex) => {
          if (!cel?.asepriteSamples || cel.asepriteSamples.depth !== 8) return cel;
          const colors = frame.palette ?? doc.palette;
          const byPalette =
            projections.get(cel.asepriteSamples) ??
            new Map<readonly unknown[] | undefined, Uint8ClampedArray>();
          projections.set(cel.asepriteSamples, byPalette);
          let data = byPalette.get(colors);
          if (!data) {
            data = expandAsepriteSamples(
              cel.asepriteSamples,
              paletteForColors(colors),
              timeline.layers[layerIndex].flags & 8 ? -1 : (transparentIndex ?? 0),
            );
            byPalette.set(colors, data);
          }
          return {
            ...cel,
            pixels: { width: cel.asepriteSamples.width, height: cel.asepriteSamples.height, data },
          };
        }),
      })),
    };
    if (next.tilesets?.length) next = refreshTilemapProjections(next);
  }
  return next;
}
