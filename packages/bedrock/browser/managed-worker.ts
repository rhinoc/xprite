import { isOpaqueWorkerError } from "$/worker-request-channel";

export { isOpaqueWorkerError };

/**
 * Default delay before starting a worker again after its script failed to load. Safari cancels
 * loads started during a file handoff or page transition and reports them the same way as a
 * missing script; retrying immediately inside that window fails again.
 */
export const DEFAULT_WORKER_STARTUP_RETRY_DELAY_MS = 1_000;

/** Default startup attempts before reporting a worker script as unavailable. */
export const DEFAULT_WORKER_STARTUP_ATTEMPTS = 2;

export enum WorkerFailureKind {
  /** Worker construction threw or an opaque error fired before any message was received. */
  Startup = "startup",
  /** Non-opaque error event, error after the worker answered, or postMessage failure. */
  Runtime = "runtime",
  /** `messageerror` event: structured-clone deserialization failed. */
  Deserialization = "deserialization",
  /** Client was explicitly closed or disposed. */
  Closed = "closed",
  /** Operation exceeded its configured timeout. */
  Timeout = "timeout",
}

export enum WorkerFailureStage {
  Construction = "construction",
  PostMessage = "post-message",
  Error = "error",
  MessageError = "messageerror",
  Timeout = "timeout",
  Closed = "closed",
}

/**
 * Minimal Worker transport contract supporting both standard EventTarget workers and
 * property-handler workers (`onmessage`/`onerror`/`onmessageerror`).
 */
export interface ManagedWorkerTransport<Request> {
  postMessage(request: Request, transfer?: Transferable[]): void;
  addEventListener?(type: "message" | "error" | "messageerror", listener: EventListener): void;
  removeEventListener?(type: "message" | "error" | "messageerror", listener: EventListener): void;
  onmessage?: ((event: MessageEvent) => void) | null;
  onerror?: ((event: ErrorEvent) => void) | null;
  onmessageerror?: ((event: MessageEvent) => void) | null;
  terminate?(): void;
}

export interface WorkerFailureInfo {
  readonly kind: WorkerFailureKind;
  readonly stage: WorkerFailureStage;
  readonly workerAnswered: boolean;
  readonly event?: Event;
  readonly cause?: unknown;
  readonly message?: string;
  readonly filename?: string;
  readonly line?: number;
  readonly column?: number;
}

export class ManagedWorkerError extends Error {
  readonly kind: WorkerFailureKind;
  readonly info: WorkerFailureInfo;
  readonly cause?: unknown;

  constructor(message: string, info: WorkerFailureInfo) {
    super(message);
    this.name = "ManagedWorkerError";
    this.kind = info.kind;
    this.info = info;
    if (info.cause !== undefined) this.cause = info.cause;
  }
}

export function isManagedWorkerError(
  error: unknown,
  kind?: WorkerFailureKind,
): error is ManagedWorkerError {
  return error instanceof ManagedWorkerError && (kind === undefined || error.kind === kind);
}

