import { MiniToolOutcome, MiniToolTarget } from "$/shared/bridge/output";
import { downloadImage, postImageNote, saveImageToAlbum } from "$/shared/bridge/xhs-bridge";
import { exportSize } from "$/shared/frames/layout";
import type { NormalToolScene } from "$/tools/normalmap/managers/editor";
import { ExportContent } from "$/tools/normalmap/managers/editor";
import type { PixelBuffer } from "@xprite/editor-core/base";

const OUTPUT_MIN_SIZE = 1080;
const OUTPUT_MAX_SIZE = 2048;
const TRIO_GAP = 24;

function canvas(width: number, height: number) {
  const element = document.createElement("canvas");
  element.width = Math.max(1, width);
  element.height = Math.max(1, height);
  const context = element.getContext("2d");
  if (!context) throw new Error("error.read");
  return { element, context };
}

const pictures = new WeakMap<PixelBuffer, HTMLCanvasElement>();

function picture(pixels: PixelBuffer): HTMLCanvasElement {
  let element = pictures.get(pixels);
  if (!element) {
    const created = canvas(pixels.width, pixels.height);
    created.context.putImageData(
      new ImageData(new Uint8ClampedArray(pixels.data), pixels.width, pixels.height),
      0,
      0,
    );
    pictures.set(pixels, (element = created.element));
  }
  return element;
}

function exportName(scene: NormalToolScene) {
  const base = scene.name.replace(/\.[^.]+$/, "") || "xprite";
  const suffix = scene.content === ExportContent.Normal ? "normal" : scene.content;
  return `${base}-xprite-${suffix}.png`;
}

/** One picture into its placement, at whole-pixel blocks. */
function drawCell(
  context: CanvasRenderingContext2D,
  source: CanvasImageSource,
  x: number,
  y: number,
  width: number,
  height: number,
) {
  context.imageSmoothingEnabled = false;
  context.drawImage(source, x, y, width, height);
}

function renderSingle(scene: NormalToolScene, kind: "lit" | "normal"): HTMLCanvasElement {
  const grid = scene.cell;
  const size = exportSize(scene.ratio);
  const { element, context } = canvas(size.width, size.height);
  const image = kind === "lit" ? picture(scene.lit) : picture(scene.normals);
  const cell = Math.ceil(Math.max(size.width / grid.width, size.height / grid.height));
  const width = grid.width * cell;
  const height = grid.height * cell;
  context.fillStyle = "#1f1d22";
  context.fillRect(0, 0, size.width, size.height);
  drawCell(
    context,
    image,
    Math.round((size.width - width) / 2),
    Math.round((size.height - height) / 2),
    width,
    height,
  );
  return element;
}

/** Albedo, normal map and lit result side by side, each a whole-pixel cell. */
function renderTrio(scene: NormalToolScene): HTMLCanvasElement {
  const grid = scene.cell;
  const size = exportSize(scene.ratio);
  const gap = TRIO_GAP;
  const cellWidth = Math.floor((size.width - gap * 4) / 3);
  const cell = Math.max(
    1,
    Math.floor(Math.min(cellWidth / grid.width, (size.height - gap * 2) / grid.height)),
  );
  const width = grid.width * cell;
  const height = grid.height * cell;
  const y = Math.round((size.height - height) / 2);
  const xs = [gap, gap * 2 + cellWidth, gap * 3 + cellWidth * 2].map(
    (x) => x + Math.round((cellWidth - width) / 2),
  );
  const { element, context } = canvas(size.width, size.height);
  context.fillStyle = "#1f1d22";
  context.fillRect(0, 0, size.width, size.height);
  const images = [picture(scene.albedo), picture(scene.normals), picture(scene.lit)];
  images.forEach((image, index) => drawCell(context, image, xs[index], y, width, height));
  return element;
}

/** Scale one picture cell up to a shareable size by a whole factor. */
function upscale(source: HTMLCanvasElement): HTMLCanvasElement {
  const longest = Math.max(source.width, source.height);
  const factor = Math.max(
    1,
    Math.min(Math.ceil(OUTPUT_MIN_SIZE / longest), Math.floor(OUTPUT_MAX_SIZE / longest)),
  );
  if (factor === 1) return source;
  const { element, context } = canvas(source.width * factor, source.height * factor);
  context.imageSmoothingEnabled = false;
  context.drawImage(source, 0, 0, element.width, element.height);
  return element;
}

async function renderScene(scene: NormalToolScene): Promise<HTMLCanvasElement> {
  if (scene.content === ExportContent.Trio) return renderTrio(scene);
  return renderSingle(scene, scene.content === ExportContent.Normal ? "normal" : "lit");
}

export async function outputScene(
  scene: NormalToolScene,
  target: MiniToolTarget,
): Promise<MiniToolOutcome> {
  const rendered = await renderScene(scene);
  const dataUrl = upscale(rendered).toDataURL("image/png");
  if (downloadImage(dataUrl, exportName(scene))) return MiniToolOutcome.Downloaded;
  if (target === MiniToolTarget.Album) await saveImageToAlbum(dataUrl);
  else await postImageNote(dataUrl);
  return MiniToolOutcome.Done;
}
