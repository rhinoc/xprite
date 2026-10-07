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
    const channel = new MessageChannel();
    const finish = () => {
      clearTimeout(timeout);
      channel.port1.close();
      channel.port2.close();
    };
    const timeout = setTimeout(() => {
      finish();
      reject(new Error("The offline application did not respond."));
    }, timeoutMs);
    channel.port1.onmessage = (event: MessageEvent<OfflineResponse>) => {
      finish();
      if (
        event.data?.type !== PwaWorkerMessage.OfflineStatus ||
        typeof event.data.ready !== "boolean"
      ) {
        reject(new Error("Invalid offline application status."));
        return;
      }
      resolve(event.data);
    };
    channel.port1.onmessageerror = () => {
      finish();
      reject(new Error("The offline application response could not be read."));
    };
    try {
      worker.postMessage({ type }, [channel.port2]);
    } catch (error) {
      finish();
      reject(error);
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

  function report(error: unknown): void {
    options.onError?.(error);
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
    try {
      let status = await workerRequest(worker, PwaWorkerMessage.OfflineStatus);
      if (!isCurrentWorker()) return;
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
      clearPreparationTimeout();
      patch({ offlineStatus: status.ready ? PwaOfflineStatus.Ready : PwaOfflineStatus.Failed });
    } catch (error) {
      if (!isCurrentWorker()) return;
      clearPreparationTimeout();
      patch({ offlineStatus: PwaOfflineStatus.Failed });
      report(error);
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
    patch({ offlineStatus: PwaOfflineStatus.Preparing });
    clearPreparationTimeout();
    preparationTimeout = setTimeout(() => {
      if (session === expectedSession && !disposed)
        patch({ offlineStatus: PwaOfflineStatus.Failed });
    }, PREPARATION_TIMEOUT_MS);
    try {
      const current = await navigator.serviceWorker.register(
        `${options.baseUrl}${SERVICE_WORKER_FILENAME}`,
        { updateViaCache: "none" },
      );
      if (session !== expectedSession || disposed) return;
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
      }
      if (current.waiting) observeWorker(current.waiting, expectedSession);
    } catch (error) {
      if (session !== expectedSession || disposed) return;
      clearPreparationTimeout();
      patch({ offlineStatus: PwaOfflineStatus.Failed });
      report(error);
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
          if (registration) void registration.update().catch(report);
          else void register(currentSession);
        };
        navigator.serviceWorker.addEventListener("controllerchange", controllerChanged);
        window.addEventListener("online", reconnected);
        removers.push(() => {
          navigator.serviceWorker.removeEventListener("controllerchange", controllerChanged);
          window.removeEventListener("online", reconnected);
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
        report(error);
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
        report(error);
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
