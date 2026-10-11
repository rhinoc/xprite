import { PwaDiagnosticStage, PwaFailure } from "$/managers/ports/diagnostics";
import {
  PwaInstallMethod,
  PwaInstallOutcome,
  PwaOfflineStatus,
  type PwaPlatformState,
  type PwaPort,
} from "$/managers/ports/pwa";

const MESSAGE_TIMEOUT_MS = 15_000;
const PREPARATION_TIMEOUT_MS = 120_000;
const STANDALONE_MEDIA_QUERY = "(display-mode: standalone)";
const WINDOW_CONTROLS_OVERLAY_MEDIA_QUERY = "(display-mode: window-controls-overlay)";
const MINIMUM_SAFARI_INSTALL_VERSION = 17;
const SERVICE_WORKER_FILENAME = "sw.js";
const MAX_STATUS_ATTEMPTS = 2;

type PwaDetails = Readonly<Record<string, string | number | boolean | null>>;

function withPwaDetails(reason: unknown, details: PwaDetails): Error {
  const error = reason instanceof Error ? reason : new Error(String(reason));
  const annotated = error as Error & { diagnosticDetails?: Record<string, unknown> };
  const previous = annotated.diagnosticDetails?.pwa;
  annotated.diagnosticDetails = {
    ...annotated.diagnosticDetails,
    pwa: { ...(previous && typeof previous === "object" ? previous : {}), ...details },
  };
  return error;
}

enum PwaWorkerMessage {
  OfflineStatus = "XPRITE_OFFLINE_STATUS",
  PrepareOffline = "XPRITE_OFFLINE_PREPARE",
}

interface InstallPromptEvent extends Event {
  prompt(): Promise<void>;
  userChoice: Promise<{ outcome: "accepted" | "dismissed" }>;
}

interface OfflineResponse {
  type: PwaWorkerMessage.OfflineStatus;
  ready: boolean;
  version?: string;
}

interface BrowserPwaOptions {
  enabled: boolean;
  offlineEnabled?: boolean;
  baseUrl: string;
  onError?: (error: unknown) => void;
}

function manualInstallMethod(): PwaInstallMethod {
  const agent = navigator.userAgent;
  const ios =
    /iPad|iPhone|iPod/.test(agent) || (/Macintosh/.test(agent) && navigator.maxTouchPoints > 1);
  if (ios) return PwaInstallMethod.Ios;
  const safariVersion = /Version\/(\d+)/.exec(agent);
  if (/Safari/.test(agent) && !/Chrome|Chromium|Edg|OPR/.test(agent)) {
    return safariVersion && Number(safariVersion[1]) >= MINIMUM_SAFARI_INSTALL_VERSION
      ? PwaInstallMethod.Safari
      : PwaInstallMethod.None;
  }
  return /Chrome|Chromium|Edg/.test(agent) ? PwaInstallMethod.BrowserMenu : PwaInstallMethod.None;
}

function workerRequest(
  worker: ServiceWorker,
  type: PwaWorkerMessage,
  timeoutMs = MESSAGE_TIMEOUT_MS,
): Promise<OfflineResponse> {
  return new Promise((resolve, reject) => {
    const startedAt = performance.now();
    const channel = new MessageChannel();
    const finish = () => {
      clearTimeout(timeout);
      channel.port1.close();
      channel.port2.close();
    };
    const timeout = setTimeout(() => {
      finish();
      fail(new Error("The offline application did not respond."), PwaFailure.Timeout);
    }, timeoutMs);
    const fail = (reason: unknown, failure: PwaFailure) => {
      reject(
        withPwaDetails(reason, {
          stage:
            type === PwaWorkerMessage.OfflineStatus
              ? PwaDiagnosticStage.Status
              : PwaDiagnosticStage.Prepare,
          failure,
          timeout_ms: timeoutMs,
          elapsed_ms: Math.round(performance.now() - startedAt),
          worker_state: worker.state,
        }),
      );
    };
    channel.port1.onmessage = (event: MessageEvent<OfflineResponse>) => {
      finish();
      if (
        event.data?.type !== PwaWorkerMessage.OfflineStatus ||
        typeof event.data.ready !== "boolean"
      ) {
        fail(new Error("Invalid offline application status."), PwaFailure.InvalidResponse);
        return;
      }
      resolve(event.data);
    };
    channel.port1.onmessageerror = () => {
      finish();
      fail(
        new Error("The offline application response could not be read."),
        PwaFailure.MessageError,
      );
    };
    try {
      worker.postMessage({ type }, [channel.port2]);
    } catch (error) {
      finish();
      fail(error, PwaFailure.PostMessage);
    }
  });
}

