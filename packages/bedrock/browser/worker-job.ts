export interface WorkerJobOptions<Request, Response, Result> {
  /** A dedicated worker whose lifetime belongs to this operation. */
  worker: Worker;
  request: Request;
  /** Only buffers the caller explicitly relinquishes are transferred. */
  transfer?: readonly Transferable[];
  signal?: AbortSignal;
  timeoutMs: number;
  timeoutError: () => Error;
  transportError: () => Error;
  /** Decode the protocol result, throwing for a reported operation failure. */
  readResponse: (response: Response) => Result;
}

/** Execute exactly one request. Construction and unavailable-worker fallback
 * belong to the adapter; a started job is never retried by this helper. */
export function runWorkerJob<Request, Response, Result>(
  options: WorkerJobOptions<Request, Response, Result>,
): Promise<Result> {
  return new Promise((resolve, reject) => {
    const { worker, signal } = options;
    let settled = false;
    let timeout: ReturnType<typeof setTimeout> | undefined;
    const dispose = () => {
      if (timeout !== undefined) clearTimeout(timeout);
      signal?.removeEventListener("abort", abort);
      worker.onmessage = null;
      worker.onerror = null;
      worker.onmessageerror = null;
      worker.terminate();
    };
    const fail = (reason: unknown) => {
      if (settled) return;
      settled = true;
      dispose();
      reject(reason);
    };
    const abort = () => fail(new DOMException("Cancelled", "AbortError"));
    if (signal?.aborted) {
      abort();
      return;
    }
    if (!Number.isSafeInteger(options.timeoutMs) || options.timeoutMs <= 0) {
      fail(new RangeError("Worker timeout must be a positive safe integer"));
      return;
    }
    worker.onmessage = ({ data }: MessageEvent<Response>) => {
      if (settled) return;
      try {
        const result = options.readResponse(data);
        if (settled) return;
        settled = true;
        dispose();
        resolve(result);
      } catch (reason) {
        fail(reason);
      }
    };
    worker.onerror = (event) => {
      event.preventDefault();
      fail(options.transportError());
    };
    worker.onmessageerror = () => fail(options.transportError());
    signal?.addEventListener("abort", abort, { once: true });
    timeout = setTimeout(() => fail(options.timeoutError()), options.timeoutMs);
    try {
      worker.postMessage(options.request, [...(options.transfer ?? [])]);
    } catch {
      fail(options.transportError());
    }
  });
}
