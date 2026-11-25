import type { WebpExportPort } from "$/managers/ports/webp-export";
import { ImageEncodingFormat, isImageEncodingSupported } from "@xprite/bedrock/browser/images";

export async function inspectImageEncodingCapabilities(webp?: WebpExportPort) {
  const nativeWebp = await isImageEncodingSupported(ImageEncodingFormat.Webp);
  const webpLossless = webp?.supportsLossless() ?? false;
  const webpLossy = !!webp && nativeWebp;
  // JPEG uses native canvas for small images and falls back to the portable streaming encoder.
  return { jpeg: true, webp: webpLossless || webpLossy, webpLossless, webpLossy, checked: true };
}
