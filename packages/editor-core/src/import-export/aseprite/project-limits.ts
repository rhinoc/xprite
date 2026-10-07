import {
  MAX_DOCUMENT_PIXEL_BYTES,
  MAX_IMAGE_DIMENSION,
  MAX_IMAGE_PIXELS,
} from "$/base/image-limits";
import {
  DEFAULT_ASEPRITE_LIMITS,
  type AsepriteResourceLimits,
} from "$/import-export/aseprite/model";
import { MAX_TIMELINE_FRAMES, MAX_TIMELINE_LAYERS } from "$/timeline/timeline";

/** One policy for opening, exporting and recovering editable projects.
 * Indexed/gray projects retain sample bytes as well as their RGBA projections;
 * codec metadata and those samples must fit alongside the editor's pixel budget. */
export const EDITOR_ASEPRITE_LIMITS: Readonly<AsepriteResourceLimits> = {
  ...DEFAULT_ASEPRITE_LIMITS,
  maxFileBytes: MAX_IMAGE_PIXELS * 8,
  maxDecodedBytes: MAX_DOCUMENT_PIXEL_BYTES * 2,
  maxExpandedBytes: MAX_DOCUMENT_PIXEL_BYTES,
  maxChunkBytes: MAX_IMAGE_PIXELS * 8,
  maxWidth: MAX_IMAGE_DIMENSION,
  maxHeight: MAX_IMAGE_DIMENSION,
  maxFrames: MAX_TIMELINE_FRAMES,
  maxLayers: MAX_TIMELINE_LAYERS,
  maxCels: MAX_TIMELINE_FRAMES * MAX_TIMELINE_LAYERS,
  maxCelPixels: MAX_IMAGE_PIXELS,
};
