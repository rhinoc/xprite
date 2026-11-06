import { UINT8_MAX } from "$/base/numeric-constants";
import type { PixelBuffer } from "$/base/primitives";
import { convertPixelsToSrgb, workingColorProfile } from "$/color/icc-profile";
import { activateTimelineCel } from "$/document/document";
import { assertPixelBuffer } from "$/document/pixel-validation";
import type { EditorProject } from "$/document/project";
import type { EditorDocument } from "$/document/types";
import {
  createLayerUuid,
  layerSubtree,
  layerAncestors,
  layerEditable,
  LAYER_VISIBLE,
  LAYER_EDITABLE,
  LAYER_REFERENCE,
  MAX_TIMELINE_LAYERS,
  renderTimelineFrame,
} from "$/timeline";

const NORMAL_LAYER_ID_PREFIX = "normal-map-";
const UUID_HEX_RADIX = 16;
const UUID_HEX_BYTE_WIDTH = 2;
export const DEFAULT_NORMAL_LAYER_NAME = "Normal";
export enum NormalMapDocumentErrorCode {
  SourceMissing = "source-missing",
  OutputLocked = "output-locked",
  LayerLimit = "layer-limit",
}
export class NormalMapDocumentError extends Error {
  constructor(
    readonly code: NormalMapDocumentErrorCode,
    message: string,
  ) {
    super(message);
    this.name = "NormalMapDocumentError";
  }
}
export interface NormalMapFrameOutput {
  frame: number;
  pixels: PixelBuffer;
}

/** An independent RGB result keeps the original artwork available for lighting and repainting. */
export function createNormalMapProject(
  source: PixelBuffer,
  normals: PixelBuffer,
  sourceName: string,
  duration: number,
): EditorProject {
  assertPixelBuffer(source);
  const document: EditorDocument = {
    name: DEFAULT_NORMAL_LAYER_NAME,
    width: source.width,
    height: source.height,
    layer: { name: sourceName, pixels: source, x: 0, y: 0, visible: true, locked: false },
    selection: null,
    timeline: {
      colorDepth: 32,
      colorProfile: { type: "srgb" },
      activeLayer: 0,
      activeFrame: 0,
      layers: [
        {
          id: "layer-1",
          name: sourceName,
          kind: "image",
          visible: true,
          locked: false,
          opacity: UINT8_MAX,
          flags: LAYER_VISIBLE | LAYER_EDITABLE,
        },
      ],
      frames: [
        {
          duration,
          cels: [
            {
              pixels: { ...source, data: source.data.slice() },
              x: 0,
              y: 0,
              opacity: UINT8_MAX,
              zIndex: 0,
            },
          ],
        },
      ],
    },
  };
  writeNormalMapLayer(document, [{ frame: 0, pixels: normals }]);
  return { image: normals, timeline: document.timeline! };
}

/** Data textures can share a document only when its color mode/profile preserve RGB bytes. */
export function canStoreNormalMapLayer(document: EditorDocument): boolean {
  const profile = workingColorProfile(document.timeline);
  return (
    (document.timeline?.colorDepth ?? 32) === 32 &&
    (!profile ||
      profile.type === "none" ||
      (profile.type === "srgb" && profile.gamma === undefined))
  );
}

/** Render an explicit layer/group or visible composite without modifying visibility or active cel. */
export function normalMapSourcePixels(
  document: EditorDocument,
  frame: number,
  layerId: string | null,
  excluded: readonly string[] = [],
  colorManaged = true,
): PixelBuffer {
  const timeline = document.timeline;
  if (!timeline) throw new Error("A sprite timeline is required");
  const index = layerId === null ? -1 : timeline.layers.findIndex((layer) => layer.id === layerId);
  if (layerId !== null && index < 0)
    throw new NormalMapDocumentError(
      NormalMapDocumentErrorCode.SourceMissing,
      "The source layer no longer exists",
    );
  const selected =
    index < 0
      ? null
      : new Set([
          ...layerSubtree(timeline, index),
          ...layerAncestors(timeline, index).map((layer) => timeline.layers.indexOf(layer)),
        ]);
  const ancestors =
    index < 0
      ? new Set<string>()
      : new Set(layerAncestors(timeline, index).map((layer) => layer.id));
  const rendered = renderTimelineFrame(
    {
      ...timeline,
      layers: timeline.layers.map((layer, at) => ({
        ...layer,
        visible:
          !excluded.includes(layer.id) &&
          !(layer.flags & LAYER_REFERENCE) &&
          (selected
            ? selected.has(at) && (at === index || ancestors.has(layer.id) || layer.visible)
            : layer.visible),
      })),
    },
    document.width,
    document.height,
    frame,
    undefined,
    false,
  );
  return colorManaged ? convertPixelsToSrgb(rendered, workingColorProfile(timeline)) : rendered;
}

/** Create/update the result and all requested cels inside the caller's single history transaction. */
export function writeNormalMapLayer(
  document: EditorDocument,
  outputs: readonly NormalMapFrameOutput[],
  name = DEFAULT_NORMAL_LAYER_NAME,
  layerId?: string,
): string {
  const timeline = document.timeline;
  if (!timeline || !canStoreNormalMapLayer(document))
    throw new Error("Normal map layers require RGB with a standard sRGB profile");
  if (!outputs.length) throw new Error("No normal map frames were generated");
  for (const { frame, pixels } of outputs) {
    assertPixelBuffer(pixels);
    if (
      !timeline.frames[frame] ||
      pixels.width !== document.width ||
      pixels.height !== document.height
    )
      throw new RangeError("Normal map frame dimensions do not match the sprite");
  }
  let index = layerId ? timeline.layers.findIndex((layer) => layer.id === layerId) : -1;
  if (index >= 0 && (timeline.layers[index].kind !== "image" || !layerEditable(timeline, index)))
    throw new NormalMapDocumentError(
      NormalMapDocumentErrorCode.OutputLocked,
      "The normal map output layer is locked or unavailable",
    );
  let layers = [...timeline.layers];
  let frames = [...timeline.frames];
  if (index < 0) {
    if (layers.length >= MAX_TIMELINE_LAYERS)
      throw new NormalMapDocumentError(
        NormalMapDocumentErrorCode.LayerLimit,
        "The sprite has reached its layer limit",
      );
    const identifier = `${NORMAL_LAYER_ID_PREFIX}${Array.from(createLayerUuid(), (value) =>
      value.toString(UUID_HEX_RADIX).padStart(UUID_HEX_BYTE_WIDTH, "0"),
    ).join("")}`;
    index = layers.length;
    layers.push({
      id: identifier,
      name,
      kind: "image",
      parentId: null,
      blendMode: 0,
      opacity: UINT8_MAX,
      visible: true,
      locked: false,
      flags: LAYER_VISIBLE | LAYER_EDITABLE,
    });
    frames = frames.map((frame) => ({ ...frame, cels: [...frame.cels, null] }));
  }
  const byFrame = new Map(outputs.map((output) => [output.frame, output.pixels]));
  frames = frames.map((frame, at) => {
    const pixels = byFrame.get(at);
    if (!pixels) return frame;
    const cels = [...frame.cels];
    cels[index] = {
      pixels: { ...pixels, data: pixels.data.slice() },
      x: 0,
      y: 0,
      opacity: UINT8_MAX,
      zIndex: 0,
    };
    return { ...frame, cels };
  });
  document.timeline = { ...timeline, layers, frames, activeLayer: index, range: undefined };
  activateTimelineCel(document, timeline.activeFrame, index);
  return layers[index].id;
}
