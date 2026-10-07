import { UINT8_MAX, UINT16_MAX, INT16_MIN, INT16_MAX } from "$/base/numeric-constants";
import type { PixelBuffer, Rgba } from "$/base/primitives";
import { workingColorProfile, assertSupportedColorProfile } from "$/color/icc-profile";
import {
  cloneAsepriteImageGraph,
  assertAsepriteColorTimeline,
} from "$/color/operations/color-mode";
import { MAX_PALETTE_COLORS } from "$/color/palette-resize";
import { activateTimelineCel } from "$/document/document";
import { assertTimelineMemoryBudget } from "$/document/memory-budget";
import { copyEditorImage } from "$/document/pixel-ownership";
import { DecodedPixelCache } from "$/document/pixel-storage";
import { assertDimension, assertPixelBuffer, assertPixelCount } from "$/document/pixel-validation";
import type { EditorDocument } from "$/document/types";
import { assertTilemapTimeline } from "$/tilemap/model";
import { assertAnimationLoopCount } from "$/timeline/animation-loop";
import { assertLayerHierarchy } from "$/timeline/layer-operations";
import { timelineTags } from "$/timeline/operations/timeline-range";
import {
  assertSupportedAnimationTags,
  assertSupportedBackgroundStack,
  MAX_TIMELINE_FRAMES,
  MAX_TIMELINE_LAYERS,
  type SpriteTimeline,
} from "$/timeline/timeline";

export interface DocumentControllerPort {
  installDocument(
    document: EditorDocument,
    palette?: readonly Rgba[],
    fallbackImage?: PixelBuffer,
    dirty?: boolean,
  ): void;
  closeDocument(): void;
}

const cloneImage = (image: PixelBuffer): PixelBuffer => ({
  width: image.width,
  height: image.height,
  data: new Uint8ClampedArray(image.data),
});

/** Document input validation and owned-project construction. The editor root performs installation. */
export class DocumentController {
  constructor(private readonly port: DocumentControllerPort) {}

  loadImage(image: PixelBuffer, name = "Untitled", initialPalette?: readonly Rgba[]): void {
    assertPixelBuffer(image);
    if (initialPalette && initialPalette.length > MAX_PALETTE_COLORS)
      throw new RangeError(`Palette exceeds ${MAX_PALETTE_COLORS} colors`);
    const document: EditorDocument = {
      format: "png",
      name,
      width: image.width,
      height: image.height,
      layer: {
        name: "Layer 1",
        pixels: cloneImage(image),
        x: 0,
        y: 0,
        visible: true,
        locked: false,
      },
      selection: null,
    };
    this.port.installDocument(document, initialPalette, image);
  }

  loadTimeline(
    timeline: SpriteTimeline,
    width: number,
    height: number,
    name: string,
    palette?: readonly Rgba[],
  ): void {
    assertDimension(width, "width");
    assertDimension(height, "height");
    assertPixelCount(width, height);
    if (timeline.loopCount !== undefined) assertAnimationLoopCount(timeline.loopCount);
    if (
      !timeline.layers.length ||
      !timeline.frames.length ||
      timeline.layers.length > MAX_TIMELINE_LAYERS ||
      timeline.frames.length > MAX_TIMELINE_FRAMES
    )
      throw new RangeError("Unsupported project size");
    assertSupportedAnimationTags(timelineTags(timeline), timeline.frames.length);
    assertAsepriteColorTimeline(timeline);
    assertTilemapTimeline(timeline);
    assertSupportedColorProfile(workingColorProfile(timeline), timeline.colorDepth ?? 32);
    assertSupportedBackgroundStack(timeline.layers);
    assertLayerHierarchy(timeline);
    for (const layer of timeline.layers)
      if (
        (layer.kind &&
          layer.kind !== "image" &&
          layer.kind !== "group" &&
          layer.kind !== "tilemap") ||
        !Number.isInteger(layer.blendMode ?? 0) ||
        (layer.blendMode ?? 0) < 0 ||
        (layer.blendMode ?? 0) > 18
      )
        throw new RangeError("Unsupported layer kind or blend mode");
    const ids = new Set<string>();
    for (const layer of timeline.layers) {
      if (
        !layer.id ||
        ids.has(layer.id) ||
        typeof layer.name !== "string" ||
        !Number.isInteger(layer.opacity) ||
        layer.opacity < 0 ||
        layer.opacity > UINT8_MAX ||
        !Number.isInteger(layer.flags) ||
        layer.flags < 0 ||
        layer.flags > UINT16_MAX
      )
        throw new RangeError("Invalid sprite layer");
      ids.add(layer.id);
    }
    for (const frame of timeline.frames) {
      if (
        frame.cels.length !== timeline.layers.length ||
        !Number.isInteger(frame.duration) ||
        frame.duration < 1 ||
        frame.duration > UINT16_MAX
      )
        throw new RangeError("Invalid animation frame");
      for (const cel of frame.cels)
        if (cel) {
          assertPixelBuffer(cel.pixels);
          if (
            ![cel.x, cel.y, cel.opacity, cel.zIndex].every(Number.isInteger) ||
            cel.x < INT16_MIN ||
            cel.x > INT16_MAX ||
            cel.y < INT16_MIN ||
            cel.y > INT16_MAX ||
            cel.opacity < 0 ||
            cel.opacity > UINT8_MAX ||
            cel.zIndex < INT16_MIN ||
            cel.zIndex > INT16_MAX
          )
            throw new RangeError("Invalid sprite cel");
        }
    }
    assertTimelineMemoryBudget(timeline, width, height);
    const copied = new Map<PixelBuffer, PixelBuffer>();
    const decodedCache = new DecodedPixelCache();
    const owned: SpriteTimeline = cloneAsepriteImageGraph({
      ...timeline,
      layers: timeline.layers.map((layer) => ({ ...layer })),
      frames: timeline.frames.map((frame) => ({
        ...frame,
        cels: frame.cels.map((cel) => {
          if (!cel) return null;
          let pixels = copied.get(cel.pixels);
          if (!pixels) {
            pixels = copyEditorImage(cel.pixels, decodedCache);
            copied.set(cel.pixels, pixels);
          }
          return { ...cel, pixels };
        }),
      })),
    });
    const document: EditorDocument = {
      format: "aseprite",
      name,
      width,
      height,
      timeline: owned,
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
    activateTimelineCel(document, owned.activeFrame, owned.activeLayer);
    this.port.installDocument(document, palette);
  }

  close(): void {
    this.port.closeDocument();
  }
}
