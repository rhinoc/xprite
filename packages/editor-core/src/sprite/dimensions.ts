import { MAX_IMAGE_DIMENSION } from "$/base/image-limits";

/** Basic integer mode of New Sprite's expression entries. Browser allocation
 * limits are supplied by the caller; expressions are deliberately unsupported. */
export function parseSpriteDimension(value: string, maximum = MAX_IMAGE_DIMENSION): number | null {
  if (!/^[+-]?\d+$/.test(value.trim())) return null;
  const parsed = Number(value);
  if (!Number.isSafeInteger(parsed) || !Number.isSafeInteger(maximum) || maximum < 1) return null;
  return Math.max(1, Math.min(maximum, parsed));
}
