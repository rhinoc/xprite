import type {
  NormalMapWorkerRequest,
  NormalMapWorkerResponse,
} from "$/adapters/workers/normal-map-worker";
import {
  announceWorkerLoadFailure,
  WORKER_LOAD_ATTEMPTS,
  WORKER_LOAD_RETRY_DELAY_MS,
  workerLoadError,
} from "$/adapters/workers/worker-load-failure";
import { tUi } from "$/i18n";
import {
  NormalMapProcessingOperation,
  NormalMapProcessingFailure,
  type NormalMapProcessingInput,
  type NormalMapProcessingResult,
  type NormalMapProcessingPort,
} from "$/managers/ports/normal-map-processing";
import {
  ManagedWorkerClient,
  WorkerFailureKind,
  type ManagedWorkerTransport,
} from "@xprite/bedrock/browser/managed-worker";
import type { PixelBuffer } from "@xprite/editor-core/base";

const WORKER_LOAD_DIAGNOSTIC = "The normal map worker script could not be loaded";

export interface BrowserNormalMapProcessorOptions {
  workerFactory?: () => ManagedWorkerTransport<NormalMapWorkerRequest>;
  retryDelayMs?: number;
}

function createNormalMapWorker(): Worker {
  return new Worker(new URL("./normal-map-worker.ts", import.meta.url), { type: "module" });
}

/** Keep at most one running job and the newest queued preview. Never transfer borrowed document pixels. */
export function createBrowserNormalMapProcessor(
  options: BrowserNormalMapProcessorOptions = {},
): NormalMapProcessingPort {
  let running = false;
  let source: PixelBuffer | null = null;
  const generationSources = new Map<NormalMapProcessingOperation, PixelBuffer>();
  let generationShading: PixelBuffer | null | undefined;
  let normals: PixelBuffer | null | undefined;
  let mask: PixelBuffer | null | undefined;
  let queued: { start(): void; reject(reason: Error): void } | null = null;
  const resetCache = () => {
    source = null;
    generationSources.clear();
    generationShading = undefined;
    normals = undefined;
    mask = undefined;
  };
  const client = new ManagedWorkerClient<NormalMapWorkerRequest, NormalMapWorkerResponse>({
    workerFactory: options.workerFactory ?? createNormalMapWorker,
    lazy: true,
    maxStartupAttempts: WORKER_LOAD_ATTEMPTS,
    retryDelayMs: options.retryDelayMs ?? WORKER_LOAD_RETRY_DELAY_MS,
    closedError: () => new Error(tUi("normal.processing.closed")),
    formatError: (info) =>
      info.kind === WorkerFailureKind.Startup
        ? workerLoadError(WORKER_LOAD_DIAGNOSTIC)
        : new Error(tUi("normal.processing.failed")),
    onWorkerReset: resetCache,
    onStartupFailureExhausted: (error) => announceWorkerLoadFailure(error),
  });
  const cancelled = () => new DOMException("Preview was superseded", "AbortError");
  return {
    process(input: NormalMapProcessingInput) {
      return new Promise<NormalMapProcessingResult>((resolve, reject) => {
        const start = () => {
          running = true;
          void client
            .request<NormalMapProcessingResult>({
              buildRequest: (id) => {
                let request: NormalMapWorkerRequest;
                if (input.operation === NormalMapProcessingOperation.Light) {
                  const changed =
                    source !== input.source || normals !== input.normals || mask !== input.mask;
                  request = {
                    id,
                    operation: input.operation,
                    options: input.options,
                    ...(changed
                      ? {
                          textures: {
                            source: input.source,
                            normals: input.normals,
                            mask: input.mask,
                          },
                        }
                      : {}),
                  };
                  source = input.source;
                  normals = input.normals;
                  mask = input.mask;
                } else {
                  const sourceChanged = generationSources.get(input.operation) !== input.source;
                  const nextSource = sourceChanged ? input.source : undefined;
                  if (input.operation === NormalMapProcessingOperation.Generate) {
                    request = {
                      ...input,
                      id,
                      source: nextSource,
                      shading:
                        sourceChanged || generationShading !== input.shading
                          ? input.shading
                          : undefined,
                    };
                    generationShading = input.shading;
                  } else request = { ...input, id, source: nextSource };
                  generationSources.set(input.operation, input.source);
                }
                return { request };
              },
              readResponse: (response) => {
                if ("error" in response)
                  throw new Error(
                    response.error === NormalMapProcessingFailure.SourceUnavailable
                      ? tUi("normal.processing.failed")
                      : response.error,
                  );
                return {
                  pixels: response.pixels,
                  suggestedPaintedLightAngle: response.suggestedPaintedLightAngle,
                };
              },
            })
            .then(resolve, (error: unknown) => {
              if (input.operation === NormalMapProcessingOperation.Light) source = null;
              else generationSources.delete(input.operation);
              reject(error);
            })
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
      client.close();
    },
  };
}
