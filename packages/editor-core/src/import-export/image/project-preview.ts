import type { PixelBuffer } from "$/base/primitives";
import type { EditorProject } from "$/document/project";
import { renderTimelineFrame } from "$/timeline/timeline";

/** Generate a flattened file preview only after the output format needs it.
 * Reference layers stay in the immutable project but are excluded from PNG,
 * matching the editor's export composite. Working pixels remain unchanged. */
export function projectPngImage(
  project: EditorProject & { readonly pngImage?: PixelBuffer },
): PixelBuffer {
  return (
    project.pngImage ??
    renderTimelineFrame(
      project.timeline,
      project.image.width,
      project.image.height,
      project.timeline.activeFrame,
      undefined,
      false,
    )
  );
}
