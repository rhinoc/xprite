import type { UserPresetStoragePort } from "$/managers/ports/user-presets";
import {
  AsepriteInk,
  cloneGraph,
  persistentBrush,
  UINT8_MAX,
  type Brush,
  type BrushImage,
  type Rgba,
} from "@xprite/editor-core";

export interface UserBrushFlags {
  shape: boolean;
  size: boolean;
  angle: boolean;
  imageColor: boolean;
  foreground: boolean;
  background: boolean;
  ink: boolean;
  opacity: boolean;
  shade: boolean;
  pixelPerfect: boolean;
}
export const DEFAULT_USER_BRUSH_FLAGS: Readonly<UserBrushFlags> = {
  shape: true,
  size: true,
  angle: true,
  imageColor: true,
  foreground: false,
  background: false,
  ink: true,
  opacity: true,
  shade: true,
  pixelPerfect: false,
};
export interface UserShadeEntry {
  color: Rgba;
  paletteIndex?: number;
}
export type UserShadeColor = Rgba & { paletteIndex?: number };
export interface UserBrushSettings {
  foreground?: Rgba;
  background?: Rgba;
  ink?: AsepriteInk;
  opacity?: number;
  shade?: readonly UserShadeColor[];
}
export interface UserBrushSlot {
  id: number;
  value: Brush;
  flags: UserBrushFlags;
  locked: boolean;
  pixelPerfect: boolean;
  foreground?: Rgba;
  background?: Rgba;
  ink?: AsepriteInk;
  opacity?: number;
  shade: UserShadeEntry[];
}
export function copyUserBrushSlot(slot: UserBrushSlot): UserBrushSlot {
  return cloneGraph(slot);
}
export interface UserPresetsSnapshot {
  ready: boolean;
  brushes: readonly UserBrushSlot[];
  flags: UserBrushFlags;
  shades: readonly (readonly UserShadeEntry[])[];
}
const MIN_SHADE_COLORS = 2;
function record(value: unknown): Record<string, unknown> {
  return value && typeof value === "object" ? (value as Record<string, unknown>) : {};
}
function rgba(value: unknown): Rgba | undefined {
  return Array.isArray(value) &&
    value.length === 4 &&
    value.every((channel) => Number.isInteger(channel) && channel >= 0 && channel <= UINT8_MAX)
    ? ([...value] as unknown as Rgba)
    : undefined;
}
function normalizeFlags(value: unknown): UserBrushFlags {
  const source = record(value);
  return Object.fromEntries(
    Object.entries(DEFAULT_USER_BRUSH_FLAGS).map(([key, fallback]) => [
      key,
      typeof source[key] === "boolean" ? source[key] : fallback,
    ]),
  ) as unknown as UserBrushFlags;
}
function normalizeShade(value: unknown): UserShadeEntry[] {
  if (!Array.isArray(value)) return [];
  return value.flatMap((entry) => {
    const source = record(entry);
    const color = rgba(source.color);
    if (!color) return [];
    return [
      {
        color,
        ...(Number.isInteger(source.paletteIndex) && Number(source.paletteIndex) >= 0
          ? { paletteIndex: Number(source.paletteIndex) }
          : {}),
      },
    ];
  });
}
export function captureUserShade(colors: readonly UserShadeColor[]): UserShadeEntry[] {
  return colors.map((color) => ({
    color: [color[0], color[1], color[2], color[3]],
    ...(color.paletteIndex !== undefined ? { paletteIndex: color.paletteIndex } : {}),
  }));
}
export function restoreUserShade(
  entries: readonly UserShadeEntry[],
  palette?: readonly Rgba[],
): UserShadeColor[] {
  return entries.map((entry) =>
    Object.assign(
      [
        ...(entry.paletteIndex !== undefined
          ? (palette?.[entry.paletteIndex] ?? entry.color)
          : entry.color),
      ] as unknown as UserShadeColor,
      entry.paletteIndex !== undefined ? { paletteIndex: entry.paletteIndex } : {},
    ),
  );
}
function normalizeSlot(value: unknown): UserBrushSlot | null {
  const source = record(value);
  if (!Number.isSafeInteger(source.id) || Number(source.id) < 1) return null;
  const brush = record(source.value);
  let normalized = persistentBrush(brush);
  if (brush.shape === "image") {
    const image = record(brush.image);
    const width = Number(image.width),
      height = Number(image.height);
    if (
      !Number.isSafeInteger(width) ||
      !Number.isSafeInteger(height) ||
      width < 1 ||
      height < 1 ||
      !(image.data instanceof Uint8ClampedArray) ||
      image.data.length !== width * height * 4
    )
      return null;
    normalized = {
      ...normalized,
      shape: "image",
      image: cloneGraph(image) as unknown as BrushImage,
    };
  }
  return {
    id: Number(source.id),
    value: normalized,
    flags: normalizeFlags(source.flags),
    locked: source.locked === true,
    pixelPerfect: source.pixelPerfect === true,
    ...(rgba(source.foreground) ? { foreground: rgba(source.foreground) } : {}),
    ...(rgba(source.background) ? { background: rgba(source.background) } : {}),
    ...(Object.values(AsepriteInk).includes(source.ink as AsepriteInk)
      ? { ink: source.ink as AsepriteInk }
      : {}),
    ...(typeof source.opacity === "number" && Number.isFinite(source.opacity)
      ? { opacity: Math.round(Math.max(0, Math.min(UINT8_MAX, source.opacity))) }
      : {}),
    shade: normalizeShade(source.shade),
  };
}

