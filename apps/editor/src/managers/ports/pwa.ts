export enum PwaInstallMethod {
  None = "none",
  Prompt = "prompt",
  Ios = "ios",
  Safari = "safari",
  BrowserMenu = "browser-menu",
}

export enum PwaOfflineStatus {
  Unsupported = "unsupported",
  Preparing = "preparing",
  Ready = "ready",
  Failed = "failed",
}

export enum PwaInstallOutcome {
  Accepted = "accepted",
  Dismissed = "dismissed",
  Unavailable = "unavailable",
}

export interface PwaPlatformState {
  readonly supported: boolean;
  readonly installed: boolean;
  readonly installMethod: PwaInstallMethod;
  readonly offlineStatus: PwaOfflineStatus;
}

/** Installation and offline application I/O, without document or UI state. */
export interface PwaPort {
  getState(): PwaPlatformState;
  subscribe(listener: () => void): () => void;
  start(): () => void;
  install(): Promise<PwaInstallOutcome>;
  requestPersistentStorage(): Promise<void>;
  dispose(): void;
}
