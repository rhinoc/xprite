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

interface StartedJob<Result> {
  result: Promise<Result>;
  /** Fail the job as cancelled; no-op once it has settled. */
  cancel(): void;
}

/**
 * Post one request and wait for its one answer. `release` runs once, as the job settles, after
 * the handlers are detached; `usable` is false when the worker may still be busy or broken
 * (cancelled, timed out, transport failure), true when it answered.
 */
function startWorkerJob<Request, Response, Result>(
  options: WorkerJobOptions<Request, Response, Result>,
  release: (usable: boolean) => void,
): StartedJob<Result> {
  let cancel = () => {};
  const result = new Promise<Result>((resolve, reject) => {
    const { worker, signal } = options;
    let settled = false;
    let timeout: ReturnType<typeof setTimeout> | undefined;
    const dispose = (usable: boolean) => {
      if (timeout !== undefined) clearTimeout(timeout);
      signal?.removeEventListener("abort", abort);
      worker.onmessage = null;
      worker.onerror = null;
      worker.onmessageerror = null;
      release(usable);
    };
    const fail = (reason: unknown, usable = false) => {
      if (settled) return;
      settled = true;
      dispose(usable);
      reject(reason);
    };
    const abort = () => fail(new DOMException("Cancelled", "AbortError"));
    cancel = abort;
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
        dispose(true);
        resolve(result);
      } catch (reason) {
        // The worker answered: a reported failure leaves it ready for the next job.
        fail(reason, true);
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
  return { result, cancel: () => cancel() };
}

/** Execute exactly one request. Construction and unavailable-worker fallback
 * belong to the adapter; a started job is never retried by this helper. */
export function runWorkerJob<Request, Response, Result>(
  options: WorkerJobOptions<Request, Response, Result>,
): Promise<Result> {
  return startWorkerJob(options, () => options.worker.terminate()).result;
}

/**
 * One worker reused for jobs that run one at a time, so module-level caches and compiled code in
 * the worker survive between jobs. A job that is cancelled, times out or loses its transport takes
 * the worker with it (a synchronous job can only be stopped by terminating its thread); the next
 * job starts a new one. Starting a job while another runs cancels the running one.
 */
export class SerialWorker {
  private worker: Worker | undefined;
  private running: StartedJob<unknown> | undefined;
  constructor(private readonly create: () => Worker) {}
  /** Start the worker ahead of the first job, so loading its script overlaps other work. */
  prepare(): void {
    this.worker ??= this.create();
  }
  run<Request, Response, Result>(
    options: Omit<WorkerJobOptions<Request, Response, Result>, "worker">,
  ): Promise<Result> {
    this.running?.cancel();
    const worker = (this.worker ??= this.create());
    let settled = false;
    let job: StartedJob<Result> | undefined;
    job = startWorkerJob<Request, Response, Result>({ ...options, worker }, (usable) => {
      settled = true;
      if (job && this.running === job) this.running = undefined;
      if (usable || this.worker !== worker) return;
      worker.terminate();
      this.worker = undefined;
    });
    // A job refused before posting (already cancelled, bad timeout) has settled synchronously.
    if (!settled) this.running = job;
    return job.result;
  }
  dispose(): void {
    this.running?.cancel();
    this.worker?.terminate();
    this.worker = undefined;
  }
}
