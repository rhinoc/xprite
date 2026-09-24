import { useCallback, type CSSProperties } from "react";

import { useColorProfile } from "$/components/tools/color-profile";
import { PALETTE_COLOR_CHANNEL_MAX as UINT8_MAX } from "$/managers/palette/palette-operations";
import { getPaletteSelectionFrames as paletteSelectionGeometry } from "$/managers/palette/palette-view";
import { displayEditorColorInSrgb as colorProfileToSrgb } from "$/managers/tools/color-control";
import { CanvasSurface, type SurfaceBounds } from "@xprite/ui";
import {
  paintUiText,
  measureUiText,
  paintUiPart,
  useUiAssets,
  type UiAssets,
} from "@xprite/ui/assets";

export type PaletteRgba = readonly [number, number, number, number];
export interface PaletteSurfaceProps {
  /** Aseprite-scene outer frame; defaults to the historical library specimen. */
  bounds?: SurfaceBounds;
  colors: readonly PaletteRgba[];
  foregroundIndex?: number | null;
  backgroundIndex?: number | null;
  transparentIndex?: number | null;
  selectedIndex?: number | null;
  selectedIndices?: readonly number[];
  selectionHot?: boolean;
  /** PaletteView shows destination indices while dragging selected colors. */
  dragIndices?: readonly number[];
  columns?: number;
  /** Source GUI units; physical cells are twice this size. */
  boxSize?: number;
  scrollY?: number;
  showScrollbar?: boolean;
  contentHeight?: number;
  tileset?: { pixels: Uint8Array; tileWidth: number; tileHeight: number };
  showResizeHandle?: boolean;
  className?: string;
  style?: CSSProperties;
}

/** Aseprite screenshot coordinate system, with layout derived from PaletteView. */
const asepritePaletteBounds = { x: 4, y: 102, width: 148, height: 672 };
function paintPart(
  context: CanvasRenderingContext2D,
  assets: UiAssets,
  name: "editor_normal" | "colorbar_selection" | "colorbar_selection_hot",
  x: number,
  y: number,
  width: number,
  height: number,
) {
  const part = assets.style.parts[name];
  const [left, middleWidth, right, top, middleHeight, bottom] = part.slices ?? [0, 0, 0, 0, 0, 0];
  const widths = [left, middleWidth, right];
  const heights = [top, middleHeight, bottom];
  const destinationWidths = [left * 2, Math.max(0, width - (left + right) * 2), right * 2];
  const destinationHeights = [top * 2, Math.max(0, height - (top + bottom) * 2), bottom * 2];
  let sy = part.y;
  let dy = y;
  for (let row = 0; row < 3; row++) {
    let sx = part.x;
    let dx = x;
    for (let column = 0; column < 3; column++) {
      if (row !== 1 || column !== 1) {
        context.drawImage(
          assets.sheet,
          sx,
          sy,
          widths[column],
          heights[row],
          dx,
          dy,
          destinationWidths[column],
          destinationHeights[row],
        );
      }
      sx += widths[column];
      dx += destinationWidths[column];
    }
    sy += heights[row];
    dy += destinationHeights[row];
  }
}

/**
 * A source-driven palette painter. The owning Palette supplies semantic DOM
 * options and hit areas; this surface only paints the Aseprite pixel skin.
 * Colors and markers are recomputed whenever the corresponding props change.
 */
