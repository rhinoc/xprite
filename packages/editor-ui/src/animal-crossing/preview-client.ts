import type {
  AnimalCrossingPreview,
  AnimalCrossingPreviewRequest,
  AnimalCrossingPreviewResponse,
} from "$/animal-crossing/preview-types";
import type { PixelBuffer } from "@xprite/editor-core/base";
import type { AnimalCrossingSettings } from "@xprite/editor-core/import-export";

const PREVIEW_TIMEOUT_MS = 30_000;
const STARTUP_ATTEMPTS = 2;
const STARTUP_RETRY_DELAY_MS = 1_000;

export interface AnimalCrossingPreviewWorkerTransport {
  postMessage(request: AnimalCrossingPreviewRequest, transfer?: Transferable[]): void;
  addEventListener?(type: "message" | "error" | "messageerror", listener: EventListener): void;
  removeEventListener?(type: "message" | "error" | "messageerror", listener: EventListener): void;
  onmessage?: ((event: MessageEvent<AnimalCrossingPreviewResponse>) => void) | null;
  onerror?: ((event: ErrorEvent) => void) | null;
  onmessageerror?: ((event: MessageEvent) => void) | null;
  terminate?(): void;
}

export interface AnimalCrossingPreviewOptions {
  createWorker?: () => AnimalCrossingPreviewWorkerTransport;
  retryDelayMs?: number;
  maxStartupAttempts?: number;
  onStartupFailureExhausted?: (error: Error) => Error | void;
}

function createPreviewWorker(): Worker {
  return new Worker(new URL("./preview-worker.ts", import.meta.url), {
    type: "module",
  });
}

function isOpaqueStartupError(event: Event): boolean {
  if (event.type !== "error") return false;
  const details = event as Partial<Pick<ErrorEvent, "message" | "filename" | "error">>;
  return !details.message && !details.filename && details.error == null;
}

function waitBeforeRetry(delayMs: number, signal?: AbortSignal): Promise<void> {
  return new Promise((resolve, reject) => {
    const cancelled = () => new DOMException("Cancelled", "AbortError");
    if (signal?.aborted) {
      reject(cancelled());
      return;
    }
    const abort = () => {
      clearTimeout(timer);
      reject(cancelled());
    };
    const timer = setTimeout(() => {
      signal?.removeEventListener("abort", abort);
      resolve();
    }, delayMs);
    signal?.addEventListener("abort", abort, { once: true });
  });
}

function attachListeners(
  worker: AnimalCrossingPreviewWorkerTransport,
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
  worker.onmessage = handlers.onMessage as (
    event: MessageEvent<AnimalCrossingPreviewResponse>,
  ) => void;
  worker.onerror = handlers.onError as (event: ErrorEvent) => void;
  worker.onmessageerror = handlers.onMessageError as (event: MessageEvent) => void;
  return () => {
    if (worker.onmessage === handlers.onMessage) worker.onmessage = null;
    if (worker.onerror === handlers.onError) worker.onerror = null;
    if (worker.onmessageerror === handlers.onMessageError) worker.onmessageerror = null;
  };
}

class StartupRetryNeeded {
  constructor(readonly error: Error) {}
}

/** Reuse one worker and transferred source until its dialog closes or a running job is cancelled. */
class BrowserAnimalCrossingPreview {
  private worker: AnimalCrossingPreviewWorkerTransport | null = null;
  private detachListeners: (() => void) | null = null;
  private sourceSent = false;
  private answered = false;
  private closed = false;
  private readonly closeController = new AbortController();
  private readonly createWorker: () => AnimalCrossingPreviewWorkerTransport;
  private readonly maxStartupAttempts: number;
  private readonly retryDelayMs: number;
  private pending: {
    resolve(preview: AnimalCrossingPreview): void;
    reject(reason: unknown): void;
    cleanup(): void;
  } | null = null;

  constructor(
    private readonly pixels: PixelBuffer,
    private readonly onClosed: () => void,
    private readonly translate: (message: string) => string,
    private readonly options: AnimalCrossingPreviewOptions,
  ) {
    this.createWorker = options.createWorker ?? createPreviewWorker;
    this.maxStartupAttempts = Math.max(1, options.maxStartupAttempts ?? STARTUP_ATTEMPTS);
    this.retryDelayMs = options.retryDelayMs ?? STARTUP_RETRY_DELAY_MS;
  }

  private detachWorker(): void {
    this.detachListeners?.();
    this.detachListeners = null;
    this.worker?.terminate?.();
    this.worker = null;
    this.sourceSent = false;
    this.answered = false;
  }

