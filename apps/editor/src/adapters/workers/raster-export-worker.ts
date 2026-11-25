import {
  RasterWorkerFormat,
  type RasterWorkerPixelBuffer,
  type RasterWorkerRequest,
  type RasterWorkerResponse,
} from "$/adapters/workers/raster-export-worker-types";
import { encodePngRowSource, ImageEncodingFormat } from "@xprite/bedrock/browser/images";
import { createPixelBufferRowSource } from "@xprite/bedrock/common/png-encode";
import {
  createExportRowSource,
  encodeGifRowSources,
  encodeJpegChunks,
} from "@xprite/editor-core/import-export";

const GIF_MIME_TYPE = "image/gif";

const scope = globalThis as unknown as {
  addEventListener(
    type: "message",
    listener: (event: MessageEvent<RasterWorkerRequest>) => void,
  ): void;
  postMessage(response: RasterWorkerResponse): void;
};

function decodeWorkerPixelBuffer(buffer: RasterWorkerPixelBuffer) {
  return {
    width: buffer.width,
    height: buffer.height,
    data: new Uint8ClampedArray(buffer.data, buffer.byteOffset, buffer.length),
  };
}

scope.addEventListener("message", ({ data: request }) => {
  void (async () => {
    try {
      let blob: Blob;
      if (request.format === RasterWorkerFormat.Gif) {
        const sources = request.sources.map(decodeWorkerPixelBuffer);
        const chunks = encodeGifRowSources(
          request.frames.map((frame) => {
            const source = sources[frame.sourceIndex];
            return {
              rowSource: frame.plan
                ? createExportRowSource({ source, ...frame.plan })
                : createPixelBufferRowSource(source),
              duration: frame.duration,
              palette: frame.palette,
            };
          }),
          request.options,
        );
        blob = new Blob(chunks, { type: GIF_MIME_TYPE });
      } else {
        const source = decodeWorkerPixelBuffer(request.source);
        const rowSource = request.plan
          ? createExportRowSource({ source, ...request.plan })
          : createPixelBufferRowSource(source);
        if (request.format === RasterWorkerFormat.Png) {
          blob = await encodePngRowSource(rowSource);
        } else {
          const chunks = encodeJpegChunks(rowSource, request.qualityPercent, request.matte);
          blob = new Blob(chunks, { type: ImageEncodingFormat.Jpeg });
        }
      }
      scope.postMessage({ ok: true, blob });
    } catch (error) {
      scope.postMessage({
        ok: false,
        message: error instanceof Error ? error.message : String(error),
      });
    }
  })();
});
