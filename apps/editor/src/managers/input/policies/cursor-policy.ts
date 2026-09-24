/** Contrast threshold follows LibreSprite's GPLv2 `blackandwhite_neg` rule. */
export function cursorNeedsWhite(red: number, green: number, blue: number): boolean {
  return red * 30 + green * 59 + blue * 11 < 12800;
}

/** Footprint visibility follows LibreSprite's GPLv2 brush-preview policy. */
export function usesBrushBoundaryCursor(
  tool: string,
  size: number,
  zoom: number,
  previewEnabled: boolean,
  transparentInk: boolean,
): boolean {
  return (
    previewEnabled &&
    (tool === "bucket" ? 1 : size) > 1 / zoom &&
    (tool === "eraser" || tool === "blur" || transparentInk)
  );
}
