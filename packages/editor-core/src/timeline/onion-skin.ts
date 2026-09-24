import { UINT8_MAX } from "$/base/numeric-constants";
import type { PixelBuffer } from "$/base/primitives";
import { blendAt, mulUn8 } from "$/canvas/blend-modes";
import {
  normalizeOnionSkin,
  onionSkinFrames,
  type OnionSkinSettings,
} from "$/timeline/animation-options";
import { layerSubtree } from "$/timeline/layer-operations";
import type { SpriteTimeline, TimelineLayer } from "$/timeline/timeline";
import { layerAncestors, isBackgroundLayer, LAYER_REFERENCE } from "$/timeline/timeline";
import {
  renderTimelineViewport,
  type TimelineViewport,
  type TimelineViewportOverlay,
} from "$/timeline/viewport-renderer";

const over = (target: PixelBuffer, source: PixelBuffer) => {
  for (let i = 0; i < target.data.length; i += 4)
    blendAt(target.data, i, source.data, i, UINT8_MAX, 0);
};
/** Source rgba_blender_{red,blue}_tint uses Rec.709 integer luma. */
export function tintOnionPixels(pixels: PixelBuffer, previous: boolean): PixelBuffer {
  const data = pixels.data.slice();
  for (let i = 0; i < data.length; i += 4) {
    const v = Math.trunc((data[i] * 2126 + data[i + 1] * 7152 + data[i + 2] * 722) / 10000),
      half = Math.trunc(v / 2),
      tint = Math.trunc((UINT8_MAX + v) / 2);
    data[i] = previous ? tint : half;
    data[i + 1] = half;
    data[i + 2] = previous ? half : tint;
  }
  return { ...pixels, data };
}
const filterLayers = (
  t: SpriteTimeline,
  keep: (layer: TimelineLayer, index: number) => boolean,
): SpriteTimeline => ({
  ...t,
  layers: t.layers.map((l, i) => (l.kind === "group" || keep(l, i) ? l : { ...l, visible: false })),
});
/** View-only renderer; callers must never use onion pixels for export/eyedropper.
 * Aseprite layering is background → behind ghosts → transparent sprite → front
 * ghosts. Per-layer global opacity is multiplied before the normal/tint blend. */
export function renderOnionSkinViewport(
  t: SpriteTimeline,
  view: TimelineViewport,
  settings: OnionSkinSettings,
  frame = t.activeFrame,
  overlay?: TimelineViewportOverlay,
): PixelBuffer {
  const s = normalizeOnionSkin(settings);
  if (!s.active || t.frames.length < 2) return renderTimelineViewport(t, view, frame, overlay);
  const current =
    s.position === "behind"
      ? renderTimelineViewport(
          filterLayers(t, (l) => isBackgroundLayer(l)),
          view,
          frame,
        )
      : renderTimelineViewport(t, view, frame, overlay);
  const selected = new Set(
    s.currentLayer
      ? [
          ...layerSubtree(t, t.activeLayer),
          ...layerAncestors(t, t.activeLayer).map((l) => t.layers.indexOf(l)),
        ]
      : t.layers.map((_, i) => i),
  );
  for (const ghost of onionSkinFrames(t, s, frame)) {
    const layers = t.layers.map((layer, index) => ({
      ...layer,
      visible:
        layer.visible &&
        selected.has(index) &&
        !(layer.flags & LAYER_REFERENCE) &&
        (!isBackgroundLayer(layer) || (s.position === "in-front" && ghost.opacity < UINT8_MAX)),
      blendMode: 0,
      opacity: layer.kind === "group" ? layer.opacity : mulUn8(layer.opacity, ghost.opacity),
    }));
    const pixels = new Map<PixelBuffer, PixelBuffer>();
    const ghostFrame = t.frames[ghost.frame];
    const cels =
      s.type === "red-blue"
        ? ghostFrame.cels.map((cel) => {
            if (!cel) return null;
            let tinted = pixels.get(cel.pixels);
            if (!tinted) {
              tinted = tintOnionPixels(cel.pixels, ghost.offset < 0);
              pixels.set(cel.pixels, tinted);
            }
            return { ...cel, pixels: tinted };
          })
        : ghostFrame.cels;
    const plan = {
      ...t,
      layers,
      frames: t.frames.map((f, i) => (i === ghost.frame ? { ...f, cels } : f)),
    };
    over(current, renderTimelineViewport(plan, view, ghost.frame));
  }
  if (s.position === "behind")
    over(
      current,
      renderTimelineViewport(
        filterLayers(t, (l) => !isBackgroundLayer(l)),
        view,
        frame,
        overlay,
      ),
    );
  return current;
}
