import type { PreferenceStoragePort } from "$/managers/ports/platform";
import {
  PwaInstallMethod,
  PwaInstallOutcome,
  type PwaPlatformState,
  type PwaPort,
} from "$/managers/ports/pwa";

export { PwaInstallMethod };

export enum PwaNotice {
  AddToDesktopHint = "add-to-desktop-hint",
  DesktopInstructions = "desktop-instructions",
}

const INSTALL_HINT_DISMISSED_KEY = "xprite.pwa.install-hint-dismissed";
const DISMISSED_VALUE = "1";
const INSTALL_HINT_DURATION_MS = 5_000;
const INSTALL_INSTRUCTIONS_DURATION_MS = 8_000;

export interface PwaState extends PwaPlatformState {
  readonly installBusy: boolean;
  readonly notice: PwaNotice | null;
}

interface PwaManagerOptions {
  port: PwaPort;
  preferences: PreferenceStoragePort;
}

export class PwaManager {
  private readonly listeners = new Set<() => void>();
  private state: PwaState;
  private hintShown = false;
  private storageRequested = false;
  private lifetime = 0;
  private noticeTimeout: ReturnType<typeof setTimeout> | null = null;

  constructor(private readonly options: PwaManagerOptions) {
    try {
      this.hintShown = options.preferences.getItem(INSTALL_HINT_DISMISSED_KEY) === DISMISSED_VALUE;
    } catch {
      // A restricted preference store does not prevent manual installation.
    }
    this.state = { ...options.port.getState(), installBusy: false, notice: null };
  }

  getState = (): PwaState => this.state;

  subscribe = (listener: () => void): (() => void) => {
    this.listeners.add(listener);
    return () => this.listeners.delete(listener);
  };

  start(): () => void {
    const lifetime = ++this.lifetime;
    const unsubscribe = this.options.port.subscribe(() => this.synchronizePlatform());
    const stop = this.options.port.start();
    this.synchronizePlatform();
    if (this.state.notice) this.showNotice(this.state.notice);
    return () => {
      if (this.lifetime === lifetime) this.lifetime++;
      this.clearNoticeTimeout();
      unsubscribe();
      stop();
    };
  }

  private synchronizePlatform(): void {
    const platform = this.options.port.getState();
    this.patch({ ...platform, ...(platform.installed ? { notice: null } : {}) });
    if (platform.installed) this.clearNoticeTimeout();
  }

  private patch(patch: Partial<PwaState>): void {
    const next = { ...this.state, ...patch };
    if (
      Object.keys(next).every(
        (key) => next[key as keyof PwaState] === this.state[key as keyof PwaState],
      )
    )
      return;
    this.state = next;
    for (const listener of this.listeners) listener();
  }

  private clearNoticeTimeout(): void {
    if (this.noticeTimeout !== null) clearTimeout(this.noticeTimeout);
    this.noticeTimeout = null;
  }

  private showNotice(notice: PwaNotice): void {
    this.clearNoticeTimeout();
    this.patch({ notice });
    this.noticeTimeout = setTimeout(
      () => {
        this.noticeTimeout = null;
        this.patch({ notice: null });
      },
      notice === PwaNotice.AddToDesktopHint
        ? INSTALL_HINT_DURATION_MS
        : INSTALL_INSTRUCTIONS_DURATION_MS,
    );
  }

  private rememberHint(): void {
    this.hintShown = true;
    try {
      this.options.preferences.setItem(INSTALL_HINT_DISMISSED_KEY, DISMISSED_VALUE);
    } catch {
      // Remember the hint in this session when persistent storage is unavailable.
    }
  }

  private requestStorage(): void {
    if (this.storageRequested || !this.state.supported) return;
    this.storageRequested = true;
    void this.options.port.requestPersistentStorage().catch(() => {});
  }

  markSuccessfulSave(): void {
    this.requestStorage();
    if (
      this.hintShown ||
      !this.state.supported ||
      this.state.installed ||
      this.state.installMethod !== PwaInstallMethod.Prompt
    )
      return;
    this.rememberHint();
    this.showNotice(PwaNotice.AddToDesktopHint);
  }

  async install(): Promise<void> {
    if (
      !this.state.supported ||
      this.state.installed ||
      this.state.installBusy ||
      this.state.installMethod === PwaInstallMethod.None
    )
      return;
    this.rememberHint();
    this.requestStorage();
    if (this.state.installMethod !== PwaInstallMethod.Prompt) {
      this.showNotice(PwaNotice.DesktopInstructions);
      return;
    }
    const lifetime = this.lifetime;
    this.clearNoticeTimeout();
    this.patch({ installBusy: true, notice: null });
    try {
      const outcome = await this.options.port.install();
      if (outcome === PwaInstallOutcome.Unavailable && lifetime === this.lifetime)
        this.showNotice(PwaNotice.DesktopInstructions);
    } catch {
      if (lifetime === this.lifetime) this.showNotice(PwaNotice.DesktopInstructions);
    } finally {
      this.patch({ installBusy: false });
      this.synchronizePlatform();
    }
  }
}
