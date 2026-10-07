import type { EditorDocument } from "$/document/types";
import { defaultAnimalCrossingSettings } from "$/import-export/animal-crossing/codec";
import { renderExport } from "$/import-export/image/export-plan";
import { TILESET_EMBEDDED_PIXELS_FLAG } from "$/tilemap";
import { layerAncestors } from "$/timeline";

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
  }
  return { name: document.name, pixels, settings };
}