/** Owns user presets for one workspace; bitmap pixels never live in UI stores. */
export class UserPresetsManager {
  private snapshot: UserPresetsSnapshot = {
    ready: false,
    brushes: [],
    flags: { ...DEFAULT_USER_BRUSH_FLAGS },
    shades: [],
  };
  private readonly listeners = new Set<() => void>();
  private initialization: Promise<void> | null = null;
  private writes: Promise<void> = Promise.resolve();
  private revision = 0;
  constructor(
    private readonly storage?: UserPresetStoragePort,
    private readonly onError?: (error: unknown) => void,
  ) {
    this.snapshot.ready = !storage;
  }
  getSnapshot = () => this.snapshot;
  subscribe = (listener: () => void) => {
    this.listeners.add(listener);
    return () => this.listeners.delete(listener);
  };
  initialize(): Promise<void> {
    if (this.initialization) return this.initialization;
    const revision = this.revision;
    this.initialization = (async () => {
      try {
        const saved = record(await this.storage?.load());
        if (saved.version !== 1 || revision !== this.revision) return;
        const brushes = Array.isArray(saved.brushes)
          ? saved.brushes
              .map(normalizeSlot)
              .filter((slot): slot is UserBrushSlot => !!slot && slot.locked)
          : [];
        this.snapshot = {
          ready: true,
          brushes,
          flags: normalizeFlags(saved.flags),
          shades: Array.isArray(saved.shades)
            ? saved.shades.map(normalizeShade).filter((shade) => shade.length >= MIN_SHADE_COLORS)
            : [],
        };
        this.emit();
      } catch (error) {
        this.onError?.(error);
      } finally {
        this.snapshot = { ...this.snapshot, ready: true };
        this.emit();
      }
    })();
    return this.initialization;
  }
  setFlags(flags: UserBrushFlags) {
    this.update({ ...this.snapshot, flags: normalizeFlags(flags) });
  }
  setBrushes(update: (brushes: UserBrushSlot[]) => UserBrushSlot[]) {
    this.update({
      ...this.snapshot,
      brushes: update([...this.snapshot.brushes]).map((slot) => cloneGraph(slot)),
    });
  }
  nextBrushId() {
    return Math.max(0, ...this.snapshot.brushes.map((slot) => slot.id)) + 1;
  }
  saveShade(colors: readonly UserShadeColor[]) {
    if (colors.length < MIN_SHADE_COLORS) return;
    this.update({ ...this.snapshot, shades: [...this.snapshot.shades, captureUserShade(colors)] });
  }
  removeShade(index: number) {
    this.update({ ...this.snapshot, shades: this.snapshot.shades.filter((_, i) => i !== index) });
  }
  resetBrushes() {
    this.update({ ...this.snapshot, brushes: [], flags: { ...DEFAULT_USER_BRUSH_FLAGS } });
  }
  resetShades() {
    this.update({ ...this.snapshot, shades: [] });
  }
  flush = () => this.writes;
  dispose() {
    void this.writes.finally(() => this.storage?.close());
  }
  private emit() {
    for (const listener of this.listeners) listener();
  }
  private update(snapshot: UserPresetsSnapshot) {
    this.snapshot = snapshot;
    this.revision++;
    this.emit();
    const saved = cloneGraph({
      version: 1,
      flags: snapshot.flags,
      shades: snapshot.shades,
      brushes: snapshot.brushes.filter((slot) => slot.locked),
    });
    this.writes = this.writes
      .then(() => this.storage?.save(saved))
      .then(
        () => {},
        (error) => this.onError?.(error),
      );
  }
}
