export interface WorkerRequestTransport<Request> {
  postMessage(request: Request, transfer?: Transferable[]): void;
  addEventListener(type: "message" | "error" | "messageerror", listener: EventListener): void;
  removeEventListener(type: "message" | "error" | "messageerror", listener: EventListener): void;
  terminate?(): void;
}

/** How a worker failed, as far as the page can tell. */
export interface WorkerTransportFailure {
  /**
   * The worker never answered, and the browser reported no script error (no message, file or
   * error object). Browsers report a worker script, or a module it imports, that could not be
   * fetched or evaluated this way. Typically the page runs a release whose files were replaced.
   */
  readonly startup: boolean;
}

/** A plain `error` event with no script error details, as fired for a worker that never loaded. */
export function isOpaqueWorkerError(event: Event): boolean {
  if (event.type !== "error") return false;
  const details = event as Partial<Pick<ErrorEvent, "message" | "filename" | "error">>;
  return !details.message && !details.filename && details.error == null;
}

interface PendingResponse<Response> {
  resolve(response: Response): void;
  reject(reason: unknown): void;
}

/** Multiplex requests on one worker. Protocol decoding and recovery belong to the adapter. */
export class WorkerRequestChannel<Request extends { id: number }, Response extends { id: number }> {
  private nextId = 1;
  private closed = false;
  private failure: Error | null = null;
  private answered = false;
  private readonly pending = new Map<number, PendingResponse<Response>>();
  constructor(
    private readonly worker: WorkerRequestTransport<Request>,
    private readonly options: {
      closedError(): Error;
      transportError(event: Event, failure: WorkerTransportFailure): Error;
      onFatalError?(error: Error): void;
      firstRequestId?: number;
    },
  ) {
    this.nextId = options.firstRequestId ?? 1;
    worker.addEventListener("message", this.onMessage);
    worker.addEventListener("error", this.onError);
    worker.addEventListener("messageerror", this.onError);
  }
  nextRequestId(): number {
    return this.nextId++;
  }
  get isClosed(): boolean {
    return this.closed;
  }
  get isFailed(): boolean {
    return this.failure !== null;
  }
  private readonly onMessage = (event: Event) => {
    this.answered = true;
    const response = (event as MessageEvent<Response>).data;
    if (!response || !Number.isSafeInteger(response.id)) return;
    const pending = this.pending.get(response.id);
    if (!pending) return;
    this.pending.delete(response.id);
    pending.resolve(response);
  };
  private readonly onError = (event: Event) => {
    if (this.closed || this.failure) return;
    const error = this.options.transportError(event, {
      startup: !this.answered && isOpaqueWorkerError(event),
    });
    this.failure = error;
    // Detach the failed batch before callbacks can enqueue an explicit retry.
    const pending = [...this.pending.values()];
    this.pending.clear();
    try {
      this.options.onFatalError?.(error);
    } finally {
      for (const request of pending) request.reject(error);
    }
  };
  request<Result>(
    request: Request,
    readResponse: (response: Response) => Result,
    transfer?: Transferable[],
  ): Promise<Result> {
    if (this.closed) return Promise.reject(this.options.closedError());
    if (this.failure) return Promise.reject(this.failure);
    return new Promise((resolve, reject) => {
      this.pending.set(request.id, {
        resolve(response) {
          try {
            resolve(readResponse(response));
          } catch (error) {
            reject(error);
          }
        },
        reject,
      });
      try {
        if (transfer) this.worker.postMessage(request, transfer);
        else this.worker.postMessage(request);
      } catch (error) {
        this.pending.delete(request.id);
        reject(error);
      }
    });
  }
  cancel(id: number, reason: unknown): boolean {
    const pending = this.pending.get(id);
    if (!pending) return false;
    this.pending.delete(id);
    pending.reject(reason);
    return true;
  }
  close(reason: unknown = this.options.closedError()): void {
    if (this.closed) return;
    this.closed = true;
    for (const request of this.pending.values()) request.reject(reason);
    this.pending.clear();
    this.worker.removeEventListener("message", this.onMessage);
    this.worker.removeEventListener("error", this.onError);
    this.worker.removeEventListener("messageerror", this.onError);
    this.worker.terminate?.();
  }
}
