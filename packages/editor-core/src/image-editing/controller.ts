import type { Rect, Rgba } from "$/base/primitives";
import { PixelResizeMethod } from "$/base/primitives";
import {
  convertDocumentColorMode,
  type ColorModeConversionOptions,
  type SpriteColorDepth,
} from "$/color/conversion";
import type { EditorDocument } from "$/document/types";
import {
  applyDocumentEffect,
  canOpenEffect,
  EffectTarget,
  previewDocumentEffect,
  type EffectSpec,
} from "$/image-editing/effects";
import {
  resizeDocumentCanvas,
  resizeDocumentSprite,
  rotateDocumentCanvas,
  trimDocumentCanvas,
  type SpriteResizeMethod,
} from "$/image-editing/size";
import { flipDocumentCanvas, type FlipOrientation } from "$/image-editing/transform";
import type { TilesetMode } from "$/tilemap/types";

export interface ImageEditingSettings {
  background: Rgba;
  backgroundIndex?: number | null;
  tilesetMode?: TilesetMode;
}

export interface ImageEditingControllerPort {
  getDocument(): EditorDocument | null;
  getSettings(): ImageEditingSettings;
  prepareEffect(): boolean;
  commitDocumentEdit(label: string, change: (document: EditorDocument) => void): void;
  publish(pixelsChanged?: boolean): void;
}

/** Document-wide raster edits and effect preview state. */
export class ImageEditingController {
  private effectPreview: EditorDocument | null = null;

  constructor(private readonly port: ImageEditingControllerPort) {}

  getEffectPreview(): EditorDocument | null {
    return this.effectPreview;
  }

  clearPreview(): void {
    this.effectPreview = null;
  }

  beginEffect(): boolean {
    return this.port.prepareEffect() && canOpenEffect(this.port.getDocument());
  }

  applyEffect(spec: EffectSpec, target = EffectTarget.Selected): void {
    const document = this.port.getDocument();
    if (!canOpenEffect(document)) return;
    this.effectPreview = null;
    const { tilesetMode } = this.port.getSettings();
    this.port.commitDocumentEdit(
      spec.kind.replace(/-/g, " ").replace(/\b\w/g, (letter) => letter.toUpperCase()),
      (current) => {
        const next = applyDocumentEffect(current, spec, target, false, tilesetMode);
        if (next !== current) Object.assign(current, next);
      },
    );
  }

  previewEffect(spec: EffectSpec | null): void {
    const document = this.port.getDocument();
    const { tilesetMode } = this.port.getSettings();
    this.effectPreview =
      spec && document && canOpenEffect(document)
        ? previewDocumentEffect(document, spec, tilesetMode)
        : null;
    this.port.publish(true);
  }

  resizeSprite(
    width: number,
    height: number,
    method: SpriteResizeMethod = PixelResizeMethod.Nearest,
  ): void {
    this.port.commitDocumentEdit("Sprite Size", (document) =>
      resizeDocumentSprite(document, width, height, method),
    );
  }

  resizeCanvas(bounds: Rect, trimOutside = false): void {
    const { background, backgroundIndex } = this.port.getSettings();
    this.port.commitDocumentEdit("Canvas Size", (document) =>
      resizeDocumentCanvas(document, bounds, trimOutside, background, backgroundIndex ?? undefined),
    );
  }

  cropSprite(): void {
    const selection = this.port.getDocument()?.selection;
    if (selection)
      this.resizeCanvas(
        { x: selection.x, y: selection.y, width: selection.width, height: selection.height },
        false,
      );
  }

  trimSprite(): void {
    this.port.commitDocumentEdit("Trim Sprite", (document) => trimDocumentCanvas(document));
  }

  rotateCanvas(angle: 90 | -90 | 180): void {
    this.port.commitDocumentEdit("Rotate Canvas", (document) =>
      rotateDocumentCanvas(document, angle),
    );
  }

  flipCanvas(orientation: FlipOrientation): void {
    this.port.commitDocumentEdit("Flip Canvas", (document) =>
      flipDocumentCanvas(document, orientation),
    );
  }

  convertColorMode(depth: SpriteColorDepth, options: ColorModeConversionOptions = {}): void {
    this.port.commitDocumentEdit("Color Mode", (document) =>
      convertDocumentColorMode(document, depth, options),
    );
  }
}
