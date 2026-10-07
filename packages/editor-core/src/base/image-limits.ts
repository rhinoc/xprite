/** Keep accidental allocations bounded while allowing ordinary 4K imports. */
export const MAX_IMAGE_DIMENSION = 32_768;
export const MAX_IMAGE_PIXELS = 64_000_000;
/** Total unique cel pixels across a project, independent of one canvas/cel. */
export const MAX_DOCUMENT_PIXELS = MAX_IMAGE_PIXELS * 4;
export const MAX_DOCUMENT_PIXEL_BYTES = MAX_DOCUMENT_PIXELS * 4;
