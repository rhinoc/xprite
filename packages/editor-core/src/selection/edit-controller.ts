import { EditorAllocationError } from "$/base/errors";
import { MAX_IMAGE_DIMENSION, MAX_IMAGE_PIXELS } from "$/base/image-limits";
import { BITS_PER_BYTE, UINT8_MAX } from "$/base/numeric-constants";
import type { PixelBuffer, PixelMask, Point, Rect, Rgba } from "$/base/primitives";
import type { FloatingPaste } from "$/clipboard/types";
import {
  createAsepriteIndexWriter,
  libreSpriteWorkingBrushColor,
  libreSpriteWorkingBrushIndex,
  normalizeAsepriteDocument,
} from "$/color/operations/color-mode";
import type { AsepriteImageSamples } from "$/color/samples";
import { encodeAsepriteSamples, paletteForColors } from "$/color/samples";
import type { AsepriteIndexWriter } from "$/color/types";
import {
  activateTimelineCel,
  ensureTimeline,
  syncTimeline,
  trimActiveCel,
} from "$/document/document";
import type { EditorDocument } from "$/document/types";
import type { EditorTool, ToolSettings } from "$/drawing/tool-settings";
import { FlipOrientation } from "$/image-editing/transform";
import { selectionBorderMask } from "$/selection/operations";
import {
  maskContains,
  rasterizeSelectionTransform,
  dragSelectionTransform,
  rotateSelectionTransform,
} from "$/selection/transform";
import type { SelectionHandle, SelectionTransform } from "$/selection/types";
import type { TilemapImage } from "$/tilemap/model";
import {
  finishTilemapTransform,
  rotateTilemap,
} from "$/tilemap/operations/tile-document-transform";
import { applyTilemapPoints, tilemapBrushPoints } from "$/tilemap/tools";
import { TilemapDisplayMode } from "$/tilemap/types";
import { layerEditable, LAYER_BACKGROUND } from "$/timeline/timeline";
import type { TimelineCel } from "$/timeline/timeline";

/** Read-only editor facts needed by selection content operations. */
export interface SelectionEditProjection {
  readonly selection: PixelMask | null;
  readonly editable: boolean;
  readonly emptyCel: boolean;
  readonly timelinePresent: boolean;
  readonly activeLayer: {
    readonly visible: boolean;
    readonly editable: boolean;
    readonly reference: boolean;
    readonly group: boolean;
    readonly tilemap: boolean;
    readonly celExists: boolean;
  };
  readonly tilemapMode: TilemapDisplayMode;
  readonly selectedTile: number;
  readonly tool: EditorTool;
  readonly pointer: Point | null;
  readonly foreground: Rgba;
  readonly foregroundIndex?: number;
  readonly background: Rgba;
  readonly backgroundIndex?: number;
  readonly palette?: readonly Rgba[];
  readonly ink?: ToolSettings["ink"];
}

export interface SelectionEditTransformSession {
  readonly transform: SelectionTransform | null;
  readonly floating: FloatingPaste | null;
  readonly mask: PixelMask | null;
}

/** Transaction-local editor services. Document access is scoped to mutateDocument. */
export interface SelectionEditTransaction {
  expandCel(document: EditorDocument, extra?: Rect): void;
  captureHistory(image: PixelBuffer, rect: Rect): void;
  activeLayerClearColor(document: EditorDocument): Rgba;
}

/** Narrow boundary used by the selection edit module; it has no editor/kernel dependency. */
export interface SelectionEditPort {
  readProjection(): SelectionEditProjection | null;
  resolvePendingCel(): boolean;
  mutateDocument(
    label: string,
    mutate: (document: EditorDocument, transaction: SelectionEditTransaction) => void,
  ): void;
  setStatus(message: string): void;
  setAllocationError(error: EditorAllocationError | null): void;
  publish(pixelsChanged?: boolean): void;
  setTool(tool: EditorTool): void;
  beginSelectionTransform(handle: SelectionHandle, at: Point): boolean;
  readTransformSession(): SelectionEditTransformSession;
  transformFloatingAsepriteSamples(
    source: AsepriteImageSamples,
    transform: SelectionTransform,
    transparentIndex?: number,
  ): AsepriteImageSamples | undefined;
  updateTransformSession(
    transform: SelectionTransform,
    mask: PixelMask,
    floating: FloatingPaste,
    clearDrag: boolean,
  ): void;
  /** Selection bounds use the editor's existing bounds-drag history transaction. */
  finishSelectionBoundsNudge(dx: number, dy: number): boolean;
  nudgeTilemapSelection(dx: number, dy: number): boolean;
  /** Tilemap clipboard/tileset handling is supplied by the tilemap domain at composition time. */
  flipTilemapSelection(orientation: FlipOrientation): void;
  deleteSelectedSlices(): void;
}

