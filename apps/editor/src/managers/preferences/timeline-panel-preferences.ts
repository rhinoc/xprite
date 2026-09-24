import type { PreferenceStoragePort } from "$/managers/ports/platform";
import {
  defaultOnionSkinSettings,
  normalizeOnionSkin,
  type OnionSkinSettings,
} from "@xprite/editor-core";

export interface TimelinePanelPreferences {
  firstFrame: number;
  thumbnailsEnabled: boolean;
  thumbnailZoom: number;
  thumbnailOverlayEnabled: boolean;
  thumbnailOverlaySize: number;
  thumbnailScaleUpToFit: boolean;
  onionSkin: OnionSkinSettings;
}

export type TimelinePanelPreferencesPatch = Partial<TimelinePanelPreferences>;

export const defaultTimelinePanelPreferences: TimelinePanelPreferences = {
  firstFrame: 1,
  thumbnailsEnabled: false,
  thumbnailZoom: 1,
  thumbnailOverlayEnabled: false,
  thumbnailOverlaySize: 5,
  thumbnailScaleUpToFit: false,
  onionSkin: defaultOnionSkinSettings,
};

const DEFAULTS_KEY = "xse.timeline.panel-defaults.v1";
const DOCUMENT_KEY_PREFIX = "xse.timeline.panel-document.v1.";

function normalize(value: unknown): TimelinePanelPreferences {
  const saved = value && typeof value === "object" ? (value as Record<string, unknown>) : {};
  const firstFrame = Number(saved.firstFrame);
  const zoom = Number(saved.thumbnailZoom);
  const overlaySize = Number(saved.thumbnailOverlaySize);
  return {
    firstFrame: Number.isSafeInteger(firstFrame)
      ? Math.max(-2147483648, Math.min(2147483647, firstFrame))
      : 1,
    thumbnailsEnabled: saved.thumbnailsEnabled === true,
    thumbnailZoom: Number.isFinite(zoom) ? Math.max(1, Math.min(10, zoom)) : 1,
    thumbnailOverlayEnabled: saved.thumbnailOverlayEnabled === true,
    thumbnailOverlaySize: Number.isFinite(overlaySize)
      ? Math.max(2, Math.min(10, Math.round(overlaySize)))
      : 5,
    thumbnailScaleUpToFit: saved.thumbnailScaleUpToFit === true,
    onionSkin: normalizeOnionSkin({
      ...defaultOnionSkinSettings,
      ...(saved.onionSkin && typeof saved.onionSkin === "object"
        ? (saved.onionSkin as Partial<OnionSkinSettings>)
        : {}),
    }),
  };
}

function read(key: string, storage?: PreferenceStoragePort): TimelinePanelPreferences | null {
  try {
    const stored = storage?.getItem(key);
    return stored ? normalize(JSON.parse(stored)) : null;
  } catch {
    return null;
  }
}

export function readTimelinePanelPreferences(
  documentName?: string,
  storage?: PreferenceStoragePort,
): TimelinePanelPreferences {
  const defaults = read(DEFAULTS_KEY, storage) ?? defaultTimelinePanelPreferences;
  if (!documentName) return defaults;
  return read(`${DOCUMENT_KEY_PREFIX}${encodeURIComponent(documentName)}`, storage) ?? defaults;
}

export function normalizeTimelinePanelPreferences(
  value: TimelinePanelPreferencesPatch | TimelinePanelPreferences,
): TimelinePanelPreferences {
  return normalize({ ...defaultTimelinePanelPreferences, ...value });
}

export function writeTimelinePanelPreferences(
  documentName: string | undefined,
  value: TimelinePanelPreferences,
  storage?: PreferenceStoragePort,
): void {
  try {
    const key = documentName
      ? `${DOCUMENT_KEY_PREFIX}${encodeURIComponent(documentName)}`
      : DEFAULTS_KEY;
    storage?.setItem(key, JSON.stringify(normalize(value)));
  } catch {
    // Preferences remain active for the current session when storage is unavailable.
  }
}

export function writeTimelinePanelDefaults(
  value: TimelinePanelPreferences,
  storage?: PreferenceStoragePort,
): void {
  writeTimelinePanelPreferences(undefined, value, storage);
}
