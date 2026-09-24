const DEFAULT_BUFFER_BLOCK_SIZE = 32;
const BUFFER_SHRINK_FACTOR = 2;

/** Reuse scratch storage during small resizes, releasing it after a large shrink. */
export function resizeCanvasBuffer(
  canvas: HTMLCanvasElement,
  width: number,
  height: number,
  blockSize = DEFAULT_BUFFER_BLOCK_SIZE,
) {
  const extent = (size: number) => Math.ceil(Math.max(1, size) / blockSize) * blockSize;
  if (width > canvas.width || width < canvas.width / BUFFER_SHRINK_FACTOR)
    canvas.width = extent(width);
  if (height > canvas.height || height < canvas.height / BUFFER_SHRINK_FACTOR)
    canvas.height = extent(height);
}