function isTilesMode(projection: SelectionEditProjection): boolean {
  return projection.tilemapMode === TilemapDisplayMode.Tiles;
}

function rotateBytes<T extends Uint8Array | Uint8ClampedArray>(
  data: T,
  width: number,
  height: number,
  stride: number,
  angle: 90 | -90 | 180,
): { width: number; height: number; data: T } {
  const outWidth = angle === 180 ? width : height;
  const outHeight = angle === 180 ? height : width;
  const output = new (data.constructor as { new (length: number): T })(
    outWidth * outHeight * stride,
  );
  for (let y = 0; y < height; y++)
    for (let x = 0; x < width; x++) {
      const dx = angle === 180 ? width - 1 - x : angle === 90 ? height - 1 - y : y;
      const dy = angle === 180 ? height - 1 - y : angle === 90 ? x : width - 1 - x;
      const from = (y * width + x) * stride;
      const to = (dy * outWidth + dx) * stride;
      output.set(data.subarray(from, from + stride), to);
    }
  return { width: outWidth, height: outHeight, data: output };
}

function celIdentity(cel: TimelineCel): object {
  return cel.tilemap ?? cel.asepriteSamples ?? cel.pixels;
}

function rotateCelBounds(document: EditorDocument, cel: TimelineCel, angle: 90 | -90 | 180) {
  const old = cel.preciseBounds ?? {
    x: cel.x,
    y: cel.y,
    width: cel.pixels.width,
    height: cel.pixels.height,
  };
  if (angle === 180)
    return {
      ...old,
      x: document.width - old.x - old.width,
      y: document.height - old.y - old.height,
    };
  if (angle === 90)
    return {
      x: document.height - old.y - old.height,
      y: old.x,
      width: old.height,
      height: old.width,
    };
  return {
    x: old.y,
    y: document.width - old.x - old.width,
    width: old.height,
    height: old.width,
  };
}

function rotateDocumentCels(document: EditorDocument, angle: 90 | -90 | 180): boolean {
  const current = ensureTimeline(document);
  const range = current.range;
  const frames = range
    ? range.kind === "layers"
      ? [...current.frames.keys()]
      : range.frames
    : [current.activeFrame];
  const layers = range
    ? range.kind === "frames"
      ? [...current.layers.keys()]
      : range.layers
    : [current.activeLayer];
  const identities = new Set<object>();
  for (const frameIndex of frames)
    for (const layerIndex of layers) {
      const cel = current.frames[frameIndex]?.cels[layerIndex];
      if (
        !cel ||
        !current.layers[layerIndex].visible ||
        !layerEditable(current, layerIndex) ||
        current.layers[layerIndex].kind === "group"
      )
        continue;
      identities.add(celIdentity(cel));
    }
  if (!identities.size) return false;

  const pixelsBySource = new Map<PixelBuffer, PixelBuffer>();
  const sampleImageCopies = new Map<AsepriteImageSamples, AsepriteImageSamples>();
  const tilemapsBySource = new Map<TilemapImage, TilemapImage>();
  let changed = false;
  let changedTilemap = false;
  const next = {
    ...current,
    frames: current.frames.map((frame) => ({
      ...frame,
      cels: frame.cels.map((cel) => {
        if (!cel || !identities.has(celIdentity(cel))) return cel;
        if (cel.tilemap) {
          let tilemap = tilemapsBySource.get(cel.tilemap);
          if (!tilemap) {
            tilemap = rotateTilemap(cel.tilemap, angle);
            tilemapsBySource.set(cel.tilemap, tilemap);
          }
          const bounds = rotateCelBounds(document, cel, angle);
          changed = true;
          changedTilemap = true;
          return {
            ...cel,
            tilemap,
            x: Math.trunc(bounds.x),
            y: Math.trunc(bounds.y),
            ...(cel.preciseBounds ? { preciseBounds: bounds } : {}),
          };
        }
        let pixels = pixelsBySource.get(cel.pixels);
        if (!pixels) {
          pixels = rotateBytes(cel.pixels.data, cel.pixels.width, cel.pixels.height, 4, angle);
          pixelsBySource.set(cel.pixels, pixels);
        }
        let asepriteSamples = cel.asepriteSamples;
        if (asepriteSamples) {
          let rotated = sampleImageCopies.get(asepriteSamples);
          if (!rotated) {
            const result = rotateBytes(
              asepriteSamples.data,
              asepriteSamples.width,
              asepriteSamples.height,
              asepriteSamples.depth / BITS_PER_BYTE,
              angle,
            );
            rotated = {
              ...asepriteSamples,
              width: result.width,
              height: result.height,
              data: Uint8Array.from(result.data),
            };
            sampleImageCopies.set(asepriteSamples, rotated);
          }
          asepriteSamples = rotated;
        }
        const bounds = rotateCelBounds(document, cel, angle);
        changed = true;
        return {
          ...cel,
          pixels,
          asepriteSamples,
          x: Math.trunc(bounds.x),
          y: Math.trunc(bounds.y),
          ...(cel.preciseBounds ? { preciseBounds: bounds } : {}),
        };
      }),
    })),
  };
  document.timeline = changedTilemap ? finishTilemapTransform(next) : next;
  activateTimelineCel(document, next.activeFrame, next.activeLayer);
  return changed;
}

