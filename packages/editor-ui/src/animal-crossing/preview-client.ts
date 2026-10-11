import type {
  AnimalCrossingPreviewRequest,
  AnimalCrossingPreviewResponse,
} from "$/animal-crossing/preview-types";
import type { AnimalCrossingPreview } from "$/animal-crossing/preview-types";
import type { PixelBuffer } from "@xprite/editor-core/base";
import type { AnimalCrossingSettings } from "@xprite/editor-core/import-export";

const PREVIEW_TIMEOUT_MS = 30_000;

/** Reuse one worker and transferred source until its dialog closes or a running job is cancelled. */
class BrowserAnimalCrossingPreview {
  private readonly worker: Worker;
  private sourceSent = false;
  private closed = false;
  private pending: {
    resolve(preview: AnimalCrossingPreview): void;
    reject(reason: unknown): void;
    cleanup(): void;
  } | null = null;
  constructor(
    private readonly pixels: PixelBuffer,
    private readonly onClosed: () => void,
    private readonly translate: (message: string) => string,
  ) {
    this.worker = new Worker(new URL("./preview-worker.ts", import.meta.url), {
      type: "module",
    });
    this.worker.onmessage = ({ data }: MessageEvent<AnimalCrossingPreviewResponse>) => {
      const pending = this.pending;
      if (!pending) return;
      this.pending = null;
      pending.cleanup();
      if (data.ok) pending.resolve(data.preview);
      else pending.reject(new Error(this.translate(data.message)));
    };
    this.worker.onerror = (event) => {
      event.preventDefault();
      this.close(new Error(this.translate("Unable to generate preview.")));
    };
    this.worker.onmessageerror = () =>
      this.close(new Error(this.translate("Unable to generate preview.")));
  }
  close(reason: unknown = new DOMException("Cancelled", "AbortError")) {
    if (this.closed) return;
    this.closed = true;
    const pending = this.pending;
    this.pending = null;
    pending?.cleanup();
    this.worker.onmessage = null;
    this.worker.onerror = null;
    this.worker.onmessageerror = null;
    this.worker.terminate();
    this.onClosed();
    pending?.reject(reason);
  }
  generate(
    settings: AnimalCrossingSettings,
    selected: number,
    signal: AbortSignal,
  ): Promise<AnimalCrossingPreview> {
    return new Promise((resolve, reject) => {
      if (signal.aborted) {
        this.close();
        reject(new DOMException("Cancelled", "AbortError"));
        return;
      }
      if (this.pending) {
        reject(new Error(this.translate("Unable to generate preview.")));
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
        this.worker.postMessage(request, transfer);
      } catch (reason) {
        this.close(reason);
      }
    });
  }
}

export function createAnimalCrossingPreviewRenderer(
  translate: (message: string) => string = (message) => message,
) {
  const sessions = new WeakMap<PixelBuffer, BrowserAnimalCrossingPreview>();
  return {
    preview(
      pixels: PixelBuffer,
      settings: AnimalCrossingSettings,
      selected: number,
      signal: AbortSignal,
    ) {
      if (typeof Worker === "undefined")
        return Promise.reject(new Error(translate("Unable to generate preview.")));
      let session = sessions.get(pixels);
      if (!session) {
        session = new BrowserAnimalCrossingPreview(
          pixels,
          () => sessions.delete(pixels),
          translate,
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
