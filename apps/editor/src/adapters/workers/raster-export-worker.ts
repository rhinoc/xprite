import {
  RasterWorkerFormat,
  type RasterWorkerRequest,
  type RasterWorkerResponse,
} from "$/adapters/workers/raster-export-worker-types";
import { encodePngRowSource, ImageEncodingFormat } from "@xprite/bedrock/browser/images";
import { createPixelBufferRowSource } from "@xprite/bedrock/common/png-encode";
import { createExportRowSource, encodeJpegChunks } from "@xprite/editor-core/import-export";

const scope = globalThis as unknown as {
  addEventListener(
    type: "message",
    listener: (event: MessageEvent<RasterWorkerRequest>) => void,
  ): void;
  postMessage(response: RasterWorkerResponse): void;
};

scope.addEventListener("message", ({ data: request }) => {
  void (async () => {
    try {
      const source = {
        width: request.source.width,
        height: request.source.height,
        data: new Uint8ClampedArray(
          request.source.data,
          request.source.byteOffset,
          request.source.length,
        ),
      };
      const rowSource = request.plan
        ? createExportRowSource({ source, ...request.plan })
        : createPixelBufferRowSource(source);
      let blob: Blob;
      if (request.format === RasterWorkerFormat.Png) {
        blob = await encodePngRowSource(rowSource);
      } else {
        const chunks = encodeJpegChunks(rowSource, request.qualityPercent, request.matte);
        blob = new Blob(chunks, { type: ImageEncodingFormat.Jpeg });
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
