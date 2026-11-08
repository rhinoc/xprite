import exampleUrl from "$/tools/normalmap/assets/dungeon-256.png?url";
import type { PixelBuffer } from "@xprite/editor-core/base";

const EXAMPLE_NAME = "dungeon.png";

/** The bundled example decoded to pixels, without fetch or a canvas re-encode. */
export async function loadExample(): Promise<{ file: File; pixels: PixelBuffer }> {
  const image = await new Promise<HTMLImageElement>((resolve, reject) => {
    const element = new Image();
    element.onload = () => resolve(element);
    element.onerror = () => reject(new Error("error.example"));
    element.src = exampleUrl;
  });
  const canvas = document.createElement("canvas");
  canvas.width = image.naturalWidth;
  canvas.height = image.naturalHeight;
  const context = canvas.getContext("2d");
  if (!context) throw new Error("error.example");
  context.drawImage(image, 0, 0);
  const data = context.getImageData(0, 0, canvas.width, canvas.height).data;
  return {
    file: new File([], EXAMPLE_NAME, { type: "image/png" }),
    pixels: {
      width: canvas.width,
      height: canvas.height,
      data: new Uint8ClampedArray(data),
    },
  };
}
