import type { UiPartDefinition } from "$/base/theme/theme-types";

/** Paint the same rectangular theme surface used by DOM controls, in canvas pixels. */
export function paintPartSurface(
  context: CanvasRenderingContext2D,
  surface: NonNullable<UiPartDefinition["surface"]>,
  colors: Record<string, string>,
  x: number,
  y: number,
  width: number,
  height: number,
  options: { face?: string; ink?: string; drawCenter?: boolean } = {},
): boolean {
  if (
    surface.frame ||
    surface.radius ||
    surface.shadow ||
    surface.pixelCircle ||
    surface.mark ||
    surface.titlebar
  )
    return false;
  const face = options.face ?? (surface.faceRole ? colors[surface.faceRole] : undefined);
  if (face && (options.face !== undefined || options.drawCenter !== false)) {
    context.fillStyle = face;
    context.fillRect(x, y, width, height);
  }
  const edge = Math.min(surface.borderWidth, width, height);
  const [top, right, bottom, left] = surface.borderSides ?? [true, true, true, true];
  context.fillStyle = options.ink ?? colors[surface.borderRole];
  if (top) context.fillRect(x, y, width, edge);
  if (right) context.fillRect(x + width - edge, y, edge, height);
  if (bottom) context.fillRect(x, y + height - edge, width, edge);
  if (left) context.fillRect(x, y, edge, height);
  return true;
}
