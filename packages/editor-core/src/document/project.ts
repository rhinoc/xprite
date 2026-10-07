import { cloneGraph } from "$/base/clone";
import type { PixelBuffer, Rgba } from "$/base/primitives";
import { markImmutableImage } from "$/document/pixel-ownership";
import { hydratePixelStorage } from "$/document/pixel-storage";
import { assertPixelBuffer } from "$/document/pixel-validation";
import type { SpriteTimeline } from "$/timeline/types";

/** Portable, format-neutral editor project data. */
export interface EditorProject {
  readonly image: PixelBuffer;
  readonly timeline: SpriteTimeline;
  readonly palette?: readonly Rgba[];
}

const immutableProjects = new WeakSet<EditorProject>();

/** Ownership contract for browser-decoded and transferred projects. The caller
 * relinquishes all writes; editing installs an independent owned timeline. */
export function markImmutableEditorProject<T extends EditorProject>(project: T): T {
  hydratePixelStorage(project);
  immutableProjects.add(project);
  for (const frame of project.timeline.frames)
    for (const cel of frame.cels) if (cel) markImmutableImage(cel.pixels);
  return project;
}

export function isImmutableEditorProject(project: EditorProject | undefined): boolean {
  return !!project && immutableProjects.has(project);
}

/** Clone a project graph while preserving shared cel pixel identities. */
export function cloneEditorProject(project: EditorProject): EditorProject {
  if (!project || typeof project !== "object")
    throw new TypeError("An editor project must be an object");
  assertPixelBuffer(project.image);
  return hydratePixelStorage(cloneGraph(project));
}
