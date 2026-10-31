import { UINT8_MAX } from "$/base/numeric-constants";
import type { PixelBuffer } from "$/base/primitives";
import { assertDimension, assertPixelCount, clampByte } from "$/document/pixel-validation";

export function resizeNearest(image: PixelBuffer, width: number, height: number): PixelBuffer {
  assertDimension(width, "width");
  assertDimension(height, "height");
  assertPixelCount(width, height);
  const output = new Uint8ClampedArray(width * height * 4);
  const source = image.data;
  for (let y = 0; y < height; y += 1) {
    const sourceY = Math.min(image.height - 1, Math.floor((y * image.height) / height));
    for (let x = 0; x < width; x += 1) {
      const sourceX = Math.min(image.width - 1, Math.floor((x * image.width) / width));
      const sourceOffset = (sourceY * image.width + sourceX) * 4;
      const outputOffset = (y * width + x) * 4;
      output[outputOffset] = source[sourceOffset];
      output[outputOffset + 1] = source[sourceOffset + 1];
      output[outputOffset + 2] = source[sourceOffset + 2];
      output[outputOffset + 3] = source[sourceOffset + 3];
    }
  }
  return { width, height, data: output };
}

export function resizeBox(
  image: PixelBuffer,
  width: number,
  height: number,
  alphaMode: "straight" | "premultiplied",
): PixelBuffer {
  assertDimension(width, "width");
  assertDimension(height, "height");
  assertPixelCount(width, height);
  const output = new Uint8ClampedArray(width * height * 4);
  const source = image.data;
  for (let y = 0; y < height; y += 1) {
    const sourceTop = (y * image.height) / height;
    const sourceBottom = ((y + 1) * image.height) / height;
    const firstY = Math.floor(sourceTop);
    const lastY = Math.min(image.height - 1, Math.ceil(sourceBottom) - 1);
    for (let x = 0; x < width; x += 1) {
      const sourceLeft = (x * image.width) / width;
      const sourceRight = ((x + 1) * image.width) / width;
      const firstX = Math.floor(sourceLeft);
      const lastX = Math.min(image.width - 1, Math.ceil(sourceRight) - 1);
      let weightTotal = 0;
      let red = 0;
      let green = 0;
      let blue = 0;
      let alpha = 0;
      for (let sourceY = firstY; sourceY <= lastY; sourceY += 1) {
        const yWeight = Math.min(sourceBottom, sourceY + 1) - Math.max(sourceTop, sourceY);
        if (yWeight <= 0) continue;
        for (let sourceX = firstX; sourceX <= lastX; sourceX += 1) {
          const weight =
            yWeight * (Math.min(sourceRight, sourceX + 1) - Math.max(sourceLeft, sourceX));
          if (weight <= 0) continue;
          const sourceOffset = (sourceY * image.width + sourceX) * 4;
          const sourceAlpha = source[sourceOffset + 3];
          weightTotal += weight;
          alpha += sourceAlpha * weight;
          if (alphaMode === "premultiplied") {
            const alphaWeight = sourceAlpha / UINT8_MAX;
            red += source[sourceOffset] * alphaWeight * weight;
            green += source[sourceOffset + 1] * alphaWeight * weight;
            blue += source[sourceOffset + 2] * alphaWeight * weight;
          } else {
            red += source[sourceOffset] * weight;
            green += source[sourceOffset + 1] * weight;
            blue += source[sourceOffset + 2] * weight;
          }
        }
      }
      const outputOffset = (y * width + x) * 4;
      const averageAlpha = weightTotal === 0 ? 0 : alpha / weightTotal;
      output[outputOffset + 3] = clampByte(averageAlpha);
      if (alphaMode === "premultiplied") {
        const alphaTotal = alpha / UINT8_MAX;
        output[outputOffset] = clampByte(alphaTotal === 0 ? 0 : red / alphaTotal);
        output[outputOffset + 1] = clampByte(alphaTotal === 0 ? 0 : green / alphaTotal);
        output[outputOffset + 2] = clampByte(alphaTotal === 0 ? 0 : blue / alphaTotal);
      } else {
        output[outputOffset] = clampByte(weightTotal === 0 ? 0 : red / weightTotal);
        output[outputOffset + 1] = clampByte(weightTotal === 0 ? 0 : green / weightTotal);
        output[outputOffset + 2] = clampByte(weightTotal === 0 ? 0 : blue / weightTotal);
      }
    }
  }
  return { width, height, data: output };
}