export function PaletteSurface({
  bounds = asepritePaletteBounds,
  colors,
  foregroundIndex,
  backgroundIndex,
  transparentIndex,
  selectedIndex,
  selectedIndices,
  selectionHot = false,
  dragIndices,
  columns = 5,
  boxSize = 11,
  scrollY = 0,
  showScrollbar = false,
  contentHeight,
  tileset,
  showResizeHandle = true,
  className,
  style,
}: PaletteSurfaceProps) {
  const assets = useUiAssets(),
    colorProfile = useColorProfile();
  const origin = { x: bounds.x + 8, y: bounds.y + 8 };
  const inner = {
    x: bounds.x + 6,
    y: bounds.y + 6,
    width: Math.max(0, bounds.width - 12),
    height: Math.max(0, bounds.height - 12),
  };
  const scrollContentHeight = contentHeight ?? inner.height;
  const cellSize = Math.floor(Math.max(4, Math.min(32, boxSize)) * 2),
    pitch = cellSize + 2;
  const checkerSize = Math.max(2, Math.floor(cellSize / 4) * 2);
  const paint = useCallback(
    (context: CanvasRenderingContext2D) => {
      if (!assets) return;
      const sheet = assets.sheet;
      const columnCount = Math.max(1, Math.floor(columns));
      context.imageSmoothingEnabled = false;
      context.fillStyle = assets.style.colors.editor_face;
      context.fillRect(bounds.x, bounds.y, bounds.width, bounds.height);
      paintPart(context, assets, "editor_normal", bounds.x, bounds.y, bounds.width, bounds.height);
      context.save();
      context.beginPath();
      context.rect(
        inner.x,
        inner.y,
        Math.max(0, inner.width - (showScrollbar ? 12 : 0)),
        inner.height,
      );
      context.clip();
      // Only rasterize visible rows; RGB palettes can contain more than 256 entries.
      const first = Math.max(0, Math.floor(scrollY / pitch) - 1) * columnCount;
      const last = Math.min(
        colors.length,
        (Math.ceil((scrollY + inner.height) / pitch) + 1) * columnCount,
      );
      for (let index = first; index < last; index++) {
        const [r, g, b, alpha] = colors[index];
        const x = origin.x + (index % columnCount) * pitch;
        const y = origin.y + Math.floor(index / columnCount) * pitch - scrollY;
        context.fillStyle = assets.style.colors.palette_entries_separator;
        // PaletteView::drawEntry enlarges each separator, then fills the cell.
        context.fillRect(x - 2, y - 2, cellSize + 4, cellSize + 4);
        // draw_color uses floor(11 / 2) UI pixels and restarts light-first.
        if (tileset || alpha !== UINT8_MAX) {
          for (let cy = 0; cy < cellSize; cy += checkerSize) {
            for (let cx = 0; cx < cellSize; cx += checkerSize) {
              context.fillStyle =
                (cx / checkerSize + cy / checkerSize) % 2 === 0 ? "#c0c0c0" : "#808080";
              context.fillRect(
                x + cx,
                y + cy,
                Math.min(checkerSize, cellSize - cx),
                Math.min(checkerSize, cellSize - cy),
              );
            }
          }
        }
        if (tileset) {
          const { pixels, tileWidth, tileHeight } = tileset;
          const stride = tileWidth * tileHeight * 4,
            offset = index * stride;
          if (index > 0 && pixels.length >= offset + stride) {
            const source = document.createElement("canvas");
            source.width = tileWidth;
            source.height = tileHeight;
            source
              .getContext("2d")
              ?.putImageData(
                new ImageData(
                  new Uint8ClampedArray(pixels.subarray(offset, offset + stride)),
                  tileWidth,
                  tileHeight,
                ),
                0,
                0,
              );
            context.drawImage(source, x, y, cellSize, cellSize);
          }
        } else {
          const [displayR, displayG, displayB] = colorProfileToSrgb([r, g, b, alpha], colorProfile);
          context.fillStyle = `rgba(${displayR},${displayG},${displayB},${Math.max(0, Math.min(UINT8_MAX, alpha)) / UINT8_MAX})`;
          context.fillRect(x, y, cellSize, cellSize);
        }
        const negative = tileset
          ? "#fff"
          : r * 0.299 + g * 0.587 + b * 0.114 > 127
            ? "#000"
            : "#fff";
        context.fillStyle = negative;
        if (index === foregroundIndex) {
          for (let offset = 0; offset < Math.floor(cellSize / 2); offset += 2)
            context.fillRect(x, y + offset, Math.floor(cellSize / 2) - offset, 2);
        }
        if (index === backgroundIndex) {
          for (let offset = 0; offset < Math.floor(cellSize / 4); offset += 2)
            context.fillRect(
              x + cellSize - offset - 2,
              y + cellSize - Math.floor(cellSize / 4) + offset,
              offset + 2,
              2,
            );
        }
        if (index === transparentIndex)
          context.fillRect(x + Math.floor(cellSize / 2), y + Math.floor(cellSize / 2), 2, 2);
        if (assets && dragIndices?.includes(index)) {
          const text = String(index);
          paintUiText(
            context,
            assets,
            text,
            x + Math.floor((cellSize - measureUiText(text, "mini")) / 4) * 2,
            y + Math.floor((cellSize - 10) / 4) * 2,
            { font: "mini", color: negative },
          );
        }
      }
      const handle = assets.style.parts.pal_resize;
      const handleX =
        origin.x + (colors.length % columnCount) * pitch + Math.floor(cellSize / 2) - handle.width;
      const handleY =
        origin.y +
        Math.floor(colors.length / columnCount) * pitch -
        scrollY +
        Math.floor(cellSize / 2) -
        handle.height;
      if (showResizeHandle && !dragIndices)
        context.drawImage(
          sheet,
          handle.x,
          handle.y,
          handle.width,
          handle.height,
          handleX,
          handleY,
          handle.width * 2,
          handle.height * 2,
        );
      for (const { box, clip } of paletteSelectionGeometry(
        selectedIndices ?? (selectedIndex == null ? [] : [selectedIndex]),
        colors.length,
        columnCount,
        { cellSize, scrollY, origin },
      )) {
        context.save();
        context.beginPath();
        context.rect(clip.x, clip.y, clip.width, clip.height);
        context.clip();
        paintPart(
          context,
          assets,
          selectionHot ? "colorbar_selection_hot" : "colorbar_selection",
          box.x,
          box.y,
          box.width,
          box.height,
        );
        context.restore();
      }
      context.restore();
      if (showScrollbar && assets) {
        paintUiPart(
          context,
          assets,
          "mini_scrollbar_bg",
          inner.x + inner.width - 12,
          inner.y,
          12,
          inner.height,
        );
        const thumbHeight = Math.max(
          48,
          Math.floor((inner.height * inner.height) / scrollContentHeight),
        );
        const thumbTop =
          inner.y +
          Math.floor(
            (scrollY / Math.max(1, scrollContentHeight - inner.height)) *
              (inner.height - thumbHeight),
          );
        paintUiPart(
          context,
          assets,
          "mini_scrollbar_thumb",
          inner.x + inner.width - 12,
          thumbTop,
          12,
          thumbHeight,
        );
      }
    },
    [
      colors,
      foregroundIndex,
      backgroundIndex,
      transparentIndex,
      selectedIndex,
      selectedIndices,
      selectionHot,
      dragIndices,
      tileset,
      showResizeHandle,
      assets,
      colorProfile,
      columns,
      cellSize,
      checkerSize,
      scrollY,
      showScrollbar,
      scrollContentHeight,
      bounds.x,
      bounds.y,
      bounds.width,
      bounds.height,
      origin.x,
      origin.y,
      inner.x,
      inner.y,
      inner.width,
      inner.height,
    ],
  );

  return (
    <CanvasSurface
      bounds={bounds}
      paint={paint}
      aria-hidden="true"
      className={className}
      style={{ pointerEvents: "none", ...style }}
    />
  );
}
