export interface WritableFile {
  write(blob: Blob): Promise<void>;
  close(): Promise<void>;
}

export interface WritableFileHandle {
  readonly name?: string;
  createWritable(): Promise<WritableFile>;
  requestPermission?(options: { mode: "readwrite" }): Promise<"granted" | "denied" | "prompt">;
}

export interface ReadableFileHandle extends WritableFileHandle {
  getFile(): Promise<File>;
}

export interface FilePickerType {
  description: string;
  accept: Record<string, string[]>;
}

export interface OpenFilePickerOptions {
  multiple?: boolean;
}

export interface SaveFilePickerOptions {
  suggestedName: string;
  types: FilePickerType[];
}

export type OpenFilePicker = (options?: OpenFilePickerOptions) => Promise<ReadableFileHandle[]>;
export type SaveFilePicker = (options: SaveFilePickerOptions) => Promise<WritableFileHandle>;

type BrowserFilePickers = typeof globalThis & {
  showOpenFilePicker?: OpenFilePicker;
  showSaveFilePicker?: SaveFilePicker;
};

/** Native file pickers require the same origin as the top-level page. */
function sharesTopLevelOrigin(): boolean {
  if (typeof window === "undefined") return true;
  try {
    return !window.top || window.top.location.origin === window.location.origin;
  } catch {
    return false;
  }
}

export function canPickOpenFiles(): boolean {
  return (
    sharesTopLevelOrigin() &&
    typeof (globalThis as BrowserFilePickers).showOpenFilePicker === "function"
  );
}

/** Calls the native picker immediately so the caller can preserve user activation. */
export function pickOpenFiles(
  options?: OpenFilePickerOptions,
): Promise<ReadableFileHandle[]> | null {
  const picker = (globalThis as BrowserFilePickers).showOpenFilePicker;
  return sharesTopLevelOrigin() && typeof picker === "function" ? picker(options) : null;
}

export interface BrowserFileSelectionOptions extends OpenFilePickerOptions {
  accept?: string;
  preferNative?: boolean;
  signal?: AbortSignal;
}

/** Select files with one cancellation and cleanup lifecycle for native and input pickers. */
export async function selectBrowserFiles({
  accept = "",
  multiple = false,
  preferNative = false,
  signal,
}: BrowserFileSelectionOptions = {}): Promise<File[]> {
  signal?.throwIfAborted();
  const native = preferNative ? pickOpenFiles({ multiple }) : null;
  if (native) {
    try {
      const handles = await native;
      signal?.throwIfAborted();
      const files = await Promise.all(handles.map((handle) => handle.getFile()));
      signal?.throwIfAborted();
      return files;
    } catch (error) {
      if (!signal?.aborted && isAbortError(error)) return [];
      throw error;
    }
  }
  return new Promise((resolve, reject) => {
    const input = document.createElement("input");
    input.type = "file";
    input.accept = accept;
    input.multiple = multiple;
    input.hidden = true;
    const dispose = () => {
      input.removeEventListener("change", change);
      input.removeEventListener("cancel", cancel);
      signal?.removeEventListener("abort", abort);
      input.remove();
    };
    const change = () => {
      const files = Array.from(input.files ?? []);
      dispose();
      resolve(files);
    };
    const cancel = () => {
      dispose();
      resolve([]);
    };
    const abort = () => {
      dispose();
      reject(signal?.reason);
    };
    input.addEventListener("change", change);
    input.addEventListener("cancel", cancel);
    signal?.addEventListener("abort", abort, { once: true });
    try {
      document.body.append(input);
      input.click();
    } catch (error) {
      dispose();
      reject(error);
    }
  });
}

export function canPickSaveFile(): boolean {
  return (
    sharesTopLevelOrigin() &&
    typeof (globalThis as BrowserFilePickers).showSaveFilePicker === "function"
  );
}

/** Calls the native picker immediately so the caller can preserve user activation. */
export function pickSaveFile(options: SaveFilePickerOptions): Promise<WritableFileHandle> | null {
  const picker = (globalThis as BrowserFilePickers).showSaveFilePicker;
  return sharesTopLevelOrigin() && typeof picker === "function" ? picker(options) : null;
}

export function requestFileWritePermission(
  handle: WritableFileHandle,
): Promise<"granted" | "denied" | "prompt"> | undefined {
  return handle.requestPermission?.({ mode: "readwrite" });
}

export async function writeFileHandle(handle: WritableFileHandle, blob: Blob): Promise<void> {
  const writable = await handle.createWritable();
  await writable.write(blob);
  await writable.close();
}

export function isAbortError(error: unknown): boolean {
  return (
    (typeof DOMException !== "undefined" &&
      error instanceof DOMException &&
      error.name === "AbortError") ||
    (typeof error === "object" &&
      error !== null &&
      "name" in error &&
      (error as { name?: unknown }).name === "AbortError")
  );
}

/** Triggers a browser download and revokes its object URL after dispatch. */
export function downloadBlob(blob: Blob, filename: string): void {
  if (typeof document === "undefined" || typeof document.createElement !== "function") {
    throw new Error("File download requires a browser document");
  }
  if (typeof URL === "undefined" || typeof URL.createObjectURL !== "function") {
    throw new Error("File download requires URL.createObjectURL");
  }
  const url = URL.createObjectURL(blob);
  const link = document.createElement("a");
  try {
    link.href = url;
    link.download = filename;
    link.rel = "noopener";
    link.click();
  } finally {
    link.remove?.();
    if (typeof setTimeout === "function") setTimeout(() => URL.revokeObjectURL(url), 0);
    else URL.revokeObjectURL(url);
  }
}
