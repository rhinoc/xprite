import type { PreferenceStoragePort } from "$/managers/ports/platform";

export enum ColorPickerMode {
  Rgb = "RGB",
  Hsv = "HSV",
  Hsl = "HSL",
  Gray = "Gray",
  Mask = "Mask",
}

const COLOR_PICKER_MODE_KEY = "xse.color-picker.mode.v1";
const DEFAULT_COLOR_PICKER_MODE = ColorPickerMode.Rgb;

/** Representation preference shared by color popups, independent of the picked color. */
export class ColorPickerPreferences {
  private mode = DEFAULT_COLOR_PICKER_MODE;
  private readonly listeners = new Set<() => void>();

  constructor(private readonly storage?: PreferenceStoragePort) {
    try {
      const saved = storage?.getItem(COLOR_PICKER_MODE_KEY);
      if (
        Object.values(ColorPickerMode).includes(saved as ColorPickerMode) &&
        saved !== ColorPickerMode.Mask
      )
        this.mode = saved as ColorPickerMode;
    } catch {
      /* Use RGB when preference storage is unavailable. */
    }
  }

  getMode = () => this.mode;
  subscribe = (listener: () => void) => {
    this.listeners.add(listener);
    return () => {
      this.listeners.delete(listener);
    };
  };
  setMode = (mode: ColorPickerMode) => {
    // Mask is a transparent-color action, not a representation for the next color.
    if (mode === ColorPickerMode.Mask || mode === this.mode) return;
    this.mode = mode;
    try {
      this.storage?.setItem(COLOR_PICKER_MODE_KEY, mode);
    } catch {
      /* Keep the preference for this workspace. */
    }
    for (const listener of this.listeners) listener();
  };
  reset() {
    this.setMode(DEFAULT_COLOR_PICKER_MODE);
  }
}
