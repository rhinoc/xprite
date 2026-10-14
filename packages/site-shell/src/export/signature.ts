import { FontRole, macintoshTheme, UiColorScheme } from "@xprite/ui";
import { measureUiText, paintUiText, preloadUiAssets } from "@xprite/ui/assets";

import { artifactTextPixels } from "./raster-text";

interface ArtifactPixels {
  width: number;
  height: number;
  data: Uint8ClampedArray;
}

const CHANNELS = 4;
const TEXT_PADDING = 8;
const TEXT_GAP = 2;
const LOGO_GAP = 8;
const INK = "#000000";
const INK_ALPHA_THRESHOLD = 128;
const OPAQUE = 255;
const PNG_TITLE_SIZE = 32;
const PNG_ADDRESS_SIZE = 22;
const PNG_TEXT_GAP = 6;
const PNG_LOGO_GAP = 20;

function trimInk(image: ArtifactPixels): ArtifactPixels {
  let left = image.width,
    top = image.height,
    right = 0,
    bottom = 0;
  for (let y = 0; y < image.height; y++)
    for (let x = 0; x < image.width; x++) {
      if (!image.data[(y * image.width + x) * CHANNELS + 3]) continue;
      left = Math.min(left, x);
      top = Math.min(top, y);
      right = Math.max(right, x + 1);
      bottom = Math.max(bottom, y + 1);
    }
  if (left >= right || top >= bottom) throw new Error("The artifact artwork is empty.");
  const width = right - left,
    height = bottom - top;
  const data = new Uint8ClampedArray(width * height * CHANNELS);
  for (let y = 0; y < height; y++) {
    const start = ((top + y) * image.width + left) * CHANNELS;
    data.set(image.data.subarray(start, start + width * CHANNELS), y * width * CHANNELS);
  }
  return { width, height, data };
}

/** Site typography and artwork, aligned by visible ink and shared by PNG and PDF. */
export async function renderArtifactSignature(
  name: string,
  url: string,
  logo: ArtifactPixels,
  pixelFont: boolean,
) {
  const assets = pixelFont
    ? await preloadUiAssets(UiColorScheme.Light, "en", macintoshTheme)
    : null;
  const renderText = (value: string, font: FontRole): ArtifactPixels => {
    if (!assets)
      return trimInk(
        artifactTextPixels(value, font === FontRole.Primary ? PNG_TITLE_SIZE : PNG_ADDRESS_SIZE),
      );
    const canvas = document.createElement("canvas");
    canvas.width =
      Math.ceil(measureUiText(value, font, 2, assets.style.typography)) + TEXT_PADDING * 2;
    canvas.height = assets.style.typography[font].fontSize + TEXT_PADDING * 2;
    const context = canvas.getContext("2d", { willReadFrequently: true });
    if (!context) throw new Error("Artifact text rendering is unavailable.");
    paintUiText(context, assets, value, TEXT_PADDING, TEXT_PADDING, { font, color: INK });
    const data = context.getImageData(0, 0, canvas.width, canvas.height).data;
    for (let offset = 3; offset < data.length; offset += CHANNELS)
      data[offset] = data[offset] >= INK_ALPHA_THRESHOLD ? OPAQUE : 0;
    return trimInk({
      width: canvas.width,
      height: canvas.height,
      data,
    });
  };
  const title = renderText(name, FontRole.Primary);
  const address = renderText(url.replace(/^https?:\/\//, ""), FontRole.Compact);
  const mark = trimInk(logo);
  const textGap = pixelFont ? TEXT_GAP : PNG_TEXT_GAP;
  const logoScale = Math.ceil((title.height + textGap + address.height) / mark.height);
  const height = mark.height * logoScale;
  const textLeft = mark.width * logoScale + (pixelFont ? LOGO_GAP : PNG_LOGO_GAP);
  const width = textLeft + Math.max(title.width, address.width);
  const signature = { width, height, data: new Uint8ClampedArray(width * height * CHANNELS) };
  const copy = (image: ArtifactPixels, left: number, top: number, scale = 1) => {
    for (let y = 0; y < image.height * scale; y++)
      for (let x = 0; x < image.width * scale; x++) {
        const source = (Math.floor(y / scale) * image.width + Math.floor(x / scale)) * CHANNELS;
        const target = ((top + y) * width + left + x) * CHANNELS;
        signature.data.set(image.data.subarray(source, source + CHANNELS), target);
      }
  };
  copy(mark, 0, 0, logoScale);
  copy(title, textLeft, 0);
  copy(address, textLeft, height - address.height);
  return signature;
}
