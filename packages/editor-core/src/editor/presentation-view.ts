import { cloneGraph } from "$/base/clone";
import { UINT8_MAX } from "$/base/numeric-constants";
import type { PixelBuffer } from "$/base/primitives";
import { RasterEditor } from "$/editor/RasterEditor";
import type { EditorSnapshot } from "$/editor/types";

/** Detached presentation of supplied state. No commands are replayed and no
 * document, history, linked view or recovery publication reaches a live editor. */
export class EditorPresentationView extends RasterEditor {
  private presented: { snapshot: EditorSnapshot; pixels: PixelBuffer } | null = null;
  private sourceSnapshot: EditorSnapshot | null = null;

  constructor() {
    super();
  }

  present(
    snapshot: EditorSnapshot,
    pixels: PixelBuffer,
    view: Partial<EditorSnapshot["view"]> = {},
  ) {
    const previous = this.presented?.snapshot;
    this.presented =
      this.presented && this.sourceSnapshot === snapshot
        ? { snapshot: this.presented.snapshot, pixels: cloneGraph(pixels) }
        : cloneGraph({ snapshot, pixels });
    this.sourceSnapshot = snapshot;
    const owned = this.presented.snapshot;
    // Retain equivalent control values across raster samples.
    if (previous) {
      if (JSON.stringify(previous.settings) === JSON.stringify(owned.settings))
        owned.settings = previous.settings;
      if (JSON.stringify(previous.view) === JSON.stringify(owned.view)) owned.view = previous.view;
      if (JSON.stringify(previous.palette) === JSON.stringify(owned.palette))
        owned.palette = previous.palette;
      if (
        JSON.stringify(previous.defaultDocumentView) === JSON.stringify(owned.defaultDocumentView)
      )
        owned.defaultDocumentView = previous.defaultDocumentView;
    }
    if (!previous || owned.settings !== previous.settings)
      this.drawing.settings.replaceSettings(owned.settings);
    this.canvas.setViewState({ ...owned.view, ...view });
    this.canvas.clearCache();
    this.publish(true);
  }

  protected override getPresentationInput() {
    const frame = this.presented;
    const document = frame?.snapshot.document;
    if (!frame || !document) return null;
    return {
      document: {
        ...document,
        timeline: undefined,
        layer: {
          ...document.layer,
          pixels: frame.pixels,
          x: 0,
          y: 0,
          visible: true,
          opacity: UINT8_MAX,
          celOpacity: UINT8_MAX,
          emptyCel: false,
        },
      },
    };
  }

  protected override publish(pixels = false) {
    // RasterEditor's construction publishes before this view has supplied state.
    if (!this.presented) {
      super.publish(pixels);
      return;
    }
    this.kernel.publishPresentationSnapshot(
      {
        ...this.presented.snapshot,
        settings: this.drawing.settings.getSettings(),
        view: this.canvas.getViewSettings(),
        rasterChange: null,
      },
      pixels,
    );
  }
}
