const RASTER_EDGE_MARGIN = 1;
const RASTER_PHASE_GRID = 64;
const MAX_EXACT_RASTER_COORDINATE = 32768;

/** Dyadic transforms in this range retain the full-image browser sampling phase
 * when a cel is cropped. Other transforms keep the original document raster. */
export function canOffsetRaster(
  origin: { x: number; y: number },
  document: { width: number; height: number },
  scale: number,
) {
  return (
    Number.isInteger(Math.log2(scale)) &&
    Number.isInteger(origin.x * RASTER_PHASE_GRID) &&
    Number.isInteger(origin.y * RASTER_PHASE_GRID) &&
    Math.max(
      Math.abs(origin.x),
      Math.abs(origin.y),
      Math.abs(origin.x + document.width * scale),
      Math.abs(origin.y + document.height * scale),
    ) < MAX_EXACT_RASTER_COORDINATE
  );
}

/** A transparent margin keeps browser image-edge coverage away from cel pixels.
 * Clip the padded image to the document so its outer edges match the original
 * document composite, including fractional pan/zoom and off-canvas cels. */
export function rasterUploadLayout(
  raster: { x: number; y: number; pixels: { width: number; height: number } },
  document: { width: number; height: number },
  scale: number,
) {
  const padding = Math.max(RASTER_EDGE_MARGIN, Math.ceil(1 / scale)) + RASTER_EDGE_MARGIN;
  const x = Math.max(0, Math.min(document.width, raster.x - padding));
  const y = Math.max(0, Math.min(document.height, raster.y - padding));
  const right = Math.max(x, Math.min(document.width, raster.x + raster.pixels.width + padding));
  const bottom = Math.max(y, Math.min(document.height, raster.y + raster.pixels.height + padding));
  return {
    x,
    y,
    width: right - x,
    height: bottom - y,
    writeX: raster.x - x,
    writeY: raster.y - y,
  };
}
