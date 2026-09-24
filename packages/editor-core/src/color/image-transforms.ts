import type { AsepriteImageSamples } from "$/base/image";
import { UINT8_MAX, BITS_PER_BYTE } from "$/base/numeric-constants";
import { PixelResizeMethod, type PixelBuffer, type Rect } from "$/base/primitives";
import { expandAsepriteSamples, asepriteRgbMap } from "$/color/samples";
import type { AsepritePalette } from "$/import-export/aseprite/model";

export function cropSampleImage(
  image: AsepriteImageSamples,
  bounds: Rect,
  fill: readonly number[],
): AsepriteImageSamples {
  if (
    bounds.x === 0 &&
    bounds.y === 0 &&
    bounds.width === image.width &&
    bounds.height === image.height
  )
    return image;
  const stride = image.depth / BITS_PER_BYTE,
    data = new Uint8Array(bounds.width * bounds.height * stride);
  for (let y = 0; y < bounds.height; y++)
    for (let x = 0; x < bounds.width; x++) {
      const sx = x + bounds.x,
        sy = y + bounds.y,
        to = (y * bounds.width + x) * stride;
      if (sx >= 0 && sy >= 0 && sx < image.width && sy < image.height)
        data.set(
          image.data.subarray(
            (sy * image.width + sx) * stride,
            (sy * image.width + sx + 1) * stride,
          ),
          to,
        );
      else data.set(fill, to);
    }
  return { ...image, width: bounds.width, height: bounds.height, data };
}
export function resizeSampleImage(
  image: AsepriteImageSamples,
  width: number,
  height: number,
  method: PixelResizeMethod,
  palette: AsepritePalette,
  maskIndex: number,
  resize: (
    image: PixelBuffer,
    w: number,
    h: number,
    method: PixelResizeMethod,
    fixTransparent?: boolean,
  ) => PixelBuffer,
  imageMaskIndex = maskIndex,
): AsepriteImageSamples {
  if (image.depth === 8 && method !== PixelResizeMethod.Bilinear) {
    // Indexed EPX compares indices, not their potentially duplicate palette colors.
    const tokens = new Uint8ClampedArray(image.width * image.height * 4);
    for (let i = 0; i < image.data.length; i++) tokens.set([image.data[i], 0, 0, UINT8_MAX], i * 4);
    const out = resize(
        { width: image.width, height: image.height, data: tokens },
        width,
        height,
        method,
        false,
      ),
      data = new Uint8Array(width * height);
    for (let i = 0; i < data.length; i++) {
      const index = out.data[i * 4];
      data[i] = method === PixelResizeMethod.RotSprite && index === imageMaskIndex ? 0 : index;
    }
    return { ...image, width, height, data };
  }
  let rgba = expandAsepriteSamples(image, palette, maskIndex);
  if (image.depth === 8) {
    rgba = rgba.slice();
    for (let i = 0; i < image.data.length; i++)
      if (image.data[i] === maskIndex) {
        const c = palette.entries[maskIndex];
        rgba.set([c.red, c.green, c.blue, 0], i * 4);
      }
  }
  const out = resize(
      { width: image.width, height: image.height, data: rgba },
      width,
      height,
      method,
      image.depth !== 8,
    ),
    data = new Uint8Array(width * height * (image.depth / BITS_PER_BYTE));
  const zero = palette.entries.findIndex(
      (c) => c.red === 0 && c.green === 0 && c.blue === 0 && c.alpha === 0,
    ),
    rgbMask = zero >= 0 ? zero : maskIndex < 0 ? -1 : 0;
  for (let i = 0; i < width * height; i++)
    if (image.depth === 8)
      data[i] = asepriteRgbMap(
        out.data[i * 4],
        out.data[i * 4 + 1],
        out.data[i * 4 + 2],
        out.data[i * 4 + 3],
        palette,
        rgbMask,
      );
    else {
      data[i * 2] = out.data[i * 4];
      data[i * 2 + 1] = out.data[i * 4 + 3];
    }
  return { ...image, width, height, data };
}
