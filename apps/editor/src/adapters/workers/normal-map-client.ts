import type {
  NormalMapWorkerRequest,
  NormalMapWorkerResponse,
} from "$/adapters/workers/normal-map-worker";
import { workerLoadFailed } from "$/adapters/workers/worker-load-failure";
import { tUi } from "$/i18n";
import {
  NormalMapProcessingOperation,
  NormalMapProcessingFailure,
  type NormalMapProcessingInput,
  NormalMapProcessingPort,
} from "$/managers/ports/normal-map-processing";
import { WorkerRequestChannel } from "@xprite/bedrock/browser/worker-request-channel";
import type { PixelBuffer } from "@xprite/editor-core/base";

/** Keep at most one running job and the newest queued preview. Never transfer borrowed document pixels. */
export function createBrowserNormalMapProcessor(): NormalMapProcessingPort {
  const worker = new Worker(new URL("./normal-map-worker.ts", import.meta.url), { type: "module" });
  const channel = new WorkerRequestChannel<NormalMapWorkerRequest, NormalMapWorkerResponse>(
    worker,
    {
      closedError: () => new Error(tUi("normal.processing.closed")),
      transportError: (_event, failure) =>
        failure.startup
          ? workerLoadFailed(tUi("normal.processing.failed"))
          : new Error(tUi("normal.processing.failed")),
    },
  );
  let running = false;
  let source: PixelBuffer | null = null;
  let generationSource: PixelBuffer | null = null;
  let normals: PixelBuffer | null | undefined;
  let queued: { start(): void; reject(reason: Error): void } | null = null;
  const cancelled = () => new DOMException("Preview was superseded", "AbortError");
  return {
    process(input: NormalMapProcessingInput) {
      return new Promise<PixelBuffer>((resolve, reject) => {
        const start = () => {
          running = true;
          const id = channel.nextRequestId();
          let request: NormalMapWorkerRequest;
          if (input.operation === NormalMapProcessingOperation.Light) {
            const changed = source !== input.source || normals !== input.normals;
            request = {
              id,
              operation: input.operation,
              options: input.options,
              ...(changed ? { textures: { source: input.source, normals: input.normals } } : {}),
            };
            source = input.source;
            normals = input.normals;
          } else {
            request = {
              id,
              operation: input.operation,
              options: input.options,
              ...(generationSource !== input.source ? { source: input.source } : {}),
            };
            generationSource = input.source;
          }
          void channel
            .request(request, (response) => {
              if ("error" in response)
                throw new Error(
                  response.error === NormalMapProcessingFailure.SourceUnavailable
                    ? tUi("normal.processing.failed")
                    : response.error,
                );
              return response.pixels;
            })
            .then(resolve, reject)
            .finally(() => {
              running = false;
              const next = queued;
              queued = null;
              next?.start();
            });
        };
        if (!running) start();
        else {
          queued?.reject(cancelled());
          queued = { start, reject };
        }
      });
    },
    dispose() {
      queued?.reject(cancelled());
      queued = null;
      channel.close();
    },
  };
}
