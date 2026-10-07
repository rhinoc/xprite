import { cloneGraph } from "$/base/clone";
import type { PixelBuffer } from "$/base/primitives";
import type { EditorPersistenceSnapshot } from "$/document";
import { isImmutableImageData } from "$/document/pixel-ownership";
import { encodedPixels, hydratePixelStorage } from "$/document/pixel-storage";
import { assertPixelBuffer } from "$/document/pixel-validation";
import { cloneEditorProject, type EditorProject } from "$/document/project";
import { renderTimelineFrame } from "$/timeline/timeline";
import type { SpriteTimeline } from "$/timeline/types";

const committedSnapshots = new WeakSet<Readonly<EditorPersistenceSnapshot>>();

/** A kernel-owned detached graph. Consumers may retain, but never mutate or
 * transfer its buffers; the owned clone API deliberately does not carry this brand. */
export function isCommittedPersistenceSnapshot(
  snapshot: Readonly<EditorPersistenceSnapshot>,
): boolean {
  return committedSnapshots.has(snapshot);
}

/** Read-only project view over an already detached commit. Navigation is copied
 * from the current view without sampling live or staged raster data. The image
 * is a fresh full-document display composite, including reference layers. */
export function projectFromCommittedPersistenceSnapshot(
  snapshot: Readonly<EditorPersistenceSnapshot>,
  view: Pick<SpriteTimeline, "activeFrame" | "activeLayer" | "range">,
): EditorProject {
  if (!isCommittedPersistenceSnapshot(snapshot))
    throw new TypeError("A committed persistence snapshot is required");
  const committed = snapshot.document.timeline;
  if (!committed) throw new TypeError("A committed project requires a timeline");
  if (
    !Number.isInteger(view.activeFrame) ||
    view.activeFrame < 0 ||
    view.activeFrame >= committed.frames.length ||
    !Number.isInteger(view.activeLayer) ||
    view.activeLayer < 0 ||
    view.activeLayer >= committed.layers.length
  )
    throw new RangeError("Invalid committed project view");
  const timeline = {
    ...committed,
    activeFrame: view.activeFrame,
    activeLayer: view.activeLayer,
    range: cloneGraph(view.range),
  };
  const frame = timeline.frames[timeline.activeFrame];
  return {
    image: renderTimelineFrame(
      timeline,
      snapshot.document.width,
      snapshot.document.height,
      timeline.activeFrame,
    ),
    timeline,
    palette: frame.palette ?? snapshot.document.palette,
  };
}

interface CachedPixels {
  readonly version: number;
  readonly copy: Uint8ClampedArray;
}

/** Only the latest graph's RGBA arrays are retained. Live buffers are mutable:
 * reuse requires the history's monotonic mutation version, including undo/redo.
 * Source samples, tile grids, ICC and other opaque metadata are cloned normally. */
export class CommittedPersistenceCapture {
  private epoch = -1;
  private pixels = new Map<Uint8ClampedArray, CachedPixels>();

  clear(): void {
    this.pixels.clear();
    this.epoch = -1;
  }

  capture(
    snapshot: EditorPersistenceSnapshot,
    epoch: number,
    versionOf: (data: Uint8ClampedArray) => number,
  ): EditorPersistenceSnapshot {
    const document = snapshot.document;
    if (!document.timeline) throw new TypeError("Recovery requires a timeline");
    assertPixelBuffer(document.layer.pixels);
    const next = new Map<Uint8ClampedArray, CachedPixels>();
    const retain = (data: Uint8ClampedArray) => {
      if (next.has(data)) return;
      const version = versionOf(data);
      const cached = this.epoch === epoch ? this.pixels.get(data) : undefined;
      next.set(data, {
        version,
        copy:
          cached?.version === version
            ? cached.copy
            : isImmutableImageData(data)
              ? data
              : new Uint8ClampedArray(data),
      });
    };
    const encodedCopies: (readonly [object, unknown])[] = [];
    const retainImage = (image: PixelBuffer) => {
      const encoded = encodedPixels(image);
      if (encoded) encodedCopies.push([encoded, encoded]);
      else retain(image.data);
    };
    retainImage(document.layer.pixels);
    for (const frame of document.timeline.frames)
      for (const cel of frame.cels) if (cel) retainImage(cel.pixels);
    const project = hydratePixelStorage(
      cloneGraph(
        { image: document.layer.pixels, timeline: document.timeline, palette: document.palette },
        [...Array.from(next, ([data, cached]) => [data, cached.copy] as const), ...encodedCopies],
      ),
    );
    const captured: EditorPersistenceSnapshot = {
      version: 1,
      dirty: snapshot.dirty,
      document: {
        ...document,
        id: undefined,
        timeline: { ...project.timeline, range: undefined },
        palette: project.palette,
        layer: { ...document.layer, pixels: project.image },
        selection: null,
        hiddenSelection: undefined,
      },
    };
    this.pixels = next;
    this.epoch = epoch;
    committedSnapshots.add(captured);
    return captured;
  }
}

/** Detached graph; Aseprite metadata and linked-cel pixel identity survive. */
export function clonePersistenceSnapshot(
  snapshot: EditorPersistenceSnapshot,
): EditorPersistenceSnapshot {
  const document = snapshot.document;
  if (!document.timeline) throw new TypeError("Recovery requires a timeline");
  const project = cloneEditorProject({
    image: document.layer.pixels,
    timeline: document.timeline,
    palette: document.palette,
  });
  return {
    version: 1,
    dirty: snapshot.dirty,
    document: {
      ...document,
      id: undefined,
      timeline: { ...project.timeline, range: undefined },
      palette: project.palette,
      layer: { ...document.layer, pixels: project.image },
      selection: null,
      hiddenSelection: undefined,
    },
  };
}
