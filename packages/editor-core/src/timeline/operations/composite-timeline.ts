import { UINT8_MAX } from "$/base/numeric-constants";
import type { PixelBuffer } from "$/base/primitives";
import { ensureTimeline, syncTimeline } from "$/document/document";
import type { EditorDocument } from "$/document/types";
import { renderTimelineFrame } from "$/timeline/timeline";

export function compositeTimeline(
  doc: EditorDocument,
  frameIndex = doc.timeline?.activeFrame ?? 0,
  overlay?: { pixels: PixelBuffer; x: number; y: number },
  showReferenceLayers = true,
): PixelBuffer {
  ensureTimeline(doc);
  syncTimeline(doc);
  let t = doc.timeline!;
  const cel = t.frames[t.activeFrame].cels[t.activeLayer];
  if (
    frameIndex === t.activeFrame &&
    t.layers[t.activeLayer].kind === "tilemap" &&
    cel?.pixels !== doc.layer.pixels
  ) {
    t = {
      ...t,
      frames: t.frames.map((f, fi) =>
        fi !== t.activeFrame
          ? f
          : {
              ...f,
              cels: f.cels.map((c, li) =>
                li !== t.activeLayer
                  ? c
                  : {
                      ...c,
                      pixels: doc.layer.pixels,
                      x: doc.layer.x,
                      y: doc.layer.y,
                      opacity: doc.layer.celOpacity ?? UINT8_MAX,
                      zIndex: doc.layer.zIndex ?? 0,
                    },
              ),
            },
      ),
    };
  }
  return renderTimelineFrame(t, doc.width, doc.height, frameIndex, overlay, showReferenceLayers);
}
