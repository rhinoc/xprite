const INITIAL_RETRY_DELAY_MS = 5_000;
const MAX_RETRY_DELAY_MS = 60_000;

/** Scheduling belongs to the host, so the coordinator also works outside a browser. */
export interface AutosaveClock {
  now(): number;
  setTimeout(callback: () => void, delayMs: number): unknown;
  clearTimeout(handle: unknown): void;
}

export interface AutosaveState<Head> {
  readonly projectId: string;
  readonly status: "ready" | "saving" | "saved" | "error";
  readonly committedRevision: number;
  readonly persistedRevision: number;
  readonly head: Head | null;
  readonly error: unknown;
}

export interface AutosaveOptions<Snapshot, Head> {
  projectId: string;
  clock: AutosaveClock;
  /** Return an immutable snapshot of committed content, or null while unavailable. */
  capture(): { revision: number; snapshot: Snapshot } | null;
  /** Publish atomically against expectedHead; reject conflicts or failed writes. */
  save(snapshot: Snapshot, expectedHead: Head | null): Promise<Head>;
  initialHead?: Head | null;
  initialPersistedRevision?: number;
  debounceMs?: number;
  maxWaitMs?: number;
  onStateChange?(state: AutosaveState<Head>): void;
}

export interface AutosaveCoordinator<Head> {
  notifyCommitted(revision: number): void;
  /** Drains changes committed during a save too. Rejects on failure; retries are delayed. */
  flush(): Promise<void>;
  retry(): Promise<void>;
  getState(): AutosaveState<Head>;
  /** Cancels scheduled work, but cannot cancel a storage write already in progress. */
  dispose(): void;
}

/** One coordinator per project. Revisions must increase for every committed content change. */
export function createAutosaveCoordinator<Snapshot, Head>(
  options: AutosaveOptions<Snapshot, Head>,
): AutosaveCoordinator<Head> {
  const debounceMs = options.debounceMs ?? 750;
  const maxWaitMs = options.maxWaitMs ?? 3000;
  let state: AutosaveState<Head> = {
    projectId: options.projectId,
    status: options.initialPersistedRevision === undefined ? "ready" : "saved",
    committedRevision: options.initialPersistedRevision ?? -1,
    persistedRevision: options.initialPersistedRevision ?? -1,
    head: options.initialHead ?? null,
    error: null,
  };
  let disposed = false;
  let timer: unknown;
  let scheduled = false;
  let firstPendingAt: number | null = null;
  let inFlight: Promise<void> | null = null;
  let captureUnavailable = false;
  let failures = 0;

  function publish(update: Partial<AutosaveState<Head>>) {
    if (disposed) return;
    state = { ...state, ...update };
    options.onStateChange?.(state);
  }

  function clearTimer() {
    if (scheduled) options.clock.clearTimeout(timer);
    scheduled = false;
  }

  function schedule() {
    clearTimer();
    const now = options.clock.now();
    firstPendingAt ??= now;
    const delay = Math.max(0, Math.min(debounceMs, maxWaitMs - (now - firstPendingAt)));
    scheduled = true;
    timer = options.clock.setTimeout(() => {
      scheduled = false;
      void flush().catch(() => {
        /* The failure remains visible until a checkpoint succeeds. */
      });
    }, delay);
  }

  function scheduleRetry() {
    if (disposed) return;
    clearTimer();
    const delay = Math.min(
      MAX_RETRY_DELAY_MS,
      INITIAL_RETRY_DELAY_MS * 2 ** Math.max(0, failures - 1),
    );
    scheduled = true;
    timer = options.clock.setTimeout(() => {
      scheduled = false;
      void flush().catch(() => {
        // Keep the failed revision visible; subsequent retries use a longer delay.
      });
    }, delay);
  }

  async function drain() {
    while (!disposed && state.committedRevision > state.persistedRevision) {
      const captured = options.capture();
      if (!captured) {
        captureUnavailable = true;
        publish({ status: "ready" });
        return;
      }
      if (captured.revision < state.committedRevision) {
        throw new Error("Autosave capture is older than the latest committed revision");
      }
      const savingRevision = captured.revision;
      // Retain the previous failure while retrying; only a durable acknowledgement
      // clears the warning, including when edits arrive during the retry.
      publish({ status: "saving", committedRevision: savingRevision });
      const head = await options.save(captured.snapshot, state.head);
      if (disposed) return;
      failures = 0;
      publish({
        head,
        persistedRevision: savingRevision,
        status: state.committedRevision === savingRevision ? "saved" : "ready",
        error: null,
      });
    }
  }

  function flush(): Promise<void> {
    clearTimer();
    firstPendingAt = null;
    if (disposed) return Promise.resolve();
    if (inFlight) return inFlight;
    if (state.committedRevision <= state.persistedRevision) return Promise.resolve();
    captureUnavailable = false;
    // Defer capture to a microtask so reentrant notifications share this same flight.
    inFlight = Promise.resolve()
      .then(drain)
      .catch((error: unknown) => {
        clearTimer();
        firstPendingAt = null;
        failures++;
        publish({ status: "error", error });
        scheduleRetry();
        throw error;
      })
      .finally(() => {
        inFlight = null;
        // A caller can notify in a microtask between drain settling and this cleanup.
        if (
          !disposed &&
          !captureUnavailable &&
          state.status !== "error" &&
          state.committedRevision > state.persistedRevision
        )
          return flush();
      });
    return inFlight;
  }

  return {
    notifyCommitted(revision) {
      if (disposed || revision < state.committedRevision || revision <= state.persistedRevision)
        return;
      const isNewRevision = revision > state.committedRevision;
      // New edits update the pending snapshot without restarting or bypassing
      // the retry delay. A storage failure must not trigger a save on every stroke.
      if (state.status === "error") {
        publish({ committedRevision: revision });
        return;
      }
      publish({
        committedRevision: revision,
        status: inFlight ? "saving" : "ready",
      });
      // The current drain captures the newest revision after its outstanding write.
      if (!inFlight && (isNewRevision || !scheduled)) schedule();
    },
    flush,
    retry() {
      failures = 0;
      return flush();
    },
    getState: () => state,
    dispose() {
      disposed = true;
      clearTimer();
      firstPendingAt = null;
    },
  };
}
