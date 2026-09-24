import { decodeImage, readImageAssetBlob } from "$/adapters/files/images";
import { tUi } from "$/i18n";
import {
  decodeGifAnimation,
  decodeWebpAnimation,
  isGifData,
  isWebpData,
  parseWebpAnimation,
  rasterAnimationProject,
  webpAnimationFrameData,
  type RasterAnimation,
  type RasterAnimationFrame,
  type WebpAnimationData,
} from "@xprite/editor-core/import-export";
import type { SessionProject } from "@xprite/editor-core/session";

const MAX_ANIMATION_SOURCE_BYTES = 128 * 1024 * 1024;
const ANIMATION_PROBE_BYTES = 12;
const WEBP_MIME_TYPE = "image/webp";
const RGBA_CHANNELS = 4;

/** Narrow optional API shape; importing animations must also work without WebCodecs. */
interface BrowserImageDecoder {
  readonly tracks: {
    readonly ready: Promise<void>;
    readonly selectedTrack: { readonly frameCount: number; readonly animated: boolean } | null;
  };
  readonly completed: Promise<void>;
  decode(options: { frameIndex: number; completeFramesOnly: boolean }): Promise<{
    readonly complete: boolean;
    readonly image: {
      readonly displayWidth: number;
      readonly displayHeight: number;
      copyTo(
        destination: Uint8ClampedArray,
        options: {
          format: "RGBA";
          layout: { offset: number; stride: number }[];
          colorSpace: "srgb";
        },
      ): Promise<unknown>;
      close(): void;
    };
  }>;
  close(): void;
}

interface BrowserImageDecoderConstructor {
  new (options: { data: Uint8Array; type: string; preferAnimation: boolean }): BrowserImageDecoder;
  isTypeSupported(type: string): Promise<boolean>;
}

/** Use native complete-frame decoding when it can preserve the parsed animation contract. */
async function decodeNativeWebp(
  bytes: Uint8Array,
  metadata: WebpAnimationData,
): Promise<RasterAnimation | null> {
  // Native decoders can treat the ANIM background as a hint. The fallback explicitly honors it.
  if (metadata.background[3] !== 0) return null;
  const Decoder = (
    globalThis as typeof globalThis & { ImageDecoder?: BrowserImageDecoderConstructor }
  ).ImageDecoder;
  if (!Decoder) return null;
  let decoder: BrowserImageDecoder | undefined;
  try {
    if (!(await Decoder.isTypeSupported(WEBP_MIME_TYPE))) return null;
    decoder = new Decoder({ data: bytes, type: WEBP_MIME_TYPE, preferAnimation: true });
    // The input is complete, so wait for final track counts, not a streaming estimate.
    await Promise.all([decoder.tracks.ready, decoder.completed]);
    const track = decoder.tracks.selectedTrack;
    if (!track?.animated || track.frameCount !== metadata.frames.length) return null;
    const frames: RasterAnimationFrame[] = [];
    for (let index = 0; index < track.frameCount; index++) {
      const result = await decoder.decode({ frameIndex: index, completeFramesOnly: true });
      try {
        if (
          !result.complete ||
          result.image.displayWidth !== metadata.width ||
          result.image.displayHeight !== metadata.height
        )
          return null;
        const data = new Uint8ClampedArray(metadata.width * metadata.height * RGBA_CHANNELS);
        await result.image.copyTo(data, {
          format: "RGBA",
          colorSpace: "srgb",
          layout: [{ offset: 0, stride: metadata.width * RGBA_CHANNELS }],
        });
        frames.push({
          pixels: { width: metadata.width, height: metadata.height, data },
          durationMs: metadata.frames[index].durationMs,
        });
      } finally {
        result.image.close();
      }
    }
    return {
      width: metadata.width,
      height: metadata.height,
      frames,
      loopCount: metadata.loopCount,
    };
  } catch {
    // Older VideoFrame implementations cannot copy to RGBA. Decode the demuxed still frames.
    return null;
  } finally {
    decoder?.close();
  }
}

/** Recognized malformed animations fail visibly; they never silently become their first frame. */
export async function decodeAnimatedImageSource(
  source: Blob | { readonly url: string; readonly name: string },
  name: string,
): Promise<SessionProject | null> {
  // All local files are signature-probed, including files with absent or inaccurate MIME types.
  // Asset names are trusted only to avoid a redundant network load for ordinary asset images.
  if (!(source instanceof Blob) && !/\.(?:gif|webp)$/i.test(name)) return null;
  const blob = source instanceof Blob ? source : await readImageAssetBlob(source.url);
  const signature = new Uint8Array(await blob.slice(0, ANIMATION_PROBE_BYTES).arrayBuffer());
  if (!isGifData(signature) && !isWebpData(signature)) return null;
  if (blob.size > MAX_ANIMATION_SOURCE_BYTES)
    throw new RangeError(
      tUi("ui.animated.image.source.too.large", {
        limit: MAX_ANIMATION_SOURCE_BYTES / (1024 * 1024),
      }),
    );
  const bytes = new Uint8Array(await blob.arrayBuffer());
  if (isGifData(bytes)) {
    const animation = decodeGifAnimation(bytes);
    return animation ? rasterAnimationProject(animation) : null;
  }
  const metadata = parseWebpAnimation(bytes);
  if (!metadata) return null;
  const animation =
    (await decodeNativeWebp(bytes, metadata)) ??
    (await decodeWebpAnimation(metadata, async (frame, profileChunk) => {
      const encoded = webpAnimationFrameData(frame, profileChunk);
      try {
        return await decodeImage(
          new Blob([encoded.buffer as ArrayBuffer], { type: WEBP_MIME_TYPE }),
          {
            maxWidth: frame.width,
            maxHeight: frame.height,
            maxPixels: frame.width * frame.height,
          },
        );
      } catch (reason) {
        const detail = reason instanceof Error ? reason.message : String(reason);
        throw new Error(tUi("ui.webp.frame.decode.failed", { detail }));
      }
    }));
  return rasterAnimationProject(animation);
}