function shiftDocumentSelection(
  document: EditorDocument,
  dx: number,
  dy: number,
  palette: readonly Rgba[] | undefined,
): void {
  const mask = document.selection;
  if (!mask) return;
  const timeline = ensureTimeline(document);
  const active = timeline.frames[timeline.activeFrame].cels[timeline.activeLayer];
  if (!active) return;
  const left = Math.min(mask.x, active.x);
  const top = Math.min(mask.y, active.y);
  const right = Math.max(mask.x + mask.width, active.x + active.pixels.width);
  const bottom = Math.max(mask.y + mask.height, active.y + active.pixels.height);
  const width = right - left;
  const height = bottom - top;
  if (
    width < 1 ||
    height < 1 ||
    width > MAX_IMAGE_DIMENSION ||
    height > MAX_IMAGE_DIMENSION ||
    width * height > MAX_IMAGE_PIXELS
  )
    throw new EditorAllocationError(width, height, "cel");

  const depth = timeline.colorDepth;
  const activePalette =
    timeline.frames[timeline.activeFrame].palette ?? document.palette ?? palette;
  const background = !!(timeline.layers[timeline.activeLayer].flags & LAYER_BACKGROUND);
  const sourceSamples =
    active.asepriteSamples ??
    (depth === 8 || depth === 16
      ? encodeAsepriteSamples(
          active.pixels,
          depth,
          paletteForColors(activePalette),
          background ? -1 : (timeline.transparentIndex ?? 0),
        )
      : undefined);
  const stride = sourceSamples ? sourceSamples.depth / BITS_PER_BYTE : 0;
  const pixels: PixelBuffer = {
    width,
    height,
    data: new Uint8ClampedArray(width * height * 4),
  };
  const samples = sourceSamples
    ? { ...sourceSamples, width, height, data: new Uint8Array(width * height * stride) }
    : undefined;
  if (samples?.depth === 8) samples.data.fill(timeline.transparentIndex ?? 0);
  for (let y = 0; y < active.pixels.height; y++) {
    const target = ((active.y - top + y) * width + active.x - left) * 4;
    pixels.data.set(
      active.pixels.data.subarray(y * active.pixels.width * 4, (y + 1) * active.pixels.width * 4),
      target,
    );
    if (samples && sourceSamples)
      samples.data.set(
        sourceSamples.data.subarray(
          y * active.pixels.width * stride,
          (y + 1) * active.pixels.width * stride,
        ),
        (target / 4) * stride,
      );
  }
  const moved = new Uint8ClampedArray(mask.width * mask.height * 4);
  const movedSamples = samples ? new Uint8Array(mask.width * mask.height * stride) : undefined;
  const mod = (value: number, size: number) => ((value % size) + size) % size;
  for (let y = 0; y < mask.height; y++)
    for (let x = 0; x < mask.width; x++) {
      const from = (mask.y - top + y) * width + mask.x - left + x;
      moved.set(pixels.data.subarray(from * 4, from * 4 + 4), (y * mask.width + x) * 4);
      if (movedSamples && samples) {
        const sourceAt = from * stride;
        movedSamples.set(
          samples.data.subarray(sourceAt, sourceAt + stride),
          (y * mask.width + x) * stride,
        );
      }
    }
  for (let y = 0; y < mask.height; y++)
    for (let x = 0; x < mask.width; x++) {
      const to =
        (mask.y - top + mod(y + dy, mask.height)) * width + mask.x - left + mod(x + dx, mask.width);
      const at = (y * mask.width + x) * 4;
      pixels.data.set(moved.subarray(at, at + 4), to * 4);
      if (samples && movedSamples) {
        const sourceAt = (y * mask.width + x) * stride;
        samples.data.set(movedSamples.subarray(sourceAt, sourceAt + stride), to * stride);
      }
    }

  let trimLeft = width;
  let trimTop = height;
  let trimRight = -1;
  let trimBottom = -1;
  for (let y = 0; y < height; y++)
    for (let x = 0; x < width; x++) {
      const pixelAt = (y * width + x) * 4;
      const sampleAt = y * width + x;
      const opaque =
        samples?.depth === 8
          ? background || samples.data[sampleAt] !== (timeline.transparentIndex ?? 0)
          : samples?.depth === 16
            ? samples.data[sampleAt * 2 + 1] !== 0
            : pixels.data[pixelAt + 3] !== 0;
      if (opaque) {
        trimLeft = Math.min(trimLeft, x);
        trimTop = Math.min(trimTop, y);
        trimRight = Math.max(trimRight, x);
        trimBottom = Math.max(trimBottom, y);
      }
    }
  if (trimRight < trimLeft) {
    trimLeft = trimTop = 0;
    trimRight = width - 1;
    trimBottom = height - 1;
  }
  const outWidth = trimRight - trimLeft + 1;
  const outHeight = trimBottom - trimTop + 1;
  const outData = new Uint8ClampedArray(outWidth * outHeight * 4);
  const outSamples = samples
    ? {
        ...samples,
        width: outWidth,
        height: outHeight,
        data: new Uint8Array(outWidth * outHeight * stride),
      }
    : undefined;
  for (let y = 0; y < outHeight; y++) {
    outData.set(
      pixels.data.subarray(
        ((trimTop + y) * width + trimLeft) * 4,
        ((trimTop + y) * width + trimRight + 1) * 4,
      ),
      y * outWidth * 4,
    );
    if (outSamples && samples)
      outSamples.data.set(
        samples.data.subarray(
          ((trimTop + y) * width + trimLeft) * stride,
          ((trimTop + y) * width + trimRight + 1) * stride,
        ),
        y * outWidth * stride,
      );
  }
  const nextPixels = { width: outWidth, height: outHeight, data: outData };
  const nextCel = {
    ...active,
    x: left + trimLeft,
    y: top + trimTop,
    pixels: nextPixels,
    ...(outSamples ? { asepriteSamples: outSamples } : { asepriteSamples: undefined }),
  };
  const shared = active.asepriteSamples ?? active.pixels;
  const frames = timeline.frames.map((frame, frameIndex) => ({
    ...frame,
    cels: frame.cels.map((value, layerIndex) => {
      if (!value || (layerIndex === timeline.activeLayer && frameIndex === timeline.activeFrame))
        return layerIndex === timeline.activeLayer && frameIndex === timeline.activeFrame
          ? nextCel
          : value;
      if ((value.asepriteSamples ?? value.pixels) !== shared) return value;
      return {
        ...value,
        x: nextCel.x,
        y: nextCel.y,
        pixels: outSamples ? value.pixels : nextPixels,
        ...(outSamples ? { asepriteSamples: outSamples } : { asepriteSamples: undefined }),
      };
    }),
  }));
  document.timeline = { ...timeline, frames };
  if (outSamples) normalizeAsepriteDocument(document);
  activateTimelineCel(document, timeline.activeFrame, timeline.activeLayer);
}

