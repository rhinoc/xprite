import { nearbyIslandSurface } from "$/managers/animal-crossing/ground/nearby-surface";
import { sourceIslandSurface } from "$/managers/animal-crossing/ground/source-surface";
import {
  IslandArrangement,
  IslandCamera,
  IslandFilter,
  IslandGround,
  IslandColors,
  type IslandPreviewPort,
  type IslandScene,
  type IslandSurface,
} from "$/managers/ports/animal-crossing-ground";
import type { PixelBuffer } from "@xprite/editor-core/base";
import type {
  AnimalCrossingResult,
  AnimalCrossingSettings,
} from "@xprite/editor-core/import-export";

export {
  IslandArrangement,
  IslandCamera,
  IslandFilter,
  IslandGround,
  IslandColors,
} from "$/managers/ports/animal-crossing-ground";
export enum IslandPreviewStatus {
  Idle = "idle",
  Loading = "loading",
  Ready = "ready",
  Unavailable = "unavailable",
}
export interface IslandPreviewSnapshot {
  status: IslandPreviewStatus;
  ground: IslandGround;
  arrangement: IslandArrangement;
  filter: IslandFilter;
  colors: IslandColors;
  repeatCount: number;
  grid: boolean;
  error: string | null;
}
const DEFAULT_REPEAT = 3;
export const MIN_ISLAND_REPEAT = 1;
export const MAX_ISLAND_REPEAT = 7;
export class IslandPreviewManager {
  private snapshot: IslandPreviewSnapshot = {
    status: IslandPreviewStatus.Idle,
    ground: IslandGround.Spring,
    arrangement: IslandArrangement.Nearby,
    filter: IslandFilter.Smooth,
    colors: IslandColors.Qr,
    repeatCount: DEFAULT_REPEAT,
    grid: false,
    error: null,
  };
  private result: AnimalCrossingResult | null = null;
  private original: ReturnType<typeof sourceIslandSurface> | null = null;
  private selected = 0;
  private scene: IslandScene | null = null;
  private request = 0;
  private size = { width: 1, height: 1, pixelRatio: 1 };
  private nearbyCache: {
    pixels: PixelBuffer;
    selected: number;
    crop: ReturnType<typeof nearbyIslandSurface>;
  } | null = null;
  private closed = false;
  private listeners = new Set<() => void>();
  constructor(private readonly port?: IslandPreviewPort) {}
  getSnapshot = () => this.snapshot;
  subscribe = (listener: () => void) => {
    this.listeners.add(listener);
    return () => this.listeners.delete(listener);
  };
  private update(patch: Partial<IslandPreviewSnapshot>) {
    if (this.closed) return;
    this.snapshot = { ...this.snapshot, ...patch };
    for (const listener of this.listeners) listener();
  }
  private surface(): IslandSurface | null {
    if (!this.result) return null;
    const repeat = this.snapshot.arrangement === IslandArrangement.Repeat;
    const original = this.snapshot.colors === IslandColors.Original && this.original;
    const pixels = original
      ? repeat
        ? original.tiles[this.selected]
        : original.pixels
      : repeat
        ? this.result.patterns[this.selected]?.pixels
        : this.result.pixels;
    if (!pixels) return null;
    if (
      !repeat &&
      (this.nearbyCache?.pixels !== pixels || this.nearbyCache.selected !== this.selected)
    ) {
      this.nearbyCache = {
        pixels,
        selected: this.selected,
        crop: nearbyIslandSurface(pixels, this.result.columns, this.result.rows, this.selected),
      };
    }
    const nearby = !repeat ? this.nearbyCache!.crop : null;
    return {
      pixels: nearby?.pixels ?? pixels,
      columns: repeat ? this.snapshot.repeatCount : nearby!.columns,
      rows: repeat ? this.snapshot.repeatCount : nearby!.rows,
      repeat,
      ground: this.snapshot.ground,
      filter: this.snapshot.filter,
      grid: this.snapshot.grid,
    };
  }
  setDesign(
    result: AnimalCrossingResult | null,
    selected: number,
    source: PixelBuffer | null,
    settings: AnimalCrossingSettings,
  ) {
    const newResult = !!result && result !== this.result;
    if (newResult) this.original = source ? sourceIslandSurface(source, settings) : null;
    if (!result) {
      this.original = null;
      this.nearbyCache = null;
    }
    this.result = result;
    this.selected = selected;
    if (newResult)
      this.update({
        arrangement:
          result.patterns.length > MIN_ISLAND_REPEAT
            ? IslandArrangement.Nearby
            : IslandArrangement.Repeat,
      });
    this.scene?.setSurface(this.surface());
  }
  configure(
    patch: Partial<
      Pick<
        IslandPreviewSnapshot,
        "ground" | "arrangement" | "filter" | "repeatCount" | "grid" | "colors"
      >
    >,
  ) {
    if (patch.repeatCount !== undefined) {
      if (!Number.isFinite(patch.repeatCount)) return;
      patch.repeatCount = Math.max(
        MIN_ISLAND_REPEAT,
        Math.min(MAX_ISLAND_REPEAT, Math.round(patch.repeatCount)),
      );
    }
    this.update(patch);
    this.scene?.setSurface(this.surface());
  }
  async mount(host: HTMLElement) {
    const request = ++this.request;
    this.update({ status: IslandPreviewStatus.Loading, error: null });
    try {
      if (!this.port) throw new Error("The 3D preview is unavailable in this browser.");
      const scene = await this.port.create(host);
      if (this.closed || request !== this.request) {
        scene.dispose();
        return;
      }
      this.scene = scene;
      scene.setSize(this.size.width, this.size.height, this.size.pixelRatio);
      scene.setSurface(this.surface());
      scene.setCamera(IslandCamera.Overview);
      this.update({ status: IslandPreviewStatus.Ready });
    } catch (reason) {
      if (request === this.request)
        this.update({
          status: IslandPreviewStatus.Unavailable,
          error: reason instanceof Error ? reason.message : String(reason),
        });
    }
  }
  setSize(width: number, height: number, pixelRatio: number) {
    this.size = { width: Math.max(1, width), height: Math.max(1, height), pixelRatio };
    this.scene?.setSize(this.size.width, this.size.height, pixelRatio);
  }
  setCamera(camera: IslandCamera) {
    this.scene?.setCamera(camera);
  }
  unmount() {
    this.request++;
    this.scene?.dispose();
    this.scene = null;
    if (!this.closed) this.update({ status: IslandPreviewStatus.Idle });
  }
  dispose() {
    this.closed = true;
    this.unmount();
    this.result = null;
    this.original = null;
    this.nearbyCache = null;
    this.listeners.clear();
  }
}
