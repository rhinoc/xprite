export const PIXEL_IMAGE_DEFAULT_BOX = { width: 256, height: 160 };
const CHECKER_CELL_PIXELS = 8;
const MINIMUM_BOX_SIZE = 1;

/** Whole-pixel upscales and power-of-two reductions keep the image/checker grids shared. */
export function pixelImageLayout(width: number, height: number, box = PIXEL_IMAGE_DEFAULT_BOX) {
  const fit = Math.min(
    Math.max(MINIMUM_BOX_SIZE, box.width) / width,
    Math.max(MINIMUM_BOX_SIZE, box.height) / height,
  );
  const scale =
    fit >= MINIMUM_BOX_SIZE
      ? Math.floor(fit)
      : MINIMUM_BOX_SIZE / 2 ** Math.ceil(Math.log2(MINIMUM_BOX_SIZE / fit));
  return {
    width: width * scale,
    height: height * scale,
    checkerSize: CHECKER_CELL_PIXELS * Math.max(MINIMUM_BOX_SIZE, scale),
  };
}