function selectionAsepriteSamples(
  document: EditorDocument,
  mask: PixelMask,
  palette?: readonly Rgba[],
) {
  const pixels: PixelBuffer = {
    width: mask.width,
    height: mask.height,
    data: new Uint8ClampedArray(mask.width * mask.height * 4),
  };
  const timeline = document.timeline;
  const cel = timeline?.frames[timeline.activeFrame]?.cels[timeline.activeLayer];
  const sourceSamples = cel?.asepriteSamples;
  const depth = timeline?.colorDepth;
  const stride = sourceSamples
    ? sourceSamples.depth / BITS_PER_BYTE
    : depth === 8 || depth === 16
      ? depth / BITS_PER_BYTE
      : 0;
  const sourceSampleData = stride ? new Uint8Array(mask.width * mask.height * stride) : undefined;
  if (stride === 1 && sourceSampleData) sourceSampleData.fill(timeline?.transparentIndex ?? 0);
  for (let y = 0; y < mask.height; y++)
    for (let x = 0; x < mask.width; x++) {
      const maskAt = y * mask.width + x;
      if (!mask.data[maskAt]) continue;
      const docX = mask.x + x;
      const docY = mask.y + y;
      const localX = docX - document.layer.x;
      const localY = docY - document.layer.y;
      if (
        localX < 0 ||
        localY < 0 ||
        localX >= document.layer.pixels.width ||
        localY >= document.layer.pixels.height
      )
        continue;
      const sourceAt = (localY * document.layer.pixels.width + localX) * 4;
      pixels.data.set(document.layer.pixels.data.subarray(sourceAt, sourceAt + 4), maskAt * 4);
      if (sourceSampleData && sourceSamples) {
        const sourceSampleAt = (localY * sourceSamples.width + localX) * stride;
        sourceSampleData.set(
          sourceSamples.data.subarray(sourceSampleAt, sourceSampleAt + stride),
          maskAt * stride,
        );
      }
    }
  let asepriteSamples: AsepriteImageSamples | undefined;
  if (depth === 8 || depth === 16) {
    const layer = timeline?.layers[timeline.activeLayer];
    const transparentIndex = timeline?.transparentIndex ?? 0;
    const samples = sourceSampleData
      ? { depth, width: mask.width, height: mask.height, data: sourceSampleData }
      : undefined;
    asepriteSamples = encodeAsepriteSamples(
      pixels,
      depth,
      paletteForColors(
        timeline?.frames[timeline.activeFrame]?.palette ?? document.palette ?? palette,
      ),
      (layer?.flags ?? 0) & LAYER_BACKGROUND ? -1 : transparentIndex,
      samples,
    );
  }
  return { pixels, asepriteSamples };
}

