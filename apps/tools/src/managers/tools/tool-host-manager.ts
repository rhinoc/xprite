import type { ToolHostPort } from "$/managers/ports/tool-host";
import type { AppearanceMode } from "@xprite/editor-ui/appearance";

/** Shared browser-host preferences, without document or conversion state. */
export class ToolHostManager {
  private mode: AppearanceMode;
  private listeners = new Set<() => void>();
  private stopAppearance: () => void;
  constructor(port: ToolHostPort) {
    this.mode = port.readAppearance();
    this.stopAppearance = port.watchAppearance((mode) => {
      this.mode = mode;
      for (const listener of this.listeners) listener();
    });
  }
  getAppearanceMode = () => this.mode;
  subscribe = (listener: () => void) => {
    this.listeners.add(listener);
    return () => {
      this.listeners.delete(listener);
    };
  };
  dispose() {
    this.stopAppearance();
    this.listeners.clear();
  }
}
