import type { PointerInput } from "$/base/pointer-input";
import type { PixelMask, Point, Rect, Rgba } from "$/base/primitives";
import { copyDocumentSelection } from "$/clipboard/image";
import type { FloatingPaste } from "$/clipboard/types";
import type { EditorDocument } from "$/document/types";
import type { ToolSettings } from "$/drawing/tool-settings";
import {
  canTransformTimelineSelection,
  MULTI_CEL_IMAGE_LAYERS_REQUIRED,
} from "$/selection/multi-cel-transform";
import {
  extractSelection,
  selectionPivotFraction,
  selectionPivotPoint,
} from "$/selection/transform";
import type { SelectionHandle, SelectionTransform } from "$/selection/transform";
import { SelectionPivotPosition, SelectionRotationAlgorithm } from "$/selection/types";
import type { TilemapGestureController } from "$/tilemap/gesture-controller";
import { TilemapDisplayMode } from "$/tilemap/types";

export interface SelectionTransformControllerPort {
  getDocument(): EditorDocument | null;
  isEditable(document: EditorDocument): boolean;
  isActiveLayerTilemap(): boolean;
  getTilemapMode(): TilemapDisplayMode;
  cancelGesture(): void;
  beginHistoryTransaction(document: EditorDocument, label: string): void;
  captureHistory(image: EditorDocument["layer"]["pixels"], rect: Rect): void;
  activeLayerClearColor(document: EditorDocument): Rgba;
  getTransformSettings(): Pick<
    ToolSettings,
    | "selectionAutoOpaque"
    | "selectionOpaque"
    | "selectionTransparentColor"
    | "selectionRotationAlgorithm"
    | "selectionPivotPosition"
    | "selectionMulticelWhenLayersOrFrames"
  > & { effectiveOpaque: boolean };
  beginBoundsDrag(at: Point, mask: PixelMask): void;
  beginTransformDrag(
    at: PointerInput,
    handle: SelectionHandle,
    transform: SelectionTransform,
    floating: FloatingPaste,
    mask: PixelMask,
  ): void;
  setStatus(message: string): void;
  publish(pixelsChanged?: boolean): void;
}

/** Clipboard capabilities needed by selection startup, without a controller dependency. */
export interface SelectionTransformClipboardPort {
  getFloatingPaste(): FloatingPaste | null;
  commitFloatingPaste(): boolean;
  getSelectionTransform(): SelectionTransform | null;
  setSelectionTransform(value: SelectionTransform | null): void;
  getTransformedMask(): PixelMask | null;
  setTransformedMask(value: PixelMask | null): void;
  setFloatingPaste(value: FloatingPaste | null): void;
  prepareMultiCelSelectionTransform(document: EditorDocument, mask: PixelMask): boolean;
}

/** Selection pixel extraction and transform startup. Drag lifetime is owned by the input module. */
export class SelectionTransformController {
  constructor(
    private readonly clipboard: SelectionTransformClipboardPort,
    private readonly tilemap: Pick<TilemapGestureController, "beginSelectionTransform">,
    private readonly port: SelectionTransformControllerPort,
  ) {}