export class SelectionEditController {
  constructor(private readonly port: SelectionEditPort) {}

  canRotateSelection(): boolean {
    const state = this.port.readProjection();
    return !!state && !(state.selection && state.activeLayer.tilemap && isTilesMode(state));
  }

  canShiftSelectionContents(): boolean {
    const state = this.port.readProjection();
    if (!state?.selection || !state.editable || state.activeLayer.tilemap) return false;
    if (!state.timelinePresent) return !state.emptyCel;
    if (
      !state.activeLayer.visible ||
      !state.activeLayer.editable ||
      state.activeLayer.group ||
      state.activeLayer.reference
    )
      return false;
    return state.activeLayer.celExists;
  }

  fillSelection(): boolean {
    return this.paintSelectionBoundary(false);
  }

  strokeSelection(): boolean {
    return this.paintSelectionBoundary(true);
  }

  private paintSelectionBoundary(stroke: boolean): boolean {
    let state = this.port.readProjection();
    if (!state?.editable || !state.selection || !this.port.resolvePendingCel()) return false;
    state = this.port.readProjection();
    if (!state?.selection) return false;
    if (
      state.timelinePresent &&
      (!state.activeLayer.visible ||
        !state.activeLayer.editable ||
        state.activeLayer.group ||
        state.activeLayer.reference)
    )
      return false;
    let changed = false;
    this.port.mutateDocument(
      stroke ? "Stroke Selection" : "Fill Selection",
      (document, transaction) => {
        const mask = document.selection;
        if (!mask || !mask.data.some(Boolean)) return;
        const paintMask = stroke ? selectionBorderMask(mask) : mask;
        if (state!.activeLayer.tilemap && isTilesMode(state!)) {
          const activeTimeline = ensureTimeline(document);
          const points = tilemapBrushPoints(
            { ...document, selection: paintMask },
            activeTimeline,
            { x: mask.x, y: mask.y },
            { x: mask.x + mask.width - 1, y: mask.y + mask.height - 1 },
            "filled_rectangle",
          );
          const next = applyTilemapPoints(activeTimeline, points, state!.selectedTile);
          if (next !== activeTimeline) {
            document.timeline = next;
            activateTimelineCel(document, next.activeFrame, next.activeLayer);
            changed = true;
          }
          return;
        }
        try {
          transaction.expandCel(document, mask);
        } catch (error) {
          if (!(error instanceof EditorAllocationError)) throw error;
          this.port.setAllocationError(error);
          this.port.setStatus(error.message);
          return;
        }
        const image = document.layer.pixels;
        const left = Math.max(mask.x, document.layer.x);
        const top = Math.max(mask.y, document.layer.y);
        const right = Math.min(mask.x + mask.width, document.layer.x + image.width);
        const bottom = Math.min(mask.y + mask.height, document.layer.y + image.height);
        if (right <= left || bottom <= top) return;
        transaction.captureHistory(image, {
          x: left - document.layer.x,
          y: top - document.layer.y,
          width: right - left,
          height: bottom - top,
        });
        const activeTimeline = ensureTimeline(document);
        const palette =
          activeTimeline.frames[activeTimeline.activeFrame].palette ??
          document.palette ??
          state!.palette;
        const color = libreSpriteWorkingBrushColor(
          state!.foreground,
          activeTimeline,
          palette,
          state!.foregroundIndex,
        );
        const index =
          activeTimeline.colorDepth === 8
            ? libreSpriteWorkingBrushIndex(
                state!.foreground,
                activeTimeline,
                palette,
                state!.foregroundIndex,
              )
            : undefined;
        const indexedPixelWriter =
          activeTimeline.colorDepth === 8 ? createAsepriteIndexWriter(document, index) : undefined;
        for (let y = top; y < bottom; y++)
          for (let x = left; x < right; x++) {
            const mx = x - mask.x;
            const my = y - mask.y;
            if (!paintMask.data[my * paintMask.width + mx]) continue;
            const px = x - document.layer.x;
            const py = y - document.layer.y;
            const at = (py * image.width + px) * 4;
            const indexChanged = indexedPixelWriter?.write(px, py, color, index) ?? false;
            if (
              !indexChanged &&
              color.every((value, channel) => value === image.data[at + channel])
            )
              continue;
            image.data.set(color, at);
            changed = true;
          }
        if (changed) {
          syncTimeline(document);
          normalizeAsepriteDocument(document);
          trimActiveCel(document);
        }
      },
    );
    return changed;
  }

