import type { MiniToolWelcomePort } from "$/managers/ports/minitool/welcome";

export enum MiniToolWelcomePhase {
  Visible = "visible",
  Saving = "saving",
  Closed = "closed",
}

/** The host owns persistence; this manager owns the first-visit workflow. */
export class MiniToolWelcomeManager {
  private phase = MiniToolWelcomePhase.Visible;
  private listeners = new Set<() => void>();

  constructor(
    private readonly storage: MiniToolWelcomePort,
    private readonly reportError: (error: unknown) => void,
  ) {}

  async initialize(): Promise<void> {
    try {
      if (await this.storage.readDismissed()) this.phase = MiniToolWelcomePhase.Closed;
    } catch (error) {
      this.reportError(error);
    }
  }

  getSnapshot = () => this.phase;

  subscribe = (listener: () => void) => {
    this.listeners.add(listener);
    return () => {
      this.listeners.delete(listener);
    };
  };

  private publish(phase: MiniToolWelcomePhase): void {
    this.phase = phase;
    for (const listener of this.listeners) listener();
  }

  dismiss = async (): Promise<void> => {
    if (this.phase !== MiniToolWelcomePhase.Visible) return;
    this.publish(MiniToolWelcomePhase.Saving);
    try {
      await this.storage.rememberDismissed();
    } catch (error) {
      // An optional introduction must not prevent editing when storage is unavailable.
      this.reportError(error);
    } finally {
      this.publish(MiniToolWelcomePhase.Closed);
    }
  };
}
