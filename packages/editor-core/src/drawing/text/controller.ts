import { EditorAllocationError } from "$/base/errors";
import { MAX_IMAGE_DIMENSION, MAX_IMAGE_PIXELS } from "$/base/image-limits";
import { UINT8_MAX } from "$/base/numeric-constants";
import type { BitmapFont, PixelBuffer, Point, Rect, Rgba } from "$/base/primitives";
import type { ViewSettings } from "$/canvas/types";
import { documentPastePosition } from "$/canvas/view";
import type { FloatingPaste } from "$/clipboard/types";
import type { EditorDocument } from "$/document/types";
import {
  createInlineText,
  moveInlineText,
  updateInlineText,
  type InlineTextDraft,
} from "$/drawing/text/inline-text";
import { measureBitmapText, paintText, validateBitmapText } from "$/drawing/text/text";
import type { EditorTool } from "$/drawing/tool-settings";

export interface InlineTextDrag {
  start: Point;
  origin: Point;
  moved: boolean;
}

export interface BitmapTextControllerSettings {
  font: BitmapFont | null;
  text: string;
  textScale: number;
  foreground: Rgba;
}

export interface BitmapTextControllerPort {
  getDocument(): EditorDocument | null;
  getSettings(): BitmapTextControllerSettings;
  getView(): Pick<ViewSettings, "zoom" | "pan" | "tiledMode">;
  canEdit(): boolean;
  setToolSettings(patch: { text?: string; textScale?: number; tool?: EditorTool }): void;
  getFloatingPaste(): FloatingPaste | null;
  setFloatingPaste(paste: FloatingPaste | null): void;
  commitFloatingPaste(preserveSelection?: boolean): boolean;
  cancelGesture(): void;
  clearPasteDrag(): void;
  setStatus(message: string): void;
  setAllocationError(error: EditorAllocationError | null): void;
  publish(): void;
}

/** Bitmap text entry and its temporary editable draft. */
export class BitmapTextController {
  private draft: InlineTextDraft | null = null;
  private drag: InlineTextDrag | null = null;

  constructor(private readonly port: BitmapTextControllerPort) {}

  getDraft(): InlineTextDraft | null {
    return this.draft;
  }

  setDraft(value: InlineTextDraft | null): void {
    this.draft = value;
  }

  getDrag(): InlineTextDrag | null {
    return this.drag;
  }

  setDrag(value: InlineTextDrag | null): void {
    this.drag = value;
  }

  reset(): void {
    this.draft = null;
    this.drag = null;
  }

  beginTextPasteInViewport(
    text: string,
    scale: number,
    viewport: { width: number; height: number },
    color?: Rgba,
  ): boolean {
    const document = this.port.getDocument();
    const { font } = this.port.getSettings();
    if (!document || !font || !Number.isFinite(scale) || validateBitmapText(text, font))
      return false;
    const size = measureBitmapText(text, font, scale);
    const position = documentPastePosition(size, document, viewport, this.port.getView());
    return this.beginTextPaste(text, scale, position, color);
  }

  beginTextPaste(text: string, scale: number, position?: Point, color?: Rgba): boolean {
    const document = this.port.getDocument();
    const { font, foreground } = this.port.getSettings();
    if (
      !document ||
      document.layer.locked ||
      !font ||
      !text ||
      !Number.isFinite(scale) ||
      validateBitmapText(text, font)
    )
      return false;
    if (this.port.getFloatingPaste() && !this.port.commitFloatingPaste()) return false;
    this.port.cancelGesture();
    this.port.setAllocationError(null);
    scale = Math.max(1, Math.min(64, Math.floor(scale)));
    const size = measureBitmapText(text, font, scale);
    if (
      size.width > MAX_IMAGE_DIMENSION ||
      size.height > MAX_IMAGE_DIMENSION ||
      size.width * size.height > MAX_IMAGE_PIXELS
    ) {
      const error = new EditorAllocationError(size.width, size.height, "text");
      this.port.setAllocationError(error);
      this.port.setStatus("Text image is too large. Reduce its size or text length.");
      this.port.publish();
      return false;
    }
    const pixels: PixelBuffer = {
      ...size,
      data: new Uint8ClampedArray(size.width * size.height * 4),
    };
    paintText(pixels, { x: 0, y: 0 }, text, font, scale, {
      color: color ?? foreground,
      brush: { shape: "square", size: 1, angle: 0 },
      opacity: UINT8_MAX,
    });
    const x = position
        ? Math.floor(position.x)
        : Math.trunc(document.width / 2) - Math.trunc(size.width / 2),
      y = position
        ? Math.floor(position.y)
        : Math.trunc(document.height / 2) - Math.trunc(size.height / 2);
    this.port.setToolSettings({ text, textScale: scale, tool: "marquee" });
    this.port.setFloatingPaste({ pixels, x, y });
    this.port.clearPasteDrag();
    this.drag = null;
    this.port.setStatus("Move text, then press Enter to commit or Escape to cancel.");
    this.port.publish();
    return true;
  }

  beginInlineText(bounds: Rect): boolean {
    const document = this.port.getDocument();
    const { font, textScale, foreground } = this.port.getSettings();
    if (!document || !this.port.canEdit() || !font) return false;
    if (this.port.getFloatingPaste() && !this.port.commitFloatingPaste()) return false;
    if (this.draft && !this.commitInlineText()) return false;
    this.draft = createInlineText(bounds, font, textScale, foreground);
    this.port.setStatus("Enter text");
    this.port.publish();
    return true;
  }

  updateInlineText(
    patch: Partial<
      Pick<InlineTextDraft, "text" | "scale" | "color" | "selectionStart" | "selectionEnd">
    >,
  ): boolean {
    const { font } = this.port.getSettings();
    if (!this.draft || !font) return false;
    try {
      this.draft = updateInlineText(this.draft, font, patch);
      this.port.setAllocationError(null);
      this.port.publish();
      return true;
    } catch (error) {
      if (error instanceof EditorAllocationError) this.port.setAllocationError(error);
      else if (!(error instanceof RangeError)) throw error;
      this.port.setStatus(error instanceof Error ? error.message : "Invalid text");
      this.port.publish();
      return false;
    }
  }

  moveInlineText(position: Point): void {
    if (this.draft) {
      this.draft = moveInlineText(this.draft, position);
      this.port.publish();
    }
  }

  cancelInlineText(): void {
    if (!this.draft) return;
    this.draft = null;
    this.drag = null;
    this.port.setAllocationError(null);
    this.port.setStatus("Ready");
    this.port.publish();
  }

  commitInlineText(): boolean {
    const draft = this.draft;
    const document = this.port.getDocument();
    if (!draft || !document) return true;
    if (!this.port.canEdit()) return false;
    if (!draft.text) {
      this.cancelInlineText();
      return true;
    }
    const selection = document.selection;
    this.draft = null;
    this.port.setFloatingPaste({
      pixels: draft.pixels,
      x: draft.bounds.x,
      y: draft.bounds.y,
    });
    const success = this.port.commitFloatingPaste(true);
    if (!success) {
      this.port.setFloatingPaste(null);
      this.draft = draft;
      return false;
    }
    document.selection = selection;
    this.drag = null;
    this.port.publish();
    return true;
  }
}