  rotateSelection(degrees: number): boolean {
    if (!Number.isFinite(degrees)) return false;
    let state = this.port.readProjection();
    if (!state || !this.port.resolvePendingCel()) return false;
    state = this.port.readProjection();
    if (!state) return false;
    if (!state.selection) return this.rotateSelectedCelPixels(degrees);
    if (!state.editable) return false;
    if (state.timelinePresent && (!state.activeLayer.visible || !state.activeLayer.editable))
      return false;
    if (state.activeLayer.tilemap && isTilesMode(state)) {
      this.port.setStatus("Tiles mode does not support selection rotation; switch to Pixels mode");
      this.port.publish();
      return false;
    }
    this.port.setTool("marquee");
    if (
      !this.port.readTransformSession().transform &&
      !this.port.beginSelectionTransform(
        "move",
        this.port.readProjection()?.pointer ?? { x: 0, y: 0 },
      )
    )
      return false;
    const current = this.port.readTransformSession();
    if (!current.transform || !current.floating) return false;
    const next = rotateSelectionTransform(current.transform, degrees);
    try {
      const rendered = rasterizeSelectionTransform(next);
      this.port.updateTransformSession(
        next,
        rendered.mask,
        {
          ...current.floating,
          asepriteSamples: current.floating.sourceAsepriteSamples
            ? this.port.transformFloatingAsepriteSamples(
                current.floating.sourceAsepriteSamples,
                next,
                current.floating.sourceTransparentIndex,
              )
            : undefined,
          pixels: rendered.pixels,
          x: rendered.mask.x,
          y: rendered.mask.y,
        },
        true,
      );
      this.port.setStatus("Move selection; Enter to commit, Escape to cancel");
      this.port.setAllocationError(null);
      this.port.publish();
      return true;
    } catch (error) {
      if (!(error instanceof EditorAllocationError)) throw error;
      this.port.setAllocationError(error);
      this.port.setStatus(error.message);
      this.port.publish();
      return false;
    }
  }

