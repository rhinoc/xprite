import {
  PatternVariant,
  normalizePatternColor,
  type UiAppearance,
  type UiThemeTokens,
} from "@xprite/ui";

export enum DesktopAppearance {
  Light = "light",
  Dark = "dark",
  System = "system",
}

export interface DesktopPreferences {
  appearance: DesktopAppearance;
  pattern?: PatternVariant;
  patternForeground?: string;
  patternBackground?: string;
}

export interface DesktopPort {
  read(): unknown;
  write(preferences: DesktopPreferences): void;
  subscribe(listener: () => void): () => void;
  apply(preferences: DesktopPreferences): void;
  applyTheme?(tokens: UiThemeTokens, appearance: UiAppearance, themeId: string): void;
}

export const DEFAULT_DESKTOP_PREFERENCES: DesktopPreferences = {
  appearance: DesktopAppearance.Light,
};

export function normalizeDesktopPreferences(
  value: unknown,
  defaults = DEFAULT_DESKTOP_PREFERENCES,
): DesktopPreferences {
  if (!value || typeof value !== "object") return defaults;
  const saved = value as Partial<DesktopPreferences>;
  return {
    appearance: Object.values(DesktopAppearance).includes(saved.appearance!)
      ? saved.appearance!
      : defaults.appearance,
    pattern: Object.values(PatternVariant).includes(saved.pattern!) ? saved.pattern : undefined,
    patternForeground:
      typeof saved.patternForeground === "string"
        ? normalizePatternColor(saved.patternForeground)
        : undefined,
    patternBackground:
      typeof saved.patternBackground === "string"
        ? normalizePatternColor(saved.patternBackground)
        : undefined,
  };
}

/** Presentation preferences shared by public apps, separate from editor preferences. */
export class DesktopManager {
  private state: DesktopPreferences;
  private listeners = new Set<() => void>();
  private stop?: () => void;
  constructor(
    private readonly port?: DesktopPort,
    private readonly defaults = DEFAULT_DESKTOP_PREFERENCES,
  ) {
    this.state = normalizeDesktopPreferences(port?.read(), defaults);
  }
  getSnapshot = () => this.state;
  getServerSnapshot = () => this.defaults;
  subscribe = (listener: () => void) => {
    this.listeners.add(listener);
    if (!this.stop && this.port) {
      this.port.apply(this.state);
      this.stop = this.port.subscribe(() => {
        this.state = normalizeDesktopPreferences(this.port?.read(), this.defaults);
        this.port?.apply(this.state);
        for (const notify of this.listeners) notify();
      });
    }
    return () => {
      this.listeners.delete(listener);
      if (!this.listeners.size) {
        this.stop?.();
        this.stop = undefined;
      }
    };
  };
  private update(preferences: DesktopPreferences) {
    this.state = preferences;
    this.port?.write(preferences);
    this.port?.apply(preferences);
    for (const notify of this.listeners) notify();
  }
  setAppearance = (appearance: DesktopAppearance) => this.update({ ...this.state, appearance });
  setPattern = (pattern?: PatternVariant) => this.update({ ...this.state, pattern });
  setPatternColors = (foreground: string, background: string) => {
    const nextForeground = normalizePatternColor(foreground);
    const nextBackground = normalizePatternColor(background);
    if (nextForeground && nextBackground)
      this.update({
        ...this.state,
        patternForeground: nextForeground,
        patternBackground: nextBackground,
      });
  };
  applyTheme = (tokens: UiThemeTokens, appearance: UiAppearance, themeId: string) =>
    this.port?.applyTheme?.(tokens, appearance, themeId);
}
