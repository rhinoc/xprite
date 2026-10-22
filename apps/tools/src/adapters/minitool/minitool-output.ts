import { createCompositionRenderer } from "$/adapters/minitool/composition-renderer";
import { downloadImage, postImageNote, saveImageToAlbum } from "$/adapters/minitool/xhs-bridge";
import {
  MiniToolOutcome,
  MiniToolTarget,
  type MiniToolPort,
  type MiniToolScene,
} from "$/managers/ports/minitool";
import type { PixelBuffer } from "@xprite/editor-core/base";
import { pixelateImage } from "@xprite/editor-core/import-export";

/** Let a pending paint happen before a synchronous step takes the main thread. */
function yieldToPaint(): Promise<void> {
  return new Promise((resolve) => requestAnimationFrame(() => setTimeout(resolve, 0)));
}

function exportName(scene: MiniToolScene) {
  const base = scene.title.replace(/\.[^.]+$/, "") || "xprite";
  return `${base}-xprite.png`;
}

/** Thumbnails, export rendering and the container hand-off for the phone layout. */
export function createMiniToolPort(): MiniToolPort {
  const renderer = createCompositionRenderer();
  return {
    renderer,
    async preview(image, options) {
      await yieldToPaint();
      return pixelateImage(image, options);
    },
    shrink(image: PixelBuffer, longSide: number): PixelBuffer {
      const longest = Math.max(image.width, image.height);
      if (longest <= longSide) return image;
      const scale = longSide / longest;
      const source = document.createElement("canvas");
      source.width = image.width;
      source.height = image.height;
      source
        .getContext("2d")!
        .putImageData(
          new ImageData(new Uint8ClampedArray(image.data), image.width, image.height),
          0,
          0,
        );
      const target = document.createElement("canvas");
      target.width = Math.max(1, Math.round(image.width * scale));
      target.height = Math.max(1, Math.round(image.height * scale));
      const context = target.getContext("2d")!;
      context.imageSmoothingEnabled = true;
      context.imageSmoothingQuality = "high";
      context.drawImage(source, 0, 0, target.width, target.height);
      const data = context.getImageData(0, 0, target.width, target.height).data;
      return { width: target.width, height: target.height, data: new Uint8ClampedArray(data) };
    },
    async output(scene, target) {
      await renderer.ready();
      await yieldToPaint();
      const dataUrl = renderer.render(scene).toDataURL("image/png");
      if (downloadImage(dataUrl, exportName(scene))) return MiniToolOutcome.Downloaded;
      if (target === MiniToolTarget.Album) await saveImageToAlbum(dataUrl);
      else await postImageNote(dataUrl);
      return MiniToolOutcome.Done;
    },
  };
}