/** Create before rendering React so the browser installation event is retained. */
export function createBrowserPwaPort(options: BrowserPwaOptions): PwaPort {
  const supported = options.enabled && window.isSecureContext && "serviceWorker" in navigator;
  const listeners = new Set<() => void>();
  const standalone = window.matchMedia(STANDALONE_MEDIA_QUERY);
  const windowControlsOverlay = window.matchMedia(WINDOW_CONTROLS_OVERLAY_MEDIA_QUERY);
  let installedInSession = false;
  const isInstalled = () =>
    installedInSession ||
    standalone.matches ||
    windowControlsOverlay.matches ||
    (navigator as Navigator & { standalone?: boolean }).standalone === true;
  const fallbackInstallMethod = supported ? manualInstallMethod() : PwaInstallMethod.None;
  let prompt: InstallPromptEvent | null = null;
  let registration: ServiceWorkerRegistration | null = null;
  let state: PwaPlatformState = {
    supported,
    installed: supported && isInstalled(),
    installMethod: supported && !isInstalled() ? fallbackInstallMethod : PwaInstallMethod.None,
    offlineStatus:
      supported && options.offlineEnabled !== false
        ? PwaOfflineStatus.Preparing
        : PwaOfflineStatus.Unsupported,
  };
  let session = 0;
  let references = 0;
  let disposed = false;
  let repairAttempts = new WeakSet<ServiceWorker>();
  let pendingPreparations = new WeakMap<ServiceWorker, Promise<void>>();
  let preparationTimeout: ReturnType<typeof setTimeout> | null = null;
  let workerVersion: string | null = null;
  const removers: Array<() => void> = [];

  function patch(patch: Partial<PwaPlatformState>): void {
    const next = { ...state, ...patch };
    if (
      Object.keys(next).every(
        (key) => next[key as keyof PwaPlatformState] === state[key as keyof PwaPlatformState],
      )
    )
      return;
    state = next;
    for (const listener of listeners) listener();
  }

  function diagnosticContext(): PwaDetails {
    return {
      online: navigator.onLine,
      visible: document.visibilityState === "visible",
      secure_context: window.isSecureContext,
      register_native: /\[native code\]/.test(
        Function.prototype.toString.call(navigator.serviceWorker.register),
      ),
      controller_state: navigator.serviceWorker.controller?.state ?? null,
      active_state: registration?.active?.state ?? null,
      installing_state: registration?.installing?.state ?? null,
      waiting_state: registration?.waiting?.state ?? null,
      worker_version: workerVersion,
    };
  }

  function report(error: unknown, details: PwaDetails = {}): void {
    let context: PwaDetails = {};
    try {
      context = diagnosticContext();
    } catch {
      // A restricted browser API must not hide the original failure.
    }
    options.onError?.(withPwaDetails(error, { ...context, ...details }));
  }

  function clearPreparationTimeout(): void {
    if (preparationTimeout !== null) clearTimeout(preparationTimeout);
    preparationTimeout = null;
  }

  function synchronizeInstallation(): void {
    const installed = isInstalled();
    patch({
      installed,
      installMethod: installed
        ? PwaInstallMethod.None
        : prompt
          ? PwaInstallMethod.Prompt
          : fallbackInstallMethod,
    });
  }

  function capturePrompt(event: Event): void {
    event.preventDefault();
    prompt = event as InstallPromptEvent;
    synchronizeInstallation();
  }

  function installed(): void {
    prompt = null;
    installedInSession = true;
    patch({ installed: true, installMethod: PwaInstallMethod.None });
  }

  if (supported) {
    window.addEventListener("beforeinstallprompt", capturePrompt);
    window.addEventListener("appinstalled", installed);
    standalone.addEventListener("change", synchronizeInstallation);
    windowControlsOverlay.addEventListener("change", synchronizeInstallation);
  }

  async function readAndPrepareOffline(
    worker: ServiceWorker,
    expectedSession: number,
  ): Promise<void> {
    const isCurrentWorker = () => {
      const controller = navigator.serviceWorker.controller;
      return session === expectedSession && !disposed && (!controller || controller === worker);
    };
    if (!isCurrentWorker()) return;
    clearPreparationTimeout();
    workerVersion = null;
    let attempt = 0;
    try {
      let status: OfflineResponse;
      while (true) {
        attempt++;
        try {
          status = await workerRequest(worker, PwaWorkerMessage.OfflineStatus);
          break;
        } catch (error) {
          const failure = (error as Error & { diagnosticDetails?: { pwa?: PwaDetails } })
            .diagnosticDetails?.pwa?.failure;
          if (
            failure !== PwaFailure.Timeout ||
            attempt >= MAX_STATUS_ATTEMPTS ||
            !isCurrentWorker() ||
            worker.state !== "activated"
          )
            throw error;
        }
      }
      if (!isCurrentWorker()) return;
      workerVersion = typeof status.version === "string" ? status.version : null;
      if (!status.ready && !repairAttempts.has(worker)) {
        repairAttempts.add(worker);
        patch({ offlineStatus: PwaOfflineStatus.Preparing });
        status = await workerRequest(
          worker,
          PwaWorkerMessage.PrepareOffline,
          PREPARATION_TIMEOUT_MS,
        );
      }
      if (!isCurrentWorker()) return;
      workerVersion = typeof status.version === "string" ? status.version : workerVersion;
      if (!status.ready)
        throw withPwaDetails(new Error("The offline application cache is not ready."), {
          stage: PwaDiagnosticStage.Prepare,
          failure: PwaFailure.CacheNotReady,
          worker_state: worker.state,
        });
      clearPreparationTimeout();
      patch({ offlineStatus: PwaOfflineStatus.Ready });
    } catch (error) {
      if (!isCurrentWorker()) return;
      clearPreparationTimeout();
      patch({ offlineStatus: PwaOfflineStatus.Failed });
      report(error, { attempt });
    }
  }

  function prepareOffline(worker: ServiceWorker, expectedSession: number): Promise<void> {
    const pending = pendingPreparations.get(worker);
    if (pending) return pending;
    const preparation = readAndPrepareOffline(worker, expectedSession);
    pendingPreparations.set(worker, preparation);
    void preparation.then(() => {
      if (pendingPreparations.get(worker) === preparation) pendingPreparations.delete(worker);
    });
    return preparation;
  }

  function observeWorker(worker: ServiceWorker, expectedSession: number): void {
    const changed = () => {
      if (session !== expectedSession || disposed) return;
      if (worker.state === "activated") void prepareOffline(worker, expectedSession);
      if (worker.state === "redundant" && !registration?.active) {
        clearPreparationTimeout();
        patch({ offlineStatus: PwaOfflineStatus.Failed });
      }
    };
    worker.addEventListener("statechange", changed);
    removers.push(() => worker.removeEventListener("statechange", changed));
    changed();
  }

  async function register(expectedSession: number): Promise<void> {
    const startedAt = performance.now();
    let registered = false;
    patch({ offlineStatus: PwaOfflineStatus.Preparing });
    clearPreparationTimeout();
    preparationTimeout = setTimeout(() => {
      if (session === expectedSession && !disposed) {
        patch({ offlineStatus: PwaOfflineStatus.Failed });
        report(new Error("The offline application did not activate."), {
          stage: registered ? PwaDiagnosticStage.Activation : PwaDiagnosticStage.Register,
          failure: PwaFailure.Timeout,
          timeout_ms: PREPARATION_TIMEOUT_MS,
          elapsed_ms: Math.round(performance.now() - startedAt),
        });
      }
    }, PREPARATION_TIMEOUT_MS);
    try {
      const current = await navigator.serviceWorker.register(
        `${options.baseUrl}${SERVICE_WORKER_FILENAME}`,
        { updateViaCache: "none" },
      );
      if (session !== expectedSession || disposed) return;
      registered = true;
      registration = current;
      const updateFound = () => {
        if (session !== expectedSession || disposed) return;
        if (current.installing) observeWorker(current.installing, expectedSession);
      };
      current.addEventListener("updatefound", updateFound);
      removers.push(() => current.removeEventListener("updatefound", updateFound));
      updateFound();
      if (current.active) await prepareOffline(current.active, expectedSession);
      else if (!current.installing && !current.waiting) {
        clearPreparationTimeout();
        patch({ offlineStatus: PwaOfflineStatus.Failed });
        report(new Error("The offline application has no worker."), {
          stage: PwaDiagnosticStage.Activation,
          failure: PwaFailure.NoWorker,
        });
      }
      if (current.waiting) observeWorker(current.waiting, expectedSession);
    } catch (error) {
      if (session !== expectedSession || disposed) return;
      clearPreparationTimeout();
      patch({ offlineStatus: PwaOfflineStatus.Failed });
      report(error, {
        stage: PwaDiagnosticStage.Register,
        elapsed_ms: Math.round(performance.now() - startedAt),
      });
    }
  }

  function stopSession(): void {
    session++;
    clearPreparationTimeout();
    for (const remove of removers.splice(0)) remove();
    pendingPreparations = new WeakMap();
    repairAttempts = new WeakSet();
  }

  return {
    getState: () => state,
    subscribe(listener) {
      listeners.add(listener);
      return () => listeners.delete(listener);
    },
    start() {
      if (!supported || disposed) return () => {};
      if (options.offlineEnabled === false) return () => {};
      references++;
      if (references === 1) {
        const currentSession = ++session;
        const controllerChanged = () => {
          const controller = navigator.serviceWorker.controller;
          if (controller) void prepareOffline(controller, currentSession);
        };
        const reconnected = () => {
          repairAttempts = new WeakSet();
          const active = navigator.serviceWorker.controller ?? registration?.active;
          if (active) void prepareOffline(active, currentSession);
          if (registration)
            void registration
              .update()
              .catch((error) => report(error, { stage: PwaDiagnosticStage.Update }));
          else void register(currentSession);
        };
        const visible = () => {
          if (
            document.visibilityState !== "visible" ||
            state.offlineStatus !== PwaOfflineStatus.Failed
          )
            return;
          const worker = navigator.serviceWorker.controller ?? registration?.active;
          if (worker?.state === "activated") void prepareOffline(worker, currentSession);
        };
        navigator.serviceWorker.addEventListener("controllerchange", controllerChanged);
        window.addEventListener("online", reconnected);
        document.addEventListener("visibilitychange", visible);
        removers.push(() => {
          navigator.serviceWorker.removeEventListener("controllerchange", controllerChanged);
          window.removeEventListener("online", reconnected);
          document.removeEventListener("visibilitychange", visible);
        });
        void register(currentSession);
      }
      let stopped = false;
      return () => {
        if (stopped) return;
        stopped = true;
        references--;
        if (references === 0) stopSession();
      };
    },
    async install() {
      const current = prompt;
      if (!current) return PwaInstallOutcome.Unavailable;
      prompt = null;
      synchronizeInstallation();
      try {
        await current.prompt();
        const choice = await current.userChoice;
        if (choice.outcome === "accepted") installedInSession = true;
        return choice.outcome === "accepted"
          ? PwaInstallOutcome.Accepted
          : PwaInstallOutcome.Dismissed;
      } catch (error) {
        report(error, { stage: PwaDiagnosticStage.Install });
        throw error;
      } finally {
        synchronizeInstallation();
      }
    },
    async requestPersistentStorage() {
      if (!supported || options.offlineEnabled === false || !navigator.storage?.persist) return;
      try {
        if (!(await navigator.storage.persisted())) await navigator.storage.persist();
      } catch (error) {
        report(error, { stage: PwaDiagnosticStage.Persistence });
      }
    },
    dispose() {
      disposed = true;
      stopSession();
      window.removeEventListener("beforeinstallprompt", capturePrompt);
      window.removeEventListener("appinstalled", installed);
      standalone.removeEventListener("change", synchronizeInstallation);
      windowControlsOverlay.removeEventListener("change", synchronizeInstallation);
      listeners.clear();
      prompt = null;
    },
  };
}
