import { openBrowserFileInput } from "@xprite/bedrock/browser/file-system";
import type { SessionSource } from "@xprite/editor-core/session";

export interface FallbackFileInput {
  multiple: boolean;
  accept?: string;
  value?: string;
  click(): void;
}

export interface OpenWorkspaceFilesOptions {
  canStartInteraction(): boolean;
  flushPendingLayerProperties?: () => void;
  hasPendingSequenceSources(): boolean;
  onRequested(): void;
  pickFiles(): Promise<readonly SessionSource<string>[]> | null;
  fallbackInput(): FallbackFileInput | null;
  androidAccept?: string;
  onSources(sources: readonly SessionSource<string>[]): void;
  onCancelled(): void;
  onError(reason: unknown): void;
}

/**
 * Starts file selection synchronously inside the originating user-activation turn.
 * Both native `showOpenFilePicker` (`pickFiles`) and the fallback `<input type="file">.click()`
 * must run before any microtask or timer so browsers preserve transient user activation.
 */
export function openWorkspaceFiles(options: OpenWorkspaceFilesOptions): void {
  if (!options.canStartInteraction()) return;
  options.flushPendingLayerProperties?.();
  if (options.hasPendingSequenceSources()) return;
  options.onRequested();
  const picking = options.pickFiles();
  if (!picking) {
    const input = options.fallbackInput();
    if (input) {
      openBrowserFileInput(input, { multiple: true, androidAccept: options.androidAccept });
    }
    return;
  }
  void picking
    .then((sources) => {
      if (!sources.length) options.onCancelled();
      options.onSources(sources);
    })
    .catch((reason) => {
      if (
        typeof reason === "object" &&
        reason !== null &&
        "name" in reason &&
        reason.name === "AbortError"
      ) {
        options.onCancelled();
        return;
      }
      options.onError(reason);
    });
}
