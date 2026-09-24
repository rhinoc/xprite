import { UINT8_MAX } from "$/base/numeric-constants";
import type { PixelBuffer } from "$/base/primitives";
import { assertPixelBuffer } from "$/document/pixel-validation";
import type { EditorDocument } from "$/document/types";
import {
  applyImportSpriteSheet,
  type ImportSpriteSheetOptions,
} from "$/import-export/image/import-sprite-sheet";
import { LAYER_EDITABLE, LAYER_VISIBLE } from "$/timeline/timeline";

const SPRITE_SHEET_PREVIEW_FRAME_DURATION = 100;
const SPRITE_SHEET_PREVIEW_LAYER_FLAGS = LAYER_VISIBLE | LAYER_EDITABLE;

export interface ImportExportControllerPort {
  getDocument(): EditorDocument | null;
  commitDocumentEdit(label: string, change: (document: EditorDocument) => void): void;
  publish(pixelsChanged?: boolean): void;
}

const cloneImage = (image: PixelBuffer): PixelBuffer => ({
  width: image.width,
  height: image.height,
  data: new Uint8ClampedArray(image.data),
});

/** Import/export workflows that own temporary import previews and commit imports through a document port. */
export class ImportExportController {
  private spriteSheetPreview: EditorDocument | null = null;

  constructor(private readonly port: ImportExportControllerPort) {}

  getSpriteSheetPreview(): EditorDocument | null {
    return this.spriteSheetPreview;
  }

  clearSpriteSheetPreview(publish = false): void {
    if (!this.spriteSheetPreview) return;
    this.spriteSheetPreview = null;
    if (publish) this.port.publish(true);
  }

  previewSpriteSheet(image: PixelBuffer | null): void {
    const document = this.port.getDocument();
    if (!image || !document) {
      this.clearSpriteSheetPreview(true);
      return;
    }
    assertPixelBuffer(image);
    const pixels = cloneImage(image);
    this.spriteSheetPreview = {
      ...document,
      width: image.width,
      height: image.height,
      selection: null,
      hiddenSelection: null,
      layer: { name: "Sprite Sheet", pixels, x: 0, y: 0, visible: true, locked: false },
      timeline: {
        activeFrame: 0,
        activeLayer: 0,
        composeGroups: false,
        layers: [
          {
            id: "sheet-preview",
            name: "Sprite Sheet",
            visible: true,
            locked: false,
            opacity: UINT8_MAX,
            flags: SPRITE_SHEET_PREVIEW_LAYER_FLAGS,
          },
        ],
        frames: [
          {
            duration: SPRITE_SHEET_PREVIEW_FRAME_DURATION,
            cels: [{ pixels, x: 0, y: 0, opacity: UINT8_MAX, zIndex: 0 }],
          },
        ],
      },
    };
    this.port.publish(true);
  }

  importSpriteSheet(options: ImportSpriteSheetOptions): void {
    if (!this.port.getDocument()) return;
    this.port.commitDocumentEdit("Import Sprite Sheet", (document) => {
      applyImportSpriteSheet(document, options);
    });
  }
}