  begin(handle: SelectionHandle, at: PointerInput, copy = false): boolean {
    const document = this.port.getDocument();
    const group = document?.timeline?.layers[document.timeline.activeLayer].kind === "group";
    const groupRange =
      document &&
      group &&
      canTransformTimelineSelection(
        document,
        this.port.getTransformSettings().selectionMulticelWhenLayersOrFrames !== false,
      );
    if (
      !document?.selection ||
      (handle !== "bounds" && !this.port.isEditable(document) && !groupRange)
    )
      return false;
    if (
      this.port.isActiveLayerTilemap() &&
      this.port.getTilemapMode() === TilemapDisplayMode.Tiles &&
      handle !== "bounds"
    ) {
      const range = document.timeline?.range;
      if (
        range &&
        (range.kind === "cels" ||
          this.port.getTransformSettings().selectionMulticelWhenLayersOrFrames !== false)
      ) {
        this.port.setStatus(MULTI_CEL_IMAGE_LAYERS_REQUIRED);
        this.port.publish();
        return false;
      }
      if (handle === "pivot") {
        this.port.setStatus(
          "Tile selections do not support pivot transforms; switch to Pixels mode",
        );
        this.port.publish();
        return false;
      }
      if (handle.startsWith("rotate")) {
        this.port.setStatus(
          "Tiles mode does not support selection rotation; switch to Pixels mode",
        );
        this.port.publish();
        return false;
      }
      this.port.cancelGesture();
      return this.tilemap.beginSelectionTransform(handle, at, copy);
    }

    if (handle === "bounds") {
      if (this.clipboard.getFloatingPaste() && !this.clipboard.commitFloatingPaste()) return false;
      this.port.cancelGesture();
      if (!document.selection) return false;
      this.port.beginBoundsDrag({ x: Math.floor(at.x), y: Math.floor(at.y) }, document.selection);
      return true;
    }

    let transform = this.clipboard.getSelectionTransform();
    if (!transform) {
      this.port.cancelGesture();
      const mask = document.selection;
      if (!mask) return false;
      const source = extractSelection(document.layer, mask);
      const sourceClipboard = copyDocumentSelection(document);
      const options = this.port.getTransformSettings(),
        pivotPosition = selectionPivotFraction(
          options.selectionPivotPosition ?? SelectionPivotPosition.Center,
        ),
        bounds = { x: mask.x, y: mask.y, width: mask.width, height: mask.height };
      let multiple = false;
      try {
        multiple = this.clipboard.prepareMultiCelSelectionTransform(document, mask);
      } catch (error) {
        if (!(error instanceof RangeError)) throw error;
        this.port.setStatus(error.message);
        this.port.publish();
        return false;
      }
      if (!multiple && !this.port.isEditable(document)) return false;
      transform = {
        source,
        mask,
        bounds,
        angle: 0,
        copy,
        rotationAlgorithm: options.selectionRotationAlgorithm ?? SelectionRotationAlgorithm.Fast,
        pivotPosition,
        pivotPoint: selectionPivotPoint(bounds, 0, pivotPosition),
        opaque: options.effectiveOpaque,
        transparentColor: options.selectionTransparentColor ?? [0, 0, 0, 0],
      };
      const floating: FloatingPaste = {
        pixels: source,
        x: mask.x,
        y: mask.y,
        asepriteSamples: sourceClipboard?.asepriteSamples,
        sourceAsepriteSamples: sourceClipboard?.asepriteSamples,
        sourceTransparentIndex: sourceClipboard?.transparentIndex,
      };
      try {
        this.clipboard.setSelectionTransform(transform);
      } catch (error) {
        this.clipboard.setSelectionTransform(null);
        if (!(error instanceof RangeError)) throw error;
        this.port.setStatus(error.message);
        this.port.publish();
        return false;
      }
      this.port.beginHistoryTransaction(document, copy ? "Copy Selection" : "Move Selection");
      if (!copy && !multiple) this.clearSourcePixels(document, mask);
      this.clipboard.setTransformedMask(mask);
      this.clipboard.setFloatingPaste(floating);
      this.port.publish(!copy && !multiple);
    }

    const floating = this.clipboard.getFloatingPaste();
    const mask = this.clipboard.getTransformedMask();
    if (!floating || !mask) return false;
    this.port.beginTransformDrag(at, handle, transform, floating, mask);
    this.port.setStatus("Move selection; Enter to commit, Escape to cancel");
    this.port.publish();
    return true;
  }

  private clearSourcePixels(document: EditorDocument, mask: PixelMask): void {
    const image = document.layer.pixels;
    const clearColor = this.port.activeLayerClearColor(document);
    this.port.captureHistory(image, {
      x: mask.x - document.layer.x,
      y: mask.y - document.layer.y,
      width: mask.width,
      height: mask.height,
    });
    for (let y = 0; y < mask.height; y++)
      for (let x = 0; x < mask.width; x++)
        if (mask.data[y * mask.width + x]) {
          const pixelX = mask.x + x - document.layer.x;
          const pixelY = mask.y + y - document.layer.y;
          if (pixelX >= 0 && pixelY >= 0 && pixelX < image.width && pixelY < image.height)
            image.data.set(clearColor, (pixelY * image.width + pixelX) * 4);
        }
  }
}