  private rotateSelectedCelPixels(degrees: number): boolean {
    const angle =
      degrees === 90 || degrees === 180 || degrees === -90 ? degrees : Math.trunc(degrees);
    if (angle !== 90 && angle !== 180 && angle !== -90) return false;
    let changed = false;
    try {
      this.port.mutateDocument(`Rotate Selection (${angle} degrees)`, (document) => {
        changed = rotateDocumentCels(document, angle);
      });
      return changed;
    } catch (error) {
      if (!(error instanceof EditorAllocationError)) throw error;
      this.port.setAllocationError(error);
      this.port.setStatus(error.message);
      this.port.publish(true);
      return false;
    }
  }

  shiftSelectionContents(dx: number, dy: number): boolean {
    let state = this.port.readProjection();
    if (
      !Number.isInteger(dx) ||
      !Number.isInteger(dy) ||
      !state?.selection ||
      !state.editable ||
      (!dx && !dy)
    )
      return false;
    if (!this.port.resolvePendingCel()) return false;
    state = this.port.readProjection();
    if (!state?.selection) return false;
    if (state.timelinePresent && (!state.activeLayer.visible || !state.activeLayer.editable))
      return false;
    if (state.activeLayer.tilemap) {
      this.port.setStatus("Wrapped content shift is unavailable for Tilemap layers");
      this.port.publish();
      return false;
    }
    if (!state.activeLayer.celExists && state.timelinePresent) return false;
    if (!state.timelinePresent && state.emptyCel) return false;
    this.port.mutateDocument("Shift Selection Content", (document) => {
      shiftDocumentSelection(document, dx, dy, state!.palette);
    });
    return true;
  }

  flipSelection(orientation: FlipOrientation): void {
    let state = this.port.readProjection();
    if (
      !state?.selection ||
      !state.editable ||
      (orientation !== FlipOrientation.Horizontal && orientation !== FlipOrientation.Vertical)
    )
      return;
    if (!this.port.resolvePendingCel()) return;
    state = this.port.readProjection();
    if (!state?.selection) return;
    if (state.activeLayer.tilemap && isTilesMode(state)) {
      this.port.flipTilemapSelection(orientation);
      return;
    }
    this.port.mutateDocument("Flip Selection", (document, transaction) => {
      const mask = document.selection;
      if (!mask) return;
      const source = selectionAsepriteSamples(document, mask, state!.palette);
      const width = mask.width;
      const height = mask.height;
      transaction.expandCel(document, mask);
      const image = document.layer.pixels;
      const localX = mask.x - document.layer.x;
      const localY = mask.y - document.layer.y;
      transaction.captureHistory(image, { x: localX, y: localY, width, height });
      const depth8Native = source.asepriteSamples?.depth === 8;
      const indexWriter: AsepriteIndexWriter | undefined = depth8Native
        ? createAsepriteIndexWriter(document, undefined)
        : undefined;
      const nextMask = { ...mask, data: new Uint8Array(mask.data.length) };
      const clear = transaction.activeLayerClearColor(document);
      const timeline = document.timeline;
      const activeLayer = timeline?.layers[timeline.activeLayer];
      for (let y = 0; y < height; y++)
        for (let x = 0; x < width; x++)
          if (mask.data[y * width + x]) {
            const px = localX + x;
            const py = localY + y;
            if (px < 0 || py < 0 || px >= image.width || py >= image.height) continue;
            image.data.set(clear, (py * image.width + px) * 4);
            indexWriter?.write(
              px,
              py,
              clear,
              (activeLayer?.flags ?? 0) & LAYER_BACKGROUND
                ? undefined
                : (timeline?.transparentIndex ?? 0),
            );
          }
      for (let y = 0; y < height; y++)
        for (let x = 0; x < width; x++) {
          const sourceX = orientation === FlipOrientation.Horizontal ? width - 1 - x : x;
          const sourceY = orientation === FlipOrientation.Vertical ? height - 1 - y : y;
          const from = sourceY * width + sourceX;
          if (!mask.data[from]) continue;
          nextMask.data[y * width + x] = UINT8_MAX;
          const px = localX + x;
          const py = localY + y;
          if (px < 0 || py < 0 || px >= image.width || py >= image.height) continue;
          const color = source.pixels.data.subarray(from * 4, from * 4 + 4);
          image.data.set(color, (py * image.width + px) * 4);
          indexWriter?.write(
            px,
            py,
            [color[0], color[1], color[2], color[3]],
            source.asepriteSamples?.data[from],
          );
        }
      document.selection = nextMask;
    });
  }

