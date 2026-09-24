import { MAX_IMAGE_DIMENSION, MAX_IMAGE_PIXELS } from "$/base/image-limits";
/** Safe browser-adapter failure: keep the existing cel and let the user move it back. */
export class EditorAllocationError extends RangeError {
  readonly name = "EditorAllocationError";
  readonly code = "cel-allocation-limit";
  readonly requestedBytes: number;
  readonly maxDimension = MAX_IMAGE_DIMENSION;
  readonly maxBytes = MAX_IMAGE_PIXELS * 4;
  constructor(
    readonly width: number,
    readonly height: number,
    readonly operation: "cel" | "text" = "cel",
  ) {
    super(
      operation === "text"
        ? `Cannot insert text: rendered image would be ${width} × ${height} pixels. Reduce the text length or size; the limit is ${MAX_IMAGE_DIMENSION} pixels per side and ${MAX_IMAGE_PIXELS} pixels total.`
        : `Cannot paint: moved layer would require a ${width} × ${height} cel. Move the layer closer to the canvas; the limit is ${MAX_IMAGE_DIMENSION} pixels per side and ${MAX_IMAGE_PIXELS} pixels total.`,
    );
    this.requestedBytes = width * height * 4;
  }
}
