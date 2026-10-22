/**
 * The pixelate tool's engine, shared with the Xiaohongshu mini tool (`apps/xhs-minitool`) as
 * `@xprite/tools-app/pixelation`: the manager and its port, and the platform pieces a port needs.
 */
export {
  PixelationManager,
  type PixelationSnapshot,
} from "$/managers/pixelation/pixelation-manager";
export type { PixelationPort } from "$/managers/ports/pixelation";
export { readPixelationPalettes } from "$/adapters/pixelation/palette-resources";
export { readToolWheel } from "$/adapters/preview/browser-preview";
export { TOOL_IMPORT_MAX_BYTES } from "$/managers/files/files-model";
