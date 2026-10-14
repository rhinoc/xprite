import type { WebpExportPort } from "$/managers/ports/webp-export";
import { ImageEncodingFormat, isImageEncodingSupported } from "@xprite/bedrock/browser/images";

export async function inspectImageEncodingCapabilities(webp?: WebpExportPort) {
  const [jpeg, nativeWebp] = await Promise.all([
    isImageEncodingSupported(ImageEncodingFormat.Jpeg),
    isImageEncodingSupported(ImageEncodingFormat.Webp),
  ]);
  const webpLossless = webp?.supportsLossless() ?? false;
  const webpLossy = !!webp && nativeWebp;
  return { jpeg, webp: webpLossless || webpLossy, webpLossless, webpLossy, checked: true };
}
