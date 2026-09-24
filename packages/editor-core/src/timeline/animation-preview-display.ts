import { UINT8_MAX } from "$/base/numeric-constants";
import type { PixelBuffer, Point, Rgba } from "$/base/primitives";
import { documentToScreen } from "$/canvas/view";
import { workingColorProfile, convertPixelsToSrgb } from "$/color/icc-profile";
import type { SpriteTimeline } from "$/timeline/timeline";
import { renderTimelineViewport } from "$/timeline/viewport-renderer";

/** The preview uses LibreSprite DocumentView's kShowOutside presentation mode:
 * editor face outside the image and no normal editor overlays. The checker is
 * composited here in document space; one image pixel maps to two display pixels
 * at 100% zoom. */
export function renderAnimationPreview(
  t: SpriteTimeline,
  frame: number,
  document: { width: number; height: number },
  viewport: { width: number; height: number },
  zoom: number,
  pan: Point,
  face: Rgba,
): PixelBuffer {
  const origin = documentToScreen(
    { x: 0, y: 0 },
    { width: viewport.width / 2, height: viewport.height / 2 },
    document,
    { zoom, pan },
  );
  const ox = Math.trunc(origin.x) * 2,
    oy = Math.trunc(origin.y) * 2,
    w = document.width * zoom * 2,
    h = document.height * zoom * 2;
  const display = convertPixelsToSrgb(
    renderTimelineViewport(
      t,
      { x: -ox, y: -oy, width: viewport.width, height: viewport.height, zoom: zoom * 2 },
      frame,
    ),
    workingColorProfile(t),
  );
  for (let y = 0; y < viewport.height; y++)
    for (let x = 0; x < viewport.width; x++) {
      const at = (y * viewport.width + x) * 4,
        inside = x >= ox && y >= oy && x < ox + w && y < oy + h;
      const outline = !inside && x >= ox - 2 && y >= oy - 2 && x < ox + w + 2 && y < oy + h + 2;
      const checker =
        (Math.floor((x - ox) / (32 * zoom)) + Math.floor((y - oy) / (32 * zoom))) % 2 ? 192 : 128;
      const alpha = display.data[at + 3];
      for (let ch = 0; ch < 3; ch++) {
        const bg = inside ? checker : outline ? 0 : face[ch];
        display.data[at + ch] = Math.round(
          (display.data[at + ch] * alpha + bg * (UINT8_MAX - alpha)) / UINT8_MAX,
        );
      }
      display.data[at + 3] = UINT8_MAX;
    }
  return display;
}
