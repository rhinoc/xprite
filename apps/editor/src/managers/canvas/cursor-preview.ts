import type { CursorPreferences } from "$/managers/preferences/cursor-preferences";
import {
  blurStroke,
  brushMask,
  colorProfileToSrgb,
  eraseStroke,
  isBackgroundLayer,
  isSelectionTool,
  libreSpriteWorkingBrushColor,
  jumbleStroke,
  JumbleStrokeScratch,
  UINT8_MAX,
  paintStroke,
  rasterizeTilemap,
  renderTimelineViewport,
  samplePixel,
  snapStrokePoint,
  TilemapDisplayMode,
  workingColorProfile,
  type EditorSnapshot,
  type Point,
  type RasterOptions,
} from "@xprite/editor-core";

const EFFECT_SAMPLE_MARGIN = 1;
const RGBA_CHANNELS = 4;
const EMPTY_TILE = 0;

/** Presentation-only hover data; never enters document state or history. */
export function cursorPreviewGeometry(
  state: EditorSnapshot,
  pointer: Point,
  preferences: CursorPreferences,
) {
  const timeline = state.document?.timeline;
  const layer = timeline?.layers[timeline.activeLayer];
  const set =
    layer?.kind === "tilemap" &&
    (state.settings.tilemapMode ?? TilemapDisplayMode.Tiles) === TilemapDisplayMode.Tiles
      ? timeline?.tilesets?.find((item) => item.id === layer.tilesetId)
      : undefined;
  let mask =
    state.settings.tool === "bucket" || isSelectionTool(state.settings.tool)
      ? { x: 0, y: 0, width: 1, height: 1, data: new Uint8Array([1]) }
      : brushMask(state.settings.brush);
  let at = { x: Math.floor(pointer.x), y: Math.floor(pointer.y) };
  if (set && timeline) {
    const cel = timeline.frames[timeline.activeFrame].cels[timeline.activeLayer];
    const x = cel?.x ?? timeline.gridBounds?.x ?? 0;
    const y = cel?.y ?? timeline.gridBounds?.y ?? 0;
    at = {
      x: x + Math.floor((at.x - x) / set.tileWidth) * set.tileWidth,
      y: y + Math.floor((at.y - y) / set.tileHeight) * set.tileHeight,
    };
    mask = {
      x: 0,
      y: 0,
      width: set.tileWidth,
      height: set.tileHeight,
      data: new Uint8Array(set.tileWidth * set.tileHeight).fill(1),
    };
  } else if (preferences.snapToGrid && state.view.snapToGrid) {
    at = snapStrokePoint(
      at,
      {
        x: state.view.gridX ?? 0,
        y: state.view.gridY ?? 0,
        width: state.view.gridWidth,
        height: state.view.gridHeight,
      },
      isSelectionTool(state.settings.tool) ? { x: 0, y: 0 } : { x: -mask.x, y: -mask.y },
    );
  }
  return { at, mask, tileset: set };
}

/** Render a single brush stamp on an isolated cel crop, then composite its layers. */
export function cursorPreviewRaster(
  state: EditorSnapshot,
  geometry: ReturnType<typeof cursorPreviewGeometry>,
) {
  const doc = state.document;
  const timeline = doc?.timeline;
  if (!doc || !timeline) return null;
  const { at, mask, tileset } = geometry;
  const bounds = { x: at.x + mask.x, y: at.y + mask.y, width: mask.width, height: mask.height };
  const margin =
    !tileset && ["blur", "jumble"].includes(state.settings.tool) ? EFFECT_SAMPLE_MARGIN : 0;
  const crop = {
    x: bounds.x - margin,
    y: bounds.y - margin,
    width: bounds.width + margin * 2,
    height: bounds.height + margin * 2,
  };
  const pixels = {
    width: crop.width,
    height: crop.height,
    data: new Uint8ClampedArray(crop.width * crop.height * RGBA_CHANNELS),
  };
  for (let y = 0; y < crop.height; y++)
    for (let x = 0; x < crop.width; x++) {
      pixels.data.set(
        samplePixel(doc.layer.pixels, { x: crop.x + x - doc.layer.x, y: crop.y + y - doc.layer.y }),
        (y * crop.width + x) * RGBA_CHANNELS,
      );
    }
  if (tileset) {
    const tile =
      state.settings.tool === "eraser" ? EMPTY_TILE : (state.settings.selectedTile ?? EMPTY_TILE);
    const image = rasterizeTilemap(
      { width: 1, height: 1, tiles: new Uint32Array([tile]) },
      tileset,
      timeline.colorDepth,
      doc.palette ?? state.palette,
      timeline.transparentIndex,
    );
    pixels.data.set(image.data);
  } else {
    const color = libreSpriteWorkingBrushColor(
      state.settings.foreground,
      timeline,
      doc.palette ?? state.palette,
      state.settings.foregroundIndex ?? undefined,
      state.settings.ink,
    );
    const options: RasterOptions = {
      brush:
        state.settings.tool === "bucket" || isSelectionTool(state.settings.tool)
          ? { ...state.settings.brush, shape: "square", size: 1, angle: 0 }
          : state.settings.brush,
      color,
      opacity: state.settings.opacity,
      ink: state.settings.ink,
      shade: state.settings.shade,
      destinationPalette: doc.palette ?? state.palette,
      destinationTransparentIndex: timeline.transparentIndex,
      patternOrigin: { x: -crop.x, y: -crop.y },
      selection: doc.selection
        ? { ...doc.selection, x: doc.selection.x - crop.x, y: doc.selection.y - crop.y }
        : undefined,
      eraseColor: isBackgroundLayer(timeline.layers[timeline.activeLayer])
        ? state.settings.background
        : undefined,
    };
    const points = [{ x: at.x - crop.x, y: at.y - crop.y }];
    if (state.settings.tool === "eraser") eraseStroke(pixels, points, options);
    else if (state.settings.tool === "blur") blurStroke(pixels, points, options);
    else if (state.settings.tool === "jumble")
      jumbleStroke(pixels, [{ points, options }], new JumbleStrokeScratch());
    else paintStroke(pixels, points, options);
  }
  const frame = timeline.frames[timeline.activeFrame];
  const current = frame.cels[timeline.activeLayer];
  const preview = {
    ...timeline,
    frames: timeline.frames.map((item, index) =>
      index === timeline.activeFrame
        ? {
            ...item,
            cels: item.cels.map((cel, layer) =>
              layer === timeline.activeLayer
                ? {
                    ...current,
                    pixels,
                    x: crop.x,
                    y: crop.y,
                    opacity: current?.opacity ?? UINT8_MAX,
                    zIndex: current?.zIndex ?? 0,
                    asepriteSamples: undefined,
                  }
                : cel,
            ),
          }
        : item,
    ),
  };
  const result = renderTimelineViewport(preview, { ...bounds, zoom: 1 });
  const profile = workingColorProfile(timeline);
  for (let offset = 0; offset < result.data.length; offset += RGBA_CHANNELS) {
    const color = colorProfileToSrgb(
      [
        result.data[offset],
        result.data[offset + 1],
        result.data[offset + 2],
        result.data[offset + 3],
      ],
      profile,
    );
    result.data.set(color, offset);
  }
  return { pixels: result, ...bounds };
}
