import { encodePngBlob } from "@xprite/bedrock/browser/images";
import { convertPixelsToSrgb, type ClipboardImage } from "@xprite/editor-core";

/** Filename used when File → Open from Clipboard wraps the clipboard image as an import source. */
export const CLIPBOARD_OPEN_FILE_NAME = "Clipboard.png";

/** Encode a clipboard image as a PNG File so openSource/requestImport can mount Import Options. */
export async function fileFromClipboardImage(
  image: ClipboardImage,
  encode: typeof encodePngBlob = encodePngBlob,
): Promise<File> {
  const png = await encode(convertPixelsToSrgb(image.pixels, image.sourceProfile));
  return new File([png], CLIPBOARD_OPEN_FILE_NAME, { type: "image/png" });
}
