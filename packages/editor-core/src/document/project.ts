import { cloneGraph } from "$/base/clone";
import type { PixelBuffer, Rgba } from "$/base/primitives";
import { assertPixelBuffer } from "$/document/pixel-validation";
import type { SpriteTimeline } from "$/timeline/types";

/** Portable, format-neutral editor project data. */
export interface EditorProject {
  readonly image: PixelBuffer;
  readonly timeline: SpriteTimeline;
  readonly palette?: readonly Rgba[];
}

/** Clone a project graph while preserving shared cel pixel identities. */
export function cloneEditorProject(project: EditorProject): EditorProject {
  if (!project || typeof project !== "object")
    throw new TypeError("An editor project must be an object");
  assertPixelBuffer(project.image);
  return cloneGraph(project);
}