/** Classify a worker transport, construction, timeout, or close failure. */
export function classifyWorkerFailure(input: {
  stage: WorkerFailureStage;
  workerAnswered: boolean;
  event?: Event;
  cause?: unknown;
}): WorkerFailureInfo {
  const errEvent = input.event as Partial<ErrorEvent> | undefined;
  const message = typeof errEvent?.message === "string" ? errEvent.message : undefined;
  const filename =
    typeof errEvent?.filename === "string" ? errEvent.filename.split(/[?#]/, 1)[0] : undefined;
  const line = typeof errEvent?.lineno === "number" ? errEvent.lineno : undefined;
  const column = typeof errEvent?.colno === "number" ? errEvent.colno : undefined;
  const cause = errEvent?.error ?? input.cause ?? input.event;

  let kind: WorkerFailureKind;
  if (input.stage === WorkerFailureStage.Construction) {
    kind = WorkerFailureKind.Startup;
  } else if (
    input.stage === WorkerFailureStage.Error &&
    !input.workerAnswered &&
    (!input.event || isOpaqueWorkerError(input.event))
  ) {
    kind = WorkerFailureKind.Startup;
  } else if (input.stage === WorkerFailureStage.MessageError) {
    kind = WorkerFailureKind.Deserialization;
  } else if (input.stage === WorkerFailureStage.Timeout) {
    kind = WorkerFailureKind.Timeout;
  } else if (input.stage === WorkerFailureStage.Closed) {
    kind = WorkerFailureKind.Closed;
  } else {
    kind = WorkerFailureKind.Runtime;
  }

  return {
    kind,
    stage: input.stage,
    workerAnswered: input.workerAnswered,
    event: input.event,
    cause,
    message,
    filename,
    line,
    column,
  };
}

function defaultFailureMessage(info: WorkerFailureInfo): string {
  switch (info.kind) {
    case WorkerFailureKind.Startup:
      return "Worker script could not be loaded";
    case WorkerFailureKind.Deserialization:
      return "Worker message could not be deserialized";
    case WorkerFailureKind.Closed:
      return "Worker client is closed";
    case WorkerFailureKind.Timeout:
      return "Worker operation timed out";
    case WorkerFailureKind.Runtime:
      return info.message || "Worker failed";
  }
}

function createAbortError(message = "Cancelled"): DOMException {
  return new DOMException(message, "AbortError");
}

function attachWorkerListeners<Request>(
  worker: ManagedWorkerTransport<Request>,
  handlers: {
    onMessage: (event: Event) => void;
    onError: (event: Event) => void;
    onMessageError: (event: Event) => void;
  },
): () => void {
  if (
    typeof worker.addEventListener === "function" &&
    typeof worker.removeEventListener === "function"
  ) {
    worker.addEventListener("message", handlers.onMessage);
    worker.addEventListener("error", handlers.onError);
    worker.addEventListener("messageerror", handlers.onMessageError);
    return () => {
      worker.removeEventListener?.("message", handlers.onMessage);
      worker.removeEventListener?.("error", handlers.onError);
      worker.removeEventListener?.("messageerror", handlers.onMessageError);
    };
  }
  worker.onmessage = handlers.onMessage as (event: MessageEvent) => void;
  worker.onerror = handlers.onError as (event: ErrorEvent) => void;
  worker.onmessageerror = handlers.onMessageError as (event: MessageEvent) => void;
  return () => {
    if (worker.onmessage === handlers.onMessage) worker.onmessage = null;
    if (worker.onerror === handlers.onError) worker.onerror = null;
    if (worker.onmessageerror === handlers.onMessageError) worker.onmessageerror = null;
  };
}

/** Resolve after `delayMs`; reject with AbortError when `signal` aborts first. */
export function waitForWorkerRetry(
  delayMs = DEFAULT_WORKER_STARTUP_RETRY_DELAY_MS,
  signal?: AbortSignal,
): Promise<void> {
  return new Promise((resolve, reject) => {
    if (signal?.aborted) {
      reject(createAbortError());
      return;
    }
    const abort = () => {
      clearTimeout(timer);
      reject(createAbortError());
    };
    const timer = setTimeout(() => {
      signal?.removeEventListener("abort", abort);
      resolve();
    }, delayMs);
    signal?.addEventListener("abort", abort, { once: true });
  });
}

function awaitWithAbort<T>(promise: Promise<T>, signal?: AbortSignal): Promise<T> {
  if (!signal) return promise;
  if (signal.aborted) return Promise.reject(createAbortError());
  return new Promise<T>((resolve, reject) => {
    const onAbort = () => reject(createAbortError());
    signal.addEventListener("abort", onAbort, { once: true });
    promise.then(
      (value) => {
        signal.removeEventListener("abort", onAbort);
        resolve(value);
      },
      (reason) => {
        signal.removeEventListener("abort", onAbort);
        reject(reason);
      },
    );
  });
}

export interface ImportWithRetryOptions {
  attempts?: number;
  retryDelayMs?: number;
  signal?: AbortSignal;
}

/**
 * Load a dynamic module needed for in-process fallback. Failed module loads are retried with a
 * delay for the same transient browser cancellation reasons as worker scripts.
 */
export async function importWithRetry<T>(
  load: () => Promise<T>,
  options: number | ImportWithRetryOptions = DEFAULT_WORKER_STARTUP_RETRY_DELAY_MS,
): Promise<T> {
  const resolved = typeof options === "number" ? { retryDelayMs: options } : options;
  const maxAttempts = Math.max(1, resolved.attempts ?? DEFAULT_WORKER_STARTUP_ATTEMPTS);
  const retryDelayMs = resolved.retryDelayMs ?? DEFAULT_WORKER_STARTUP_RETRY_DELAY_MS;
  for (let attempt = 1; ; attempt++) {
    if (resolved.signal?.aborted) throw createAbortError();
    try {
      return await load();
    } catch (error) {
      if (attempt >= maxAttempts) throw error;
      await waitForWorkerRetry(retryDelayMs, resolved.signal);
    }
  }
}

export interface WorkerStartupRetryOptions {
  maxAttempts?: number;
  retryDelayMs?: number;
  signal?: AbortSignal;
  isClosed?: () => boolean;
  closedError?: () => Error;
  isStartupFailure: (error: unknown) => boolean;
  canRetry?: (error: unknown) => boolean;
  onStartupFailureExhausted?: (error: unknown) => unknown;
}

/** Run a worker operation with bounded startup retry and AbortSignal awareness. */
export async function runWithWorkerStartupRetry<T>(
  runAttempt: (attempt: number) => Promise<T>,
  options: WorkerStartupRetryOptions,
): Promise<T> {
  const maxAttempts = Math.max(1, options.maxAttempts ?? DEFAULT_WORKER_STARTUP_ATTEMPTS);
  const retryDelayMs = options.retryDelayMs ?? DEFAULT_WORKER_STARTUP_RETRY_DELAY_MS;
  for (let attempt = 1; ; attempt++) {
    if (options.signal?.aborted) throw createAbortError();
    if (options.isClosed?.()) throw options.closedError?.() ?? new Error("Worker client is closed");
    try {
      return await runAttempt(attempt);
    } catch (error) {
      if (!options.isStartupFailure(error)) throw error;
      if (attempt >= maxAttempts || (options.canRetry && !options.canRetry(error))) {
        const replacement = options.onStartupFailureExhausted?.(error);
        throw replacement ?? error;
      }
      await waitForWorkerRetry(retryDelayMs, options.signal);
      if (options.isClosed?.())
        throw options.closedError?.() ?? new Error("Worker client is closed");
    }
  }
}

class StartupRetrySignal {
  constructor(readonly info: WorkerFailureInfo) {}
}

class StartupFallbackSignal {
  constructor(readonly info: WorkerFailureInfo) {}
}

interface PendingRequestEntry<Response> {
  id: number;
  resolve(response: Response): void;
  reject(reason: unknown): void;
  onIntermediate?(response: Response): boolean;
  formatError?(info: WorkerFailureInfo, requestId: number): Error;
  timeoutMs?: number;
  timeoutError?: () => Error;
  terminateOnTimeout?: boolean;
  timer?: ReturnType<typeof setTimeout>;
  signal?: AbortSignal;
  onAbort?: () => void;
}

export interface ManagedWorkerClientOptions<
  Request extends { id: number },
  _Response extends { id: number } = { id: number },
> {
  /** Pre-created worker, or `null` for workerless/fallback-only mode. Mutually exclusive with `workerFactory`. */
  worker?: ManagedWorkerTransport<Request> | null;
  /** Factory that constructs a worker lazily on first request and on startup retry. */
  workerFactory?: () => ManagedWorkerTransport<Request>;
  /** Delay worker creation until the first request or `prepare()`. Defaults to `true`. */
  lazy?: boolean;
  firstRequestId?: number;
  maxStartupAttempts?: number;
  retryDelayMs?: number;
  /** Whether a throwing `workerFactory()` on attempt 1 is retried. Defaults to `true`. */
  retryConstructionFailure?: boolean;
  /** When `true`, unavailable workers or exhausted startup failures degrade to per-request `fallback`. */
  fallbackOnUnavailable?: boolean;
  /** When `true`, a runtime/deserialization crash detaches the worker and recreates it on the next call. */
  recreateAfterRuntimeFailure?: boolean;
  closedError?: () => Error;
  formatError?: (info: WorkerFailureInfo, requestId?: number) => Error;
  onFatalError?: (error: Error, info: WorkerFailureInfo) => void;
  onStartupFailureExhausted?: (error: Error, info: WorkerFailureInfo) => Error | void;
  onWorkerReset?: (info: WorkerFailureInfo) => void;
}

export interface ManagedWorkerPreparedRequest<Request extends { id: number }> {
  request: Request;
  transfer?: Transferable[];
  /** Optional hook executed on the active worker immediately before posting `request`. */
  beforePost?: (worker: ManagedWorkerTransport<Request>) => Promise<void> | void;
}

export interface ManagedWorkerRequestOptions<
  Request extends { id: number },
  Response extends { id: number },
  Result,
> {
  buildRequest: (id: number) => ManagedWorkerPreparedRequest<Request>;
  readResponse: (response: Response) => Result;
  /** Return `true` if `response` is a streaming intermediate message (keeps request pending and resets timeout). */
  onIntermediate?: (response: Response) => boolean;
  /** Optional per-request error formatter overriding client `formatError`. */
  formatError?: (info: WorkerFailureInfo, requestId: number) => Error;
  timeoutMs?: number;
  timeoutError?: () => Error;
  /** Terminate and fail the worker when this request times out. Defaults to `false`. */
  terminateOnTimeout?: boolean;
  signal?: AbortSignal;
  /** Retry this request when the worker fails during startup before answering. Defaults to `true`. */
  retryOnStartupFailure?: boolean;
  /** Optional in-process fallback invoked when the client is in fallback mode. */
  fallback?: () => Promise<Result> | Result;
  /** Receives each allocated request id before posting (useful for explicit `cancel(id)`). */
  onRequestId?: (id: number) => void;
}

/**
 * Managed persistent multiplexed worker client encapsulating lazy creation, clean detachment and
 * termination, opaque startup failure detection, bounded startup retry, typed failure
 * classification, and optional in-process fallback.
 */
export class ManagedWorkerClient<Request extends { id: number }, Response extends { id: number }> {
  private worker: ManagedWorkerTransport<Request> | null = null;
  private detachListeners: (() => void) | null = null;
  private workerFactory?: () => ManagedWorkerTransport<Request>;
  private readonly maxStartupAttempts: number;
  private readonly retryDelayMs: number;
  private readonly retryConstructionFailure: boolean;
  private readonly fallbackOnUnavailable: boolean;
  private readonly recreateAfterRuntimeFailure: boolean;
  private startupAttempts = 0;
  private workerAnswered = false;
  private inFallback = false;
  private closed = false;
  private closeReason: unknown = undefined;
  private readonly closeController = new AbortController();
  private failure: Error | null = null;
  private restartPromise: Promise<void> | null = null;
  private nextId: number;
  private readonly pending = new Map<number, PendingRequestEntry<Response>>();

  constructor(private readonly options: ManagedWorkerClientOptions<Request, Response>) {
    if (options.worker !== undefined && options.workerFactory) {
      throw new RangeError("Provide worker or workerFactory, not both");
    }
    this.nextId = options.firstRequestId ?? 1;
    this.retryDelayMs = options.retryDelayMs ?? DEFAULT_WORKER_STARTUP_RETRY_DELAY_MS;
    this.fallbackOnUnavailable = options.fallbackOnUnavailable ?? false;
    this.retryConstructionFailure = options.retryConstructionFailure ?? true;
    this.recreateAfterRuntimeFailure = options.recreateAfterRuntimeFailure ?? false;
    this.workerFactory = options.workerFactory;
    this.maxStartupAttempts = this.workerFactory
      ? Math.max(1, options.maxStartupAttempts ?? DEFAULT_WORKER_STARTUP_ATTEMPTS)
      : 1;

    if (options.worker) {
      this.startupAttempts = 1;
      this.attachWorker(options.worker);
    } else if (options.worker === null || !this.workerFactory) {
      this.inFallback = true;
    } else if (options.lazy === false) {
      this.tryPrepareEager();
    }
  }

  get isClosed(): boolean {
    return this.closed;
  }

  get isFailed(): boolean {
    return this.failure !== null;
  }

  get isUsingFallback(): boolean {
    return this.inFallback;
  }

  get hasAnswered(): boolean {
    return this.workerAnswered;
  }

  nextRequestId(): number {
    return this.nextId++;
  }

  /** Eagerly create the worker ahead of the first request. No-op when closed, failed, or in fallback. */
  prepare(): void {
    if (this.closed || this.failure || this.inFallback || this.worker || !this.workerFactory)
      return;
    this.tryPrepareEager();
  }

  private tryPrepareEager(): void {
    if (!this.workerFactory || this.worker) return;
    this.startupAttempts++;
    try {
      this.attachWorker(this.workerFactory());
    } catch {
      if (this.fallbackOnUnavailable && !this.retryConstructionFailure) {
        this.workerFactory = undefined;
        this.inFallback = true;
      } else {
        // Defer construction failure reporting to the first request() so retry/diagnostics work uniformly.
        this.startupAttempts--;
      }
    }
  }

  private closedError(): Error {
    return (
      this.options.closedError?.() ??
      new ManagedWorkerError(
        "Worker client is closed",
        classifyWorkerFailure({
          stage: WorkerFailureStage.Closed,
          workerAnswered: this.workerAnswered,
        }),
      )
    );
  }

  private formatError(info: WorkerFailureInfo, requestId?: number): Error {
    return (
      this.options.formatError?.(info, requestId) ??
      new ManagedWorkerError(defaultFailureMessage(info), info)
    );
  }

  private attachWorker(worker: ManagedWorkerTransport<Request>): void {
    this.worker = worker;
    this.workerAnswered = false;
    this.detachListeners = attachWorkerListeners(worker, {
      onMessage: (event) => this.handleMessage(worker, event as MessageEvent<Response>),
      onError: (event) => {
        event.preventDefault?.();
        this.handleWorkerFailure(worker, WorkerFailureStage.Error, event, event);
      },
      onMessageError: (event) =>
        this.handleWorkerFailure(worker, WorkerFailureStage.MessageError, event, event),
    });
  }

  private detachWorker(worker: ManagedWorkerTransport<Request>): void {
    if (this.worker === worker) {
      this.detachListeners?.();
      this.detachListeners = null;
      this.worker = null;
    }
    worker.terminate?.();
  }

  private clearPendingEntry(entry: PendingRequestEntry<Response>): void {
    if (entry.timer !== undefined) {
      clearTimeout(entry.timer);
      entry.timer = undefined;
    }
    if (entry.signal && entry.onAbort) {
      entry.signal.removeEventListener("abort", entry.onAbort);
      entry.onAbort = undefined;
    }
  }

  private armTimeout(
    entry: PendingRequestEntry<Response>,
    worker: ManagedWorkerTransport<Request>,
  ): void {
    if (entry.timer !== undefined) {
      clearTimeout(entry.timer);
      entry.timer = undefined;
    }
    if (entry.timeoutMs === undefined) return;
    entry.timer = setTimeout(() => {
      if (!this.pending.has(entry.id)) return;
      const info = classifyWorkerFailure({
        stage: WorkerFailureStage.Timeout,
        workerAnswered: this.workerAnswered,
      });
      const error =
        entry.timeoutError?.() ??
        entry.formatError?.(info, entry.id) ??
        this.formatError(info, entry.id);
      if (entry.terminateOnTimeout) {
        this.handleTimeoutTermination(worker, info, error);
        return;
      }
      this.pending.delete(entry.id);
      this.clearPendingEntry(entry);
      entry.reject(error);
    }, entry.timeoutMs);
  }

  private handleTimeoutTermination(
    worker: ManagedWorkerTransport<Request>,
    info: WorkerFailureInfo,
    error: Error,
  ): void {
    if (this.closed || this.worker !== worker) return;
    this.detachWorker(worker);
    this.options.onWorkerReset?.(info);
    const entries = [...this.pending.values()];
    this.pending.clear();
    for (const entry of entries) this.clearPendingEntry(entry);
    if (!this.recreateAfterRuntimeFailure || !this.workerFactory) this.failure = error;
    try {
      this.options.onFatalError?.(error, info);
    } finally {
      for (const entry of entries) entry.reject(error);
    }
  }

  private handleMessage(
    worker: ManagedWorkerTransport<Request>,
    event: MessageEvent<Response>,
  ): void {
    if (this.closed || this.worker !== worker) return;
    this.workerAnswered = true;
    this.startupAttempts = 0;
    const response = event.data;
    if (!response || !Number.isSafeInteger(response.id)) return;
    const entry = this.pending.get(response.id);
    if (!entry) return;
    if (entry.onIntermediate?.(response)) {
      this.armTimeout(entry, worker);
      return;
    }
    this.pending.delete(response.id);
    this.clearPendingEntry(entry);
    entry.resolve(response);
  }

  private scheduleStartupRetry(): void {
    if (this.restartPromise || this.closed) return;
    this.restartPromise = waitForWorkerRetry(this.retryDelayMs, this.closeController.signal).then(
      () => {
        this.restartPromise = null;
      },
      () => {
        this.restartPromise = null;
      },
    );
  }

  private handleWorkerFailure(
    worker: ManagedWorkerTransport<Request>,
    stage: WorkerFailureStage,
    event: Event | undefined,
    cause: unknown,
  ): void {
    if (this.closed || this.worker !== worker) return;
    const info = classifyWorkerFailure({
      stage,
      workerAnswered: this.workerAnswered,
      event,
      cause,
    });
    this.detachWorker(worker);
    this.options.onWorkerReset?.(info);

    const entries = [...this.pending.values()];
    this.pending.clear();
    for (const entry of entries) this.clearPendingEntry(entry);

    if (info.kind === WorkerFailureKind.Startup) {
      const canScheduleRetry =
        Boolean(this.workerFactory) &&
        this.startupAttempts < this.maxStartupAttempts &&
        !(info.stage === WorkerFailureStage.Construction && !this.retryConstructionFailure);
      if (canScheduleRetry) {
        this.scheduleStartupRetry();
        const signal = new StartupRetrySignal(info);
        for (const entry of entries) entry.reject(signal);
        return;
      }

      this.workerFactory = undefined;
      const baseError = this.formatError(info);
      const isInitialUnsupportedConstruction =
        info.stage === WorkerFailureStage.Construction &&
        this.startupAttempts <= 1 &&
        !this.retryConstructionFailure &&
        this.fallbackOnUnavailable;

      if (isInitialUnsupportedConstruction) {
        this.inFallback = true;
        const signal = new StartupFallbackSignal(info);
        for (const entry of entries) entry.reject(signal);
        return;
      }

      const reported = this.options.onStartupFailureExhausted?.(baseError, info) ?? baseError;
      if (this.fallbackOnUnavailable) {
        this.inFallback = true;
        try {
          this.options.onFatalError?.(reported, info);
        } finally {
          const signal = new StartupFallbackSignal(info);
          for (const entry of entries) entry.reject(signal);
        }
        return;
      }

      this.failure = reported;
      try {
        this.options.onFatalError?.(reported, info);
      } finally {
        for (const entry of entries) {
          entry.reject(entry.formatError ? entry.formatError(info, entry.id) : reported);
        }
      }
      return;
    }

    const error = this.formatError(info);
    if (!this.recreateAfterRuntimeFailure || !this.workerFactory) this.failure = error;
    try {
      this.options.onFatalError?.(error, info);
    } finally {
      for (const entry of entries) {
        entry.reject(entry.formatError ? entry.formatError(info, entry.id) : error);
      }
    }
  }

  private ensureWorker(
    requestFormatError?: (info: WorkerFailureInfo, requestId: number) => Error,
    requestId?: number,
  ): ManagedWorkerTransport<Request> | null {
    if (this.worker) return this.worker;
    if (this.inFallback) return null;
    if (!this.workerFactory) {
      if (this.failure) throw this.failure;
      return null;
    }
    this.startupAttempts++;
    try {
      const worker = this.workerFactory();
      this.attachWorker(worker);
      return worker;
    } catch (cause) {
      const info = classifyWorkerFailure({
        stage: WorkerFailureStage.Construction,
        workerAnswered: false,
        cause,
      });
      const canScheduleRetry =
        this.startupAttempts < this.maxStartupAttempts && this.retryConstructionFailure;
      if (canScheduleRetry) {
        this.scheduleStartupRetry();
        throw new StartupRetrySignal(info);
      }
      this.workerFactory = undefined;
      const isInitialUnsupportedConstruction =
        this.startupAttempts <= 1 && !this.retryConstructionFailure && this.fallbackOnUnavailable;
      if (isInitialUnsupportedConstruction) {
        this.inFallback = true;
        return null;
      }
      const baseError =
        requestFormatError && requestId !== undefined
          ? requestFormatError(info, requestId)
          : this.formatError(info, requestId);
      const reported = this.options.onStartupFailureExhausted?.(baseError, info) ?? baseError;
      if (this.fallbackOnUnavailable) {
        this.inFallback = true;
        this.options.onFatalError?.(reported, info);
        return null;
      }
      this.failure = reported;
      this.options.onFatalError?.(reported, info);
      throw reported;
    }
  }

  async request<Result>(
    options: ManagedWorkerRequestOptions<Request, Response, Result>,
  ): Promise<Result> {
    const retryOnStartupFailure = options.retryOnStartupFailure ?? true;
    for (;;) {
      if (options.signal?.aborted) throw createAbortError();
      if (this.closed) throw this.closeReason ?? this.closedError();
      if (this.restartPromise) {
        await awaitWithAbort(this.restartPromise, options.signal);
        continue;
      }
      if (this.closed) throw this.closeReason ?? this.closedError();
      if (this.inFallback) {
        if (!options.fallback) {
          throw (
            this.failure ??
            this.formatError(
              classifyWorkerFailure({
                stage: WorkerFailureStage.Construction,
                workerAnswered: false,
              }),
            )
          );
        }
        return await options.fallback();
      }
      if (this.failure) {
        if (this.recreateAfterRuntimeFailure && this.workerFactory) {
          this.failure = null;
        } else {
          throw this.failure;
        }
      }

      const id = this.nextRequestId();
      options.onRequestId?.(id);
      let worker: ManagedWorkerTransport<Request> | null;
      try {
        worker = this.ensureWorker(options.formatError, id);
      } catch (reason) {
        if (reason instanceof StartupRetrySignal) {
          if (!retryOnStartupFailure) {
            throw options.formatError
              ? options.formatError(reason.info, id)
              : this.formatError(reason.info, id);
          }
          continue;
        }
        throw reason;
      }
      if (!worker) {
        if (this.inFallback && options.fallback) return await options.fallback();
        throw (
          this.failure ??
          this.formatError(
            classifyWorkerFailure({
              stage: WorkerFailureStage.Construction,
              workerAnswered: false,
            }),
            id,
          )
        );
      }

      try {
        return await this.sendOnWorker(worker, id, options);
      } catch (reason) {
        if (reason instanceof StartupRetrySignal) {
          if (!retryOnStartupFailure) {
            throw options.formatError
              ? options.formatError(reason.info, id)
              : this.formatError(reason.info, id);
          }
          continue;
        }
        if (reason instanceof StartupFallbackSignal) {
          if (options.fallback) return await options.fallback();
          throw this.failure ?? this.formatError(reason.info, id);
        }
        throw reason;
      }
    }
  }

  private async sendOnWorker<Result>(
    worker: ManagedWorkerTransport<Request>,
    id: number,
    options: ManagedWorkerRequestOptions<Request, Response, Result>,
  ): Promise<Result> {
    const prepared = options.buildRequest(id);
    if (prepared.beforePost) {
      await prepared.beforePost(worker);
      if (this.closed) throw this.closeReason ?? this.closedError();
      if (options.signal?.aborted) throw createAbortError();
      if (this.worker !== worker) {
        // Worker failed while beforePost yielded (e.g. batched staging).
        if (this.restartPromise) {
          throw new StartupRetrySignal(
            classifyWorkerFailure({ stage: WorkerFailureStage.Error, workerAnswered: false }),
          );
        }
        if (this.inFallback) {
          throw new StartupFallbackSignal(
            classifyWorkerFailure({ stage: WorkerFailureStage.Error, workerAnswered: false }),
          );
        }
        throw (
          this.failure ??
          this.formatError(
            classifyWorkerFailure({ stage: WorkerFailureStage.Error, workerAnswered: false }),
            id,
          )
        );
      }
    }

    return new Promise<Result>((resolve, reject) => {
      if (this.closed) {
        reject(this.closeReason ?? this.closedError());
        return;
      }
      if (options.signal?.aborted) {
        reject(createAbortError());
        return;
      }
      if (this.worker !== worker) {
        if (this.restartPromise) {
          reject(
            new StartupRetrySignal(
              classifyWorkerFailure({ stage: WorkerFailureStage.Error, workerAnswered: false }),
            ),
          );
          return;
        }
        if (this.inFallback) {
          reject(
            new StartupFallbackSignal(
              classifyWorkerFailure({ stage: WorkerFailureStage.Error, workerAnswered: false }),
            ),
          );
          return;
        }
        reject(
          this.failure ??
            this.formatError(
              classifyWorkerFailure({ stage: WorkerFailureStage.Error, workerAnswered: false }),
              id,
            ),
        );
        return;
      }

      const entry: PendingRequestEntry<Response> = {
        id,
        resolve(response) {
          try {
            resolve(options.readResponse(response));
          } catch (error) {
            reject(error);
          }
        },
        reject,
        onIntermediate: options.onIntermediate,
        formatError: options.formatError,
        timeoutMs: options.timeoutMs,
        timeoutError: options.timeoutError,
        terminateOnTimeout: options.terminateOnTimeout,
        signal: options.signal,
      };

      if (options.signal) {
        const onAbort = () => {
          if (!this.pending.delete(id)) return;
          this.clearPendingEntry(entry);
          reject(createAbortError());
        };
        entry.onAbort = onAbort;
        options.signal.addEventListener("abort", onAbort, { once: true });
      }

      this.pending.set(id, entry);
      this.armTimeout(entry, worker);

      try {
        if (prepared.transfer) worker.postMessage(prepared.request, prepared.transfer);
        else worker.postMessage(prepared.request);
      } catch (error) {
        this.handleWorkerFailure(worker, WorkerFailureStage.PostMessage, undefined, error);
      }
    });
  }

  cancel(id: number, reason: unknown = createAbortError()): boolean {
    const entry = this.pending.get(id);
    if (!entry) return false;
    this.pending.delete(id);
    this.clearPendingEntry(entry);
    entry.reject(reason);
    return true;
  }

  close(reason: unknown = this.closedError()): void {
    if (this.closed) return;
    this.closed = true;
    this.closeReason = reason;
    this.closeController.abort();
    if (this.worker) this.detachWorker(this.worker);
    const entries = [...this.pending.values()];
    this.pending.clear();
    for (const entry of entries) {
      this.clearPendingEntry(entry);
      entry.reject(reason);
    }
  }
}

export interface ManagedWorkerJobOptions<Request, Response, Result> {
  workerFactory: () => ManagedWorkerTransport<Request>;
  buildRequest: () => { request: Request; transfer?: readonly Transferable[] };
  readResponse: (response: Response) => Result;
  signal?: AbortSignal;
  timeoutMs?: number;
  timeoutError?: () => Error;
  formatError?: (info: WorkerFailureInfo) => Error;
  maxStartupAttempts?: number;
  retryDelayMs?: number;
  /** Whether a throwing `workerFactory()` on attempt 1 should be retried. Defaults to `true`. */
  retryConstructionFailure?: boolean;
  /** Optional guard checked before retrying after a startup failure (e.g. verifying buffers weren't detached). */
  canRetry?: (info: WorkerFailureInfo) => boolean;
  /** Called once when startup attempts are exhausted. Returning an Error replaces the thrown error. */
  onStartupFailureExhausted?: (error: Error, info: WorkerFailureInfo) => Error | void;
  /** Optional in-process fallback used when startup attempts are exhausted (or construction fails). */
  fallback?: () => Promise<Result> | Result;
}

class SingleShotFailure {
  constructor(
    readonly info: WorkerFailureInfo,
    readonly error: Error,
  ) {}
}

function runSingleShotAttempt<Request, Response, Result>(
  worker: ManagedWorkerTransport<Request>,
  options: {
    buildRequest: () => { request: Request; transfer?: readonly Transferable[] };
    readResponse: (response: Response) => Result;
    signal?: AbortSignal;
    timeoutMs?: number;
    timeoutError?: () => Error;
    formatError: (info: WorkerFailureInfo) => Error;
  },
  onSettled: (usable: boolean) => void,
): { result: Promise<Result>; cancel(): void } {
  let cancel = () => {};
  const result = new Promise<Result>((resolve, reject) => {
    let settled = false;
    let answered = false;
    let timeout: ReturnType<typeof setTimeout> | undefined;
    let detach: (() => void) | undefined;

    const cleanup = (usable: boolean) => {
      if (timeout !== undefined) clearTimeout(timeout);
      options.signal?.removeEventListener("abort", abort);
      detach?.();
      onSettled(usable);
    };

    const fail = (reason: unknown, usable = false) => {
      if (settled) return;
      settled = true;
      cleanup(usable);
      reject(reason);
    };

    const abort = () => fail(createAbortError());
    cancel = abort;

    if (options.signal?.aborted) {
      abort();
      return;
    }

    if (
      options.timeoutMs !== undefined &&
      (!Number.isSafeInteger(options.timeoutMs) || options.timeoutMs <= 0)
    ) {
      fail(new RangeError("Worker timeout must be a positive safe integer"));
      return;
    }

    let built: { request: Request; transfer?: readonly Transferable[] };
    try {
      built = options.buildRequest();
    } catch (reason) {
      fail(reason);
      return;
    }

    detach = attachWorkerListeners(worker, {
      onMessage: (event) => {
        if (settled) return;
        answered = true;
        try {
          const value = options.readResponse((event as MessageEvent<Response>).data);
          if (settled) return;
          settled = true;
          cleanup(true);
          resolve(value);
        } catch (reason) {
          // The worker answered; a protocol-level error leaves it usable for serial reuse.
          fail(reason, true);
        }
      },
      onError: (event) => {
        event.preventDefault?.();
        const info = classifyWorkerFailure({
          stage: WorkerFailureStage.Error,
          workerAnswered: answered,
          event,
          cause: event,
        });
        fail(new SingleShotFailure(info, options.formatError(info)));
      },
      onMessageError: (event) => {
        const info = classifyWorkerFailure({
          stage: WorkerFailureStage.MessageError,
          workerAnswered: answered,
          event,
          cause: event,
        });
        fail(new SingleShotFailure(info, options.formatError(info)));
      },
    });

    options.signal?.addEventListener("abort", abort, { once: true });
    if (options.timeoutMs !== undefined) {
      timeout = setTimeout(() => {
        const info = classifyWorkerFailure({
          stage: WorkerFailureStage.Timeout,
          workerAnswered: answered,
        });
        fail(options.timeoutError?.() ?? options.formatError(info));
      }, options.timeoutMs);
    }

    try {
      if (built.transfer) worker.postMessage(built.request, [...built.transfer]);
      else worker.postMessage(built.request);
    } catch (cause) {
      const info = classifyWorkerFailure({
        stage: WorkerFailureStage.PostMessage,
        workerAnswered: answered,
        cause,
      });
      fail(new SingleShotFailure(info, options.formatError(info)));
    }
  });
  return { result, cancel: () => cancel() };
}

/**
 * Execute a single-shot worker job with lazy creation, clean termination, opaque startup error
 * classification, bounded startup retry, and optional in-process fallback.
 */
export async function runManagedWorkerJob<Request, Response, Result>(
  options: ManagedWorkerJobOptions<Request, Response, Result>,
): Promise<Result> {
  const maxAttempts = Math.max(1, options.maxStartupAttempts ?? DEFAULT_WORKER_STARTUP_ATTEMPTS);
  const retryDelayMs = options.retryDelayMs ?? DEFAULT_WORKER_STARTUP_RETRY_DELAY_MS;
  const retryConstructionFailure = options.retryConstructionFailure ?? true;
  const formatError =
    options.formatError ??
    ((info: WorkerFailureInfo) => new ManagedWorkerError(defaultFailureMessage(info), info));

  let lastStartupFailure: SingleShotFailure | null = null;
  for (let attempt = 1; ; attempt++) {
    if (options.signal?.aborted) throw createAbortError();
    let worker: ManagedWorkerTransport<Request>;
    try {
      worker = options.workerFactory();
    } catch (cause) {
      const info = classifyWorkerFailure({
        stage: WorkerFailureStage.Construction,
        workerAnswered: false,
        cause,
      });
      const error = formatError(info);
      const canRetry =
        attempt < maxAttempts &&
        retryConstructionFailure &&
        (options.canRetry ? options.canRetry(info) : true);
      if (canRetry) {
        lastStartupFailure = new SingleShotFailure(info, error);
        await waitForWorkerRetry(retryDelayMs, options.signal);
        continue;
      }
      const isInitialUnsupportedConstruction = attempt === 1 && !retryConstructionFailure;
      if (isInitialUnsupportedConstruction) {
        if (options.fallback) return await options.fallback();
        throw error;
      }
      const exhaustedInfo = lastStartupFailure?.info ?? info;
      const exhaustedError = lastStartupFailure?.error ?? error;
      const reported =
        options.onStartupFailureExhausted?.(exhaustedError, exhaustedInfo) ?? exhaustedError;
      if (options.fallback) return await options.fallback();
      throw reported;
    }

    try {
      const job = runSingleShotAttempt<Request, Response, Result>(
        worker,
        {
          buildRequest: options.buildRequest,
          readResponse: options.readResponse,
          signal: options.signal,
          timeoutMs: options.timeoutMs,
          timeoutError: options.timeoutError,
          formatError,
        },
        () => worker.terminate?.(),
      );
      return await job.result;
    } catch (reason) {
      if (!(reason instanceof SingleShotFailure)) throw reason;
      if (reason.info.kind !== WorkerFailureKind.Startup) throw reason.error;
      lastStartupFailure = reason;
      const canRetry =
        attempt < maxAttempts && (options.canRetry ? options.canRetry(reason.info) : true);
      if (canRetry) {
        await waitForWorkerRetry(retryDelayMs, options.signal);
        continue;
      }
      const reported =
        options.onStartupFailureExhausted?.(reason.error, reason.info) ?? reason.error;
      if (options.fallback) return await options.fallback();
      throw reported;
    }
  }
}

export interface ManagedSerialWorkerOptions<Request> {
  workerFactory: () => ManagedWorkerTransport<Request>;
  maxStartupAttempts?: number;
  retryDelayMs?: number;
  formatError?: (info: WorkerFailureInfo) => Error;
  onStartupFailureExhausted?: (error: Error, info: WorkerFailureInfo) => Error | void;
}

export interface ManagedSerialWorkerRunOptions<Request, Response, Result> {
  buildRequest: () => { request: Request; transfer?: readonly Transferable[] };
  readResponse: (response: Response) => Result;
  signal?: AbortSignal;
  timeoutMs?: number;
  timeoutError?: () => Error;
  formatError?: (info: WorkerFailureInfo) => Error;
}

/**
 * Reuses one worker across serial jobs so worker-side caches survive between runs. Starting a new
 * job cancels the running one (including any startup retry pause). Startup load failures retry
 * within bounds before reporting exhaustion.
 */
export class ManagedSerialWorker<Request> {
  private worker: ManagedWorkerTransport<Request> | undefined;
  private workerAnswered = false;
  private activeCancel: (() => void) | undefined;
  private disposed = false;
  private readonly maxStartupAttempts: number;
  private readonly retryDelayMs: number;

  constructor(private readonly options: ManagedSerialWorkerOptions<Request>) {
    this.maxStartupAttempts = Math.max(
      1,
      options.maxStartupAttempts ?? DEFAULT_WORKER_STARTUP_ATTEMPTS,
    );
    this.retryDelayMs = options.retryDelayMs ?? DEFAULT_WORKER_STARTUP_RETRY_DELAY_MS;
  }

  /** Start the worker ahead of the first job so script loading overlaps user work. */
  prepare(): void {
    if (this.disposed || this.worker) return;
    try {
      this.worker = this.options.workerFactory();
      this.workerAnswered = false;
    } catch {
      // Let run() report or retry construction failures through the normal error path.
    }
  }

  async run<Response, Result>(
    runOptions: ManagedSerialWorkerRunOptions<Request, Response, Result>,
  ): Promise<Result> {
    if (this.disposed) {
      throw new ManagedWorkerError(
        "Worker client is closed",
        classifyWorkerFailure({
          stage: WorkerFailureStage.Closed,
          workerAnswered: this.workerAnswered,
        }),
      );
    }
    this.activeCancel?.();

    const runController = new AbortController();
    const onExternalAbort = () => runController.abort();
    if (runOptions.signal?.aborted) {
      throw createAbortError();
    }
    runOptions.signal?.addEventListener("abort", onExternalAbort, { once: true });

    let activeJobCancel: (() => void) | undefined;
    const cancelThisRun = () => {
      runController.abort();
      activeJobCancel?.();
    };
    this.activeCancel = cancelThisRun;

    const formatError =
      runOptions.formatError ??
      this.options.formatError ??
      ((info: WorkerFailureInfo) => new ManagedWorkerError(defaultFailureMessage(info), info));

    let lastStartupFailure: SingleShotFailure | null = null;
    try {
      for (let attempt = 1; ; attempt++) {
        if (runController.signal.aborted) throw createAbortError();
        let worker = this.worker;
        if (!worker) {
          try {
            worker = this.options.workerFactory();
            this.worker = worker;
            this.workerAnswered = false;
          } catch (cause) {
            const info = classifyWorkerFailure({
              stage: WorkerFailureStage.Construction,
              workerAnswered: false,
              cause,
            });
            const error = formatError(info);
            if (attempt < this.maxStartupAttempts) {
              lastStartupFailure = new SingleShotFailure(info, error);
              await waitForWorkerRetry(this.retryDelayMs, runController.signal);
              continue;
            }
            const exhaustedInfo = lastStartupFailure?.info ?? info;
            const exhaustedError = lastStartupFailure?.error ?? error;
            const reported =
              this.options.onStartupFailureExhausted?.(exhaustedError, exhaustedInfo) ??
              exhaustedError;
            throw reported;
          }
        }

        const alreadyAnswered = this.workerAnswered;
        const job = runSingleShotAttempt<Request, Response, Result>(
          worker,
          {
            buildRequest: runOptions.buildRequest,
            readResponse: runOptions.readResponse,
            signal: runController.signal,
            timeoutMs: runOptions.timeoutMs,
            timeoutError: runOptions.timeoutError,
            formatError: (info) =>
              formatError(
                alreadyAnswered && info.kind === WorkerFailureKind.Startup
                  ? { ...info, workerAnswered: true, kind: WorkerFailureKind.Runtime }
                  : info,
              ),
          },
          (usable) => {
            if (usable) {
              if (this.worker === worker) this.workerAnswered = true;
              return;
            }
            if (this.worker === worker) {
              this.worker = undefined;
              this.workerAnswered = false;
            }
            worker.terminate?.();
          },
        );
        activeJobCancel = job.cancel;
        try {
          return await job.result;
        } catch (reason) {
          activeJobCancel = undefined;
          if (!(reason instanceof SingleShotFailure)) throw reason;
          const effectiveInfo =
            alreadyAnswered && reason.info.kind === WorkerFailureKind.Startup
              ? { ...reason.info, workerAnswered: true, kind: WorkerFailureKind.Runtime }
              : reason.info;
          if (effectiveInfo.kind !== WorkerFailureKind.Startup) {
            throw formatError(effectiveInfo);
          }
          lastStartupFailure = new SingleShotFailure(effectiveInfo, reason.error);
          if (attempt < this.maxStartupAttempts) {
            await waitForWorkerRetry(this.retryDelayMs, runController.signal);
            continue;
          }
          const reported =
            this.options.onStartupFailureExhausted?.(reason.error, effectiveInfo) ?? reason.error;
          throw reported;
        }
      }
    } finally {
      runOptions.signal?.removeEventListener("abort", onExternalAbort);
      if (this.activeCancel === cancelThisRun) this.activeCancel = undefined;
    }
  }

  dispose(): void {
    this.disposed = true;
    this.activeCancel?.();
    this.activeCancel = undefined;
    this.worker?.terminate?.();
    this.worker = undefined;
    this.workerAnswered = false;
  }
}
