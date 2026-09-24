import type { CanvasReferenceCachePort, CanvasViewportClip } from "$/managers/ports/platform";
import { convertPixelsToSrgb } from "@xprite/editor-core";
import { hasVisibleReferenceLayers } from "@xprite/editor-core";
import type { EditorSnapshot, Point } from "@xprite/editor-core";
import type { PixelBuffer } from "@xprite/editor-core/base";
import { workingColorProfile } from "@xprite/editor-core/color";
/** Aseprite reference viewport raster stays independent of devicePixelRatio / GUI presentation scale. */
export class ReferenceViewportCache implements CanvasReferenceCachePort {
  private canvas: HTMLCanvasElement | null = null;
  private context: CanvasRenderingContext2D | null = null;
  private image: ImageData | null = null;
  private key: unknown[] = [];
  draw(
    context: CanvasRenderingContext2D,
    state: EditorSnapshot,
    renderViewport: (clip: CanvasViewportClip) => PixelBuffer,
    origin: Point,
    viewport: { width: number; height: number },
    backingScale: number,
  ): boolean {
    const doc = state.document;
    if (
      !doc ||
      !(hasVisibleReferenceLayers(doc.timeline) || (state.view.onionSkin?.active && !state.playing))
    )
      return false;
    const zoom = state.view.zoom;
    const left = Math.max(0, Math.floor(origin.x)),
      top = Math.max(0, Math.floor(origin.y));
    const right = Math.min(Math.ceil(viewport.width), Math.ceil(origin.x + doc.width * zoom)),
      bottom = Math.min(Math.ceil(viewport.height), Math.ceil(origin.y + doc.height * zoom));
    const width = right - left,
      height = bottom - top;
    if (width < 1 || height < 1) return true;
    const clip = { x: left - origin.x, y: top - origin.y, width, height, zoom };
    // Onion skin uses a per-viewport raster. Render it at the canvas backing
    // resolution so fractional sprite zoom does not expand a lower-resolution
    // GUI-pixel buffer into uneven physical pixel widths/heights.
    const rasterScale = state.view.onionSkin?.active && !state.playing ? backingScale : 1,
      rasterWidth = Math.ceil(width * rasterScale),
      rasterHeight = Math.ceil(height * rasterScale),
      rasterClip = {
        x: clip.x * rasterScale,
        y: clip.y * rasterScale,
        width: rasterWidth,
        height: rasterHeight,
        zoom: zoom * rasterScale,
      };
    const key = [
      state.view.onionSkin,
      state.view.nonActiveLayersOpacity,
      doc.timeline?.activeLayer,
      doc.timeline?.range,
      state.playing,
      doc.id,
      state.pixelRevision,
      state.floatingPaste,
      state.inlineText,
      state.preview,
      state.linePreview,
      state.preview || state.linePreview ? state.settings : null,
      left,
      top,
      clip.x,
      clip.y,
      width,
      height,
      zoom,
      rasterScale,
    ];
    if (!this.canvas) {
      this.canvas = document.createElement("canvas");
      this.context = this.canvas.getContext("2d");
    }
    if (!this.context || !this.canvas) return false;
    if (key.length !== this.key.length || key.some((v, i) => v !== this.key[i])) {
      const pixels = convertPixelsToSrgb(
        renderViewport(rasterClip),
        workingColorProfile(doc.timeline),
      );
      // Panning and animation usually retain the viewport dimensions. Reuse the
      // backing store and upload buffer instead of allocating both every frame.
      if (!this.image || this.image.width !== rasterWidth || this.image.height !== rasterHeight) {
        if (this.canvas.width !== rasterWidth) this.canvas.width = rasterWidth;
        if (this.canvas.height !== rasterHeight) this.canvas.height = rasterHeight;
        this.image = this.context.createImageData(rasterWidth, rasterHeight);
      }
      this.image.data.set(pixels.data);
      this.context.putImageData(this.image, 0, 0);
      this.key = key;
    }
    // Caller has already installed sprite clipping. Draw after removing only its
    // sprite zoom/origin transform. Reference layers retain their logical raster;
    // onion skin is already rasterized at backing resolution.
    context.save();
    const backingResolution = rasterScale === backingScale;
    const drawScale = backingResolution ? 1 : backingScale;
    context.setTransform(drawScale, 0, 0, drawScale, 0, 0);
    context.imageSmoothingEnabled = false;
    context.drawImage(
      this.canvas,
      backingResolution ? left * backingScale : left,
      backingResolution ? top * backingScale : top,
    );
    context.restore();
    return true;
  }
  clear() {
    this.key = [];
    this.canvas = null;
    this.context = null;
    this.image = null;
  }
}
