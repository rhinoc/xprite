import {
  createFrameAssets,
  drawFrame,
  pixelFont,
  polygon,
  rect,
  roundedPath,
  type FrameAssets,
} from "$/shared/frames/frame-art";
import { placementRect, type Rect } from "$/shared/frames/geometry";
import type { MiniToolRenderer, MiniToolScene } from "$/tools/pixelate/managers/ports";
import { ExportContent, labelSize, lineWidth } from "$/tools/pixelate/managers/scene";
import { Corner, labelCorners, splitShape } from "$/tools/pixelate/managers/split-geometry";
import type { PixelBuffer } from "@xprite/editor-core/base";

/** Previews draw the photo from a copy at most this size; exports use the photo itself. */
const PREVIEW_SOURCE = 1600;

function canvas(width: number, height: number) {
  const element = document.createElement("canvas");
  element.width = Math.max(1, width);
  element.height = Math.max(1, height);
  return element;
}

const pictures = new WeakMap<PixelBuffer, HTMLCanvasElement>();
const previews = new WeakMap<PixelBuffer, HTMLCanvasElement>();

/** A canvas holding the buffer's pixels, made once per buffer. */
function picture(pixels: PixelBuffer): HTMLCanvasElement {
  let element = pictures.get(pixels);
  if (!element) {
    element = canvas(pixels.width, pixels.height);
    element
      .getContext("2d")!
      .putImageData(
        new ImageData(new Uint8ClampedArray(pixels.data), pixels.width, pixels.height),
        0,
        0,
      );
    pictures.set(pixels, element);
  }
  return element;
}

/** A smoothed, smaller copy of a large photo for on-screen previews. */
function previewPicture(pixels: PixelBuffer): HTMLCanvasElement {
  const longest = Math.max(pixels.width, pixels.height);
  if (longest <= PREVIEW_SOURCE) return picture(pixels);
  let element = previews.get(pixels);
  if (!element) {
    const scale = PREVIEW_SOURCE / longest;
    element = canvas(Math.round(pixels.width * scale), Math.round(pixels.height * scale));
    const context = element.getContext("2d")!;
    context.imageSmoothingEnabled = true;
    context.imageSmoothingQuality = "high";
    context.drawImage(picture(pixels), 0, 0, element.width, element.height);
    previews.set(pixels, element);
  }
  return element;
}

// ---- The picture: original, pixelated side, divider and labels ----

function drawPicture(
  context: CanvasRenderingContext2D,
  scene: MiniToolScene,
  original: CanvasImageSource,
) {
  const { composition, split } = scene;
  const { area, placement, visible } = composition;
  const blocks = placementRect(placement);
  context.save();
  context.beginPath();
  context.rect(area.x, area.y, area.width, area.height);
  context.clip();
  rect(context, area.x, area.y, area.width, area.height, "#000");
  // The divider and labels stay on the picture, not on letterbox bars around it.
  context.beginPath();
  context.rect(visible.x, visible.y, visible.width, visible.height);
  context.clip();
  const pixels = picture(scene.pixels);
  const drawPixels = () => {
    context.imageSmoothingEnabled = false;
    context.drawImage(pixels, blocks.x, blocks.y, blocks.width, blocks.height);
  };
  if (scene.content === ExportContent.Pixels) {
    drawPixels();
    context.restore();
    return;
  }
  context.imageSmoothingEnabled = true;
  context.imageSmoothingQuality = "high";
  context.drawImage(original, blocks.x, blocks.y, blocks.width, blocks.height);
  const shape = splitShape(split, visible, placement);
  context.save();
  polygon(context, shape.pixels);
  context.closePath();
  context.clip();
  drawPixels();
  context.restore();
  if (split.divider) {
    const width = lineWidth(split.line, visible);
    context.lineJoin = "miter";
    context.lineCap = "butt";
    polygon(context, shape.line);
    context.strokeStyle = "rgba(0,0,0,0.35)";
    context.lineWidth = width + Math.max(4, width * 0.6);
    context.stroke();
    context.strokeStyle = "#FFFFFF";
    context.lineWidth = width;
    context.stroke();
  }
  if (split.labels) drawLabels(context, scene, visible);
  context.restore();
}

function drawLabels(context: CanvasRenderingContext2D, scene: MiniToolScene, visible: Rect) {
  const corners = labelCorners(scene.split, visible);
  const size = labelSize(visible);
  const margin = Math.round(size * 0.6);
  const padX = Math.round(size * 0.42);
  const padY = Math.round(size * 0.28);
  context.font = pixelFont(size);
  context.textBaseline = "middle";
  context.textAlign = "left";
  for (const [text, corner] of [
    [scene.labels.original, corners.original],
    [scene.labels.pixels, corners.pixels],
  ] as const) {
    const width = Math.ceil(context.measureText(text).width) + 2 * padX;
    const height = size + 2 * padY;
    const left = corner === Corner.TopLeft || corner === Corner.BottomLeft;
    const top = corner === Corner.TopLeft || corner === Corner.TopRight;
    const x = left ? visible.x + margin : visible.x + visible.width - margin - width;
    const y = top ? visible.y + margin : visible.y + visible.height - margin - height;
    context.fillStyle = "rgba(18,18,22,0.62)";
    roundedPath(context, { x, y, width, height }, Math.round(size * 0.22));
    context.fill();
    context.fillStyle = "#FFFFFF";
    context.fillText(text, x + padX, y + height / 2);
  }
}

/** The status text frames show: the block count. */
function dimensionsText(scene: MiniToolScene) {
  return `${scene.pixels.width} × ${scene.pixels.height}`;
}

function drawScene(
  context: CanvasRenderingContext2D,
  scene: MiniToolScene,
  assets: FrameAssets,
  original: CanvasImageSource,
) {
  drawFrame(context, { ...scene, status: dimensionsText(scene) }, assets);
  drawPicture(context, scene, original);
}

/** Canvas drawing for previews and exports; one scene, any scale. */
export function createCompositionRenderer(): MiniToolRenderer & {
  render(scene: MiniToolScene): HTMLCanvasElement;
} {
  const assets = createFrameAssets();
  const draw = (target: HTMLCanvasElement, scene: MiniToolScene, scale: number, exact: boolean) => {
    const { width, height } = scene.composition.size;
    const pixelWidth = Math.max(1, Math.round(width * scale));
    const pixelHeight = Math.max(1, Math.round(height * scale));
    if (target.width !== pixelWidth) target.width = pixelWidth;
    if (target.height !== pixelHeight) target.height = pixelHeight;
    const context = target.getContext("2d");
    if (!context) throw new Error("Unable to draw the picture.");
    context.setTransform(1, 0, 0, 1, 0, 0);
    context.clearRect(0, 0, pixelWidth, pixelHeight);
    context.setTransform(pixelWidth / width, 0, 0, pixelHeight / height, 0, 0);
    drawScene(
      context,
      scene,
      assets,
      exact ? picture(scene.original) : previewPicture(scene.original),
    );
  };
  return {
    ready: () => assets.ready(),
    draw: (target, scene, scale) => draw(target, scene, scale, false),
    /** The export itself: full size, the photo at full resolution. */
    render(scene) {
      const target = canvas(scene.composition.size.width, scene.composition.size.height);
      draw(target, scene, 1, true);
      return target;
    },
  };
}
