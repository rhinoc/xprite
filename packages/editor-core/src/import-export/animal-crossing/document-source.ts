import type { EditorDocument } from "$/document/types";
import {
  MAX_ANIMAL_CROSSING_PATTERNS,
  defaultAnimalCrossingSettings,
} from "$/import-export/animal-crossing/codec";
import { renderExport } from "$/import-export/image/export-plan";
import { TILESET_EMBEDDED_PIXELS_FLAG } from "$/tilemap";
import { layerAncestors } from "$/timeline";

function fitPatternCount(
  pixels: Pick<EditorDocument, "width" | "height">,
  settings: ReturnType<typeof defaultAnimalCrossingSettings>,
  stepWidth = 1,
  stepHeight = 1,
) {
  if (settings.offsetX >= pixels.width) settings.offsetX = 0;
  if (settings.offsetY >= pixels.height) settings.offsetY = 0;
  const count = () =>
    Math.ceil((pixels.width - settings.offsetX) / (settings.cellWidth + settings.spacingX)) *
    Math.ceil((pixels.height - settings.offsetY) / (settings.cellHeight + settings.spacingY));
  const initialCount = count();
  if (initialCount <= MAX_ANIMAL_CROSSING_PATTERNS) return;
  const factor = Math.ceil(Math.sqrt(initialCount / MAX_ANIMAL_CROSSING_PATTERNS));
  settings.cellWidth = Math.min(pixels.width, settings.cellWidth * factor);
  settings.cellHeight = Math.min(pixels.height, settings.cellHeight * factor);
  while (count() > MAX_ANIMAL_CROSSING_PATTERNS) {
    settings.cellWidth = Math.min(pixels.width, settings.cellWidth + Math.max(1, stepWidth));
    settings.cellHeight = Math.min(pixels.height, settings.cellHeight + Math.max(1, stepHeight));
  }
}

/** Export a visible frame, using its visible tilemap grid as the initial slicing geometry. */
export function animalCrossingDocumentSource(
  document: EditorDocument,
  frame = document.timeline?.activeFrame ?? 0,
) {
  const timeline = document.timeline;
  const visibleTilemaps =
    timeline?.layers.filter(
      (layer, index) =>
        layer.kind === "tilemap" &&
        layer.visible &&
        layerAncestors(timeline, index).every((parent) => parent.visible),
    ) ?? [];
  for (const layer of visibleTilemaps) {
    const tileset = timeline?.tilesets?.find((tileset) => tileset.id === layer.tilesetId);
    if (tileset?.external && !(tileset.flags & TILESET_EMBEDDED_PIXELS_FLAG))
      throw new Error("Embed external tilesets in Aseprite before exporting this design.");
  }
  const pixels = renderExport(document, {
    name: "pattern.png",
    scalePercent: 100,
    area: "canvas",
    layers: "visible",
    frame,
    frames: "current",
  });
  const settings = defaultAnimalCrossingSettings(pixels);
  settings.title = document.name.replace(/\.[^.]+$/, "").slice(0);
  const active = timeline?.layers[timeline.activeLayer];
  const layer = active && visibleTilemaps.includes(active) ? active : visibleTilemaps[0];
  const tileset = layer
    ? timeline?.tilesets?.find((tileset) => tileset.id === layer.tilesetId)
    : undefined;
  if (tileset && layer) {
    settings.cellWidth = tileset.tileWidth;
    settings.cellHeight = tileset.tileHeight;
    const index = timeline!.layers.indexOf(layer);
    const cel = timeline!.frames[frame]?.cels[index];
    if (cel) {
      settings.offsetX = ((cel.x % tileset.tileWidth) + tileset.tileWidth) % tileset.tileWidth;
      settings.offsetY = ((cel.y % tileset.tileHeight) + tileset.tileHeight) % tileset.tileHeight;
    }
    const tileWidth = Math.max(1, tileset.tileWidth);
    const tileHeight = Math.max(1, tileset.tileHeight);
    const patternCount = () =>
      Math.ceil((pixels.width - settings.offsetX) / (settings.cellWidth + settings.spacingX)) *
      Math.ceil((pixels.height - settings.offsetY) / (settings.cellHeight + settings.spacingY));
    if (
      settings.offsetX >= pixels.width ||
      settings.offsetY >= pixels.height ||
      patternCount() > MAX_ANIMAL_CROSSING_PATTERNS
    ) {
      const fallback = defaultAnimalCrossingSettings(pixels);
      settings.offsetX = 0;
      settings.offsetY = 0;
      settings.cellWidth = Math.min(
        pixels.width,
        Math.ceil(Math.max(fallback.cellWidth, tileWidth) / tileWidth) * tileWidth,
      );
      settings.cellHeight = Math.min(
        pixels.height,
        Math.ceil(Math.max(fallback.cellHeight, tileHeight) / tileHeight) * tileHeight,
      );
      fitPatternCount(pixels, settings, tileWidth, tileHeight);
    }
  }
  return { name: document.name, pixels, settings };
}
