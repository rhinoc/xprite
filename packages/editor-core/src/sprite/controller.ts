import type { PixelBuffer, Rgba } from "$/base/primitives";
import { activateTimelineCel, ensureTimeline } from "$/document/document";
import { assertDimension, assertPixelCount } from "$/document/pixel-validation";
import type { EditorDocument } from "$/document/types";
import { applySpriteProperties, type SpriteProperties } from "$/sprite/properties";
import { SpriteSliceController, type SliceControllerPort } from "$/sprite/slice-controller";
import {
  canConvertBackground,
  convertBackground,
  insertReferenceLayer,
} from "$/timeline/layer-operations";
import type { SpriteTimeline } from "$/timeline/types";

export interface SpriteControllerPort {
  getTimeline(): SpriteTimeline | null;
  getBackgroundColor(): { color: Rgba; index?: number };
  commitDocumentEdit(label: string, change: (document: EditorDocument) => void): void;
  commitTimelineEdit(
    label: string,
    change: (
      timeline: SpriteTimeline,
      dimensions: { width: number; height: number },
    ) => SpriteTimeline,
  ): void;
}

/** Sprite-level commands and slice state composed behind one domain API. */
export class SpriteController {
  readonly slices: SpriteSliceController;

  constructor(
    slicePort: SliceControllerPort,
    private readonly port: SpriteControllerPort,
  ) {
    this.slices = new SpriteSliceController(slicePort);
  }

  setProperties(properties: SpriteProperties): void {
    this.port.commitDocumentEdit("Change Sprite Properties", (document) => {
      const timeline = ensureTimeline(document);
      const next = applySpriteProperties(document, timeline, properties);
      if (next === timeline) return;
      document.timeline = next;
      activateTimelineCel(document, next.activeFrame, next.activeLayer);
    });
  }

  convertLayerBackground(toBackground: boolean): void {
    const timeline = this.port.getTimeline();
    if (!timeline || !canConvertBackground(timeline, toBackground)) return;
    const background = this.port.getBackgroundColor();
    this.port.commitTimelineEdit("Edit Layer", (current, size) =>
      convertBackground(
        current,
        size.width,
        size.height,
        background.color,
        toBackground,
        background.index,
      ),
    );
  }

  addReferenceLayer(image: PixelBuffer, name?: string): boolean {
    assertDimension(image.width, "width");
    assertDimension(image.height, "height");
    assertPixelCount(image.width, image.height);
    if (image.data.length !== image.width * image.height * 4)
      throw new RangeError("Invalid reference image");
    const timeline = this.port.getTimeline();
    if (!timeline) return false;
    const before = timeline.layers.length;
    this.port.commitTimelineEdit("Edit Layer", (current, size) => {
      let maximum = 0;
      for (const layer of current.layers) {
        const match = /^Reference Layer ([\t\n\r ]*[+-]?\d+)/.exec(layer.name);
        if (match) maximum = Math.max(maximum, Number(match[1]));
      }
      return insertReferenceLayer(
        current,
        image,
        size.width,
        size.height,
        name ?? `Reference Layer ${maximum + 1}`,
      );
    });
    return (this.port.getTimeline()?.layers.length ?? before) > before;
  }
}