  clearSelectionPixels(keepSelection = false): void {
    let state = this.port.readProjection();
    if (state?.tool === "slice") {
      this.port.deleteSelectedSlices();
      return;
    }
    if (!state?.editable) return;
    if (state.activeLayer.tilemap && isTilesMode(state)) {
      this.port.mutateDocument("Clear", (document) => {
        const timeline = ensureTimeline(document);
        const map = timeline.frames[timeline.activeFrame].cels[timeline.activeLayer]?.tilemap;
        if (!map) return;
        const points = tilemapBrushPoints(
          document,
          timeline,
          { x: 0, y: 0 },
          { x: map.width - 1, y: map.height - 1 },
          "filled_rectangle",
        );
        document.timeline = applyTilemapPoints(timeline, points, 0);
        activateTimelineCel(document, document.timeline.activeFrame, document.timeline.activeLayer);
        document.hiddenSelection = keepSelection ? null : document.selection;
        if (!keepSelection) document.selection = null;
      });
      return;
    }
    this.port.mutateDocument("Clear", (document, transaction) => {
      const image = document.layer.pixels;
      const mask = document.selection;
      const left = mask ? Math.max(0, mask.x - document.layer.x) : 0;
      const top = mask ? Math.max(0, mask.y - document.layer.y) : 0;
      const right = mask
        ? Math.min(image.width, mask.x - document.layer.x + mask.width)
        : image.width;
      const bottom = mask
        ? Math.min(image.height, mask.y - document.layer.y + mask.height)
        : image.height;
      transaction.captureHistory(image, {
        x: left,
        y: top,
        width: Math.max(0, right - left),
        height: Math.max(0, bottom - top),
      });
      const clearColor = transaction.activeLayerClearColor(document);
      if (!mask) {
        for (let offset = 0; offset < image.data.length; offset += 4)
          image.data.set(clearColor, offset);
      } else {
        for (let y = top; y < bottom; y++)
          for (let x = left; x < right; x++)
            if (maskContains(mask, { x: x + document.layer.x, y: y + document.layer.y }))
              image.data.set(clearColor, (y * image.width + x) * 4);
      }
      document.hiddenSelection = keepSelection ? null : (mask ?? document.hiddenSelection);
      if (!keepSelection) document.selection = null;
      syncTimeline(document);
      normalizeAsepriteDocument(document);
      trimActiveCel(document);
    });
  }

  nudgeSelection(dx: number, dy: number, boundsOnly = false): boolean {
    const state = this.port.readProjection();
    if (!Number.isFinite(dx) || !Number.isFinite(dy) || !state?.selection) return false;
    const deltaX = Math.trunc(dx);
    const deltaY = Math.trunc(dy);
    if (state.activeLayer.tilemap && isTilesMode(state))
      return this.port.nudgeTilemapSelection(deltaX, deltaY);
    if (!this.port.beginSelectionTransform(boundsOnly ? "bounds" : "move", { x: 0, y: 0 }))
      return false;
    if (boundsOnly) return this.port.finishSelectionBoundsNudge(deltaX, deltaY);
    const session = this.port.readTransformSession();
    if (!session.transform || !session.floating || !session.mask) return false;
    const next = dragSelectionTransform(
      session.transform,
      "move",
      { x: 0, y: 0 },
      { x: deltaX, y: deltaY },
    );
    const mask = {
      ...session.mask,
      x: session.mask.x + deltaX,
      y: session.mask.y + deltaY,
    };
    this.port.updateTransformSession(
      next,
      mask,
      { ...session.floating, x: session.floating.x + deltaX, y: session.floating.y + deltaY },
      true,
    );
    this.port.publish();
    return true;
  }
}