  private ensureWorker(): AnimalCrossingPreviewWorkerTransport {
    if (this.worker) return this.worker;
    const worker = this.createWorker();
    this.worker = worker;
    this.sourceSent = false;
    this.answered = false;
    this.detachListeners = attachListeners(worker, {
      onMessage: (event) => {
        if (this.worker !== worker) return;
        this.answered = true;
        const { data } = event as MessageEvent<AnimalCrossingPreviewResponse>;
        const pending = this.pending;
        if (!pending) return;
        this.pending = null;
        pending.cleanup();
        if (data.ok) pending.resolve(data.preview);
        else pending.reject(new Error(this.translate(data.message)));
      },
      onError: (event) => {
        if (this.worker !== worker) return;
        event.preventDefault?.();
        const isStartup = !this.answered && isOpaqueStartupError(event);
        const error = new Error(this.translate("Unable to generate preview."));
        if (isStartup) {
          const pending = this.pending;
          this.pending = null;
          pending?.cleanup();
          this.detachWorker();
          pending?.reject(new StartupRetryNeeded(error));
          return;
        }
        this.close(error);
      },
      onMessageError: () => {
        if (this.worker !== worker) return;
        this.close(new Error(this.translate("Unable to generate preview.")));
      },
    });
    return worker;
  }

  close(reason: unknown = new DOMException("Cancelled", "AbortError")) {
    if (this.closed) return;
    this.closed = true;
    this.closeController.abort();
    const pending = this.pending;
    this.pending = null;
    pending?.cleanup();
    this.detachWorker();
    this.onClosed();
    pending?.reject(reason);
  }

  async generate(
    settings: AnimalCrossingSettings,
    selected: number,
    signal: AbortSignal,
  ): Promise<AnimalCrossingPreview> {
    const attemptSignal = AbortSignal.any
      ? AbortSignal.any([signal, this.closeController.signal])
      : signal;
    for (let attempt = 1; ; attempt++) {
      if (this.closed || signal.aborted) {
        this.close();
        throw new DOMException("Cancelled", "AbortError");
      }
      try {
        return await this.runOnce(settings, selected, signal);
      } catch (reason) {
        if (!(reason instanceof StartupRetryNeeded)) throw reason;
        if (attempt >= this.maxStartupAttempts) {
          const reported = this.options.onStartupFailureExhausted?.(reason.error) ?? reason.error;
          this.close(reported);
          throw reported;
        }
        try {
          await waitBeforeRetry(this.retryDelayMs, attemptSignal);
        } catch (abortReason) {
          this.close(abortReason);
          throw abortReason;
        }
      }
    }
  }

  private runOnce(
    settings: AnimalCrossingSettings,
    selected: number,
    signal: AbortSignal,
  ): Promise<AnimalCrossingPreview> {
    return new Promise((resolve, reject) => {
      if (this.closed || signal.aborted) {
        this.close();
        reject(new DOMException("Cancelled", "AbortError"));
        return;
      }
      if (this.pending) {
        reject(new Error(this.translate("Unable to generate preview.")));
        return;
      }
      let worker: AnimalCrossingPreviewWorkerTransport;
      try {
        worker = this.ensureWorker();
      } catch {
        reject(new StartupRetryNeeded(new Error(this.translate("Unable to generate preview."))));
        return;
      }
      const abort = () => this.close();
      const timeout = setTimeout(
        () => this.close(new Error(this.translate("Unable to generate preview."))),
        PREVIEW_TIMEOUT_MS,
      );
      this.pending = {
        resolve,
        reject,
        cleanup: () => {
          clearTimeout(timeout);
          signal.removeEventListener("abort", abort);
        },
      };
      signal.addEventListener("abort", abort, { once: true });
      const request: AnimalCrossingPreviewRequest = { settings, selected };
      const transfer: Transferable[] = [];
      if (!this.sourceSent) {
        const copy = new Uint8ClampedArray(this.pixels.data);
        request.pixels = { width: this.pixels.width, height: this.pixels.height, data: copy };
        transfer.push(copy.buffer);
        this.sourceSent = true;
      }
      try {
        worker.postMessage(request, transfer);
      } catch (reason) {
        this.close(reason);
      }
    });
  }
}

export function createAnimalCrossingPreviewRenderer(
  translate: (message: string) => string = (message) => message,
  options: AnimalCrossingPreviewOptions = {},
) {
  const sessions = new WeakMap<PixelBuffer, BrowserAnimalCrossingPreview>();
  return {
    preview(
      pixels: PixelBuffer,
      settings: AnimalCrossingSettings,
      selected: number,
      signal: AbortSignal,
    ) {
      if (!options.createWorker && typeof Worker === "undefined")
        return Promise.reject(new Error(translate("Unable to generate preview.")));
      let session = sessions.get(pixels);
      if (!session) {
        session = new BrowserAnimalCrossingPreview(
          pixels,
          () => sessions.delete(pixels),
          translate,
          options,
        );
        sessions.set(pixels, session);
      }
      return session.generate(settings, selected, signal);
    },
    releasePreview(pixels: PixelBuffer) {
      sessions.get(pixels)?.close();
    },
  };
}
