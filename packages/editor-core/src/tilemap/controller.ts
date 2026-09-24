import { MAX_IMAGE_PIXELS } from "$/base/image-limits";
import { INT16_MAX, INT16_MIN } from "$/base/numeric-constants";
import type { Rgba } from "$/base/primitives";
import type { AsepriteTileset, AsepriteUserData } from "$/import-export/aseprite/model";
import {
  convertLayerToTilemap,
  createTilemapLayer,
  deleteTilesetTile,
  duplicateTilesetTile,
  moveTilesetTiles,
  rasterizeTilemapLayer,
  refreshTilemapProjections,
  reorderTileset,
  remapTilesetReferencesByContent,
  TILE_INDEX_MASK,
  type TilemapLayerOptions,
} from "$/tilemap/model";
import {
  TILESET_EMBEDDED_PIXELS_FLAG,
  TILESET_MATCH_FLAGS_MASK,
  TilemapDisplayMode,
  TilesetMode,
} from "$/tilemap/types";
import { MAX_TIMELINE_LAYERS } from "$/timeline/timeline";
import type { SpriteTimeline } from "$/timeline/types";

export interface TilemapControllerSettings {
  tilemapMode?: TilemapDisplayMode;
  tilesetMode?: TilesetMode;
  selectedTile?: number;
  backgroundTile?: number;
  background: Rgba;
  backgroundIndex?: number | null;
}

export type TilesetAction = "delete" | "duplicate" | "move-left" | "move-right";

export interface TilemapLayerConversionOptions {
  tileWidth: number;
  tileHeight: number;
  tilesetName?: string;
  baseIndex?: number;
  matchFlags?: number;
}

export interface TilemapControllerPort {
  getTimeline(): SpriteTimeline | null;
  getSettings(): TilemapControllerSettings;
  setSettings(patch: Partial<TilemapControllerSettings>): void;
  canEditActiveLayer(): boolean;
  resolvePendingCel(): boolean;
  changeTimeline(label: string, change: (timeline: SpriteTimeline) => SpriteTimeline): void;
  setStatus(message: string): void;
  publish(pixelsChanged?: boolean): void;
}

const externalPixelsAvailable = (tileset: Pick<AsepriteTileset, "external" | "flags">) =>
  !tileset.external || !!(tileset.flags & TILESET_EMBEDDED_PIXELS_FLAG);

export class TilemapController {
  constructor(private readonly port: TilemapControllerPort) {}

  isActiveLayerTilemap(): boolean {
    const timeline = this.port.getTimeline();
    return !!timeline && timeline.layers[timeline.activeLayer]?.kind === "tilemap";
  }

  setTilemapMode(mode: TilemapDisplayMode): void {
    if (mode !== TilemapDisplayMode.Tiles && mode !== TilemapDisplayMode.Pixels) return;
    const timeline = this.port.getTimeline();
    const tileset = timeline?.tilesets?.find(
      (candidate) => candidate.id === timeline.layers[timeline.activeLayer]?.tilesetId,
    );
    if (mode === TilemapDisplayMode.Pixels && tileset && !externalPixelsAvailable(tileset)) {
      this.port.setStatus("External Tileset has no embedded pixels");
      this.port.publish();
      return;
    }
    this.port.resolvePendingCel();
    this.port.setSettings({ tilemapMode: mode });
  }

  setTilesetMode(mode: TilesetMode): void {
    if (![TilesetMode.Manual, TilesetMode.Auto, TilesetMode.Stack].includes(mode)) return;
    const timeline = this.port.getTimeline();
    const tileset = timeline?.tilesets?.find(
      (candidate) => candidate.id === timeline.layers[timeline.activeLayer]?.tilesetId,
    );
    if (tileset && !externalPixelsAvailable(tileset)) {
      this.port.setStatus("External Tileset has no embedded pixels");
      this.port.publish();
      return;
    }
    this.port.resolvePendingCel();
    this.port.setSettings({ tilesetMode: mode, tilemapMode: TilemapDisplayMode.Pixels });
  }

  setSelectedTile(tile: number): void {
    if (Number.isInteger(tile)) this.port.setSettings({ selectedTile: tile >>> 0 });
  }

  setBackgroundTile(tile: number): void {
    if (Number.isInteger(tile)) this.port.setSettings({ backgroundTile: tile >>> 0 });
  }

  updateTilesetProperties(patch: { name?: string; baseIndex?: number; matchFlags?: number }): void {
    if (!this.isActiveLayerTilemap() || !this.port.canEditActiveLayer()) return;
    this.port.changeTimeline("Edit Layer", (timeline) => {
      const id = timeline.layers[timeline.activeLayer].tilesetId;
      const tileset = timeline.tilesets?.find((candidate) => candidate.id === id);
      if (!tileset) return timeline;
      const name = patch.name === undefined ? tileset.name : patch.name.trim();
      const baseIndex = patch.baseIndex ?? tileset.baseIndex;
      if (!Number.isInteger(baseIndex) || baseIndex < INT16_MIN || baseIndex > INT16_MAX)
        throw new RangeError("Invalid Tileset properties");
      const flags =
        patch.matchFlags === undefined
          ? tileset.flags
          : (tileset.flags & ~TILESET_MATCH_FLAGS_MASK) |
            (patch.matchFlags & TILESET_MATCH_FLAGS_MASK);
      if (name === tileset.name && baseIndex === tileset.baseIndex && flags === tileset.flags)
        return timeline;
      return {
        ...timeline,
        tilesets: timeline.tilesets!.map((candidate) =>
          candidate.id === id ? { ...candidate, name, baseIndex, flags } : candidate,
        ),
      };
    });
  }

  setActiveLayerTileset(id: number): void {
    if (!this.isActiveLayerTilemap() || !this.port.canEditActiveLayer()) return;
    this.port.changeTimeline("Set Tileset", (timeline) => {
      const target = timeline.tilesets?.find((candidate) => candidate.id === id);
      const layer = timeline.layers[timeline.activeLayer];
      if (!target) throw new Error("Missing Tileset");
      if (layer.tilesetId === id) return timeline;
      for (const frame of timeline.frames) {
        const cells = frame.cels[timeline.activeLayer]?.tilemap?.tiles;
        if (cells && cells.some((value) => (value & TILE_INDEX_MASK) >= target.tileCount))
          throw new RangeError("Target Tileset has fewer tiles than the Tilemap uses");
      }
      return refreshTilemapProjections({
        ...timeline,
        layers: timeline.layers.map((candidate, index) =>
          index === timeline.activeLayer ? { ...candidate, tilesetId: id } : candidate,
        ),
      });
    });
  }

  setActiveLayerTilesetProperties(
    id: number,
    patch: {
      name: string;
      baseIndex: number;
      matchFlags: number;
      userData?: AsepriteUserData | null;
      tileUserData?: { index: number; userData: AsepriteUserData | null };
    },
  ): void {
    if (!this.isActiveLayerTilemap() || !this.port.canEditActiveLayer()) return;
    this.port.changeTimeline("Set Tileset Properties", (timeline) => {
      const target = timeline.tilesets?.find((candidate) => candidate.id === id);
      const layer = timeline.layers[timeline.activeLayer];
      if (!target) throw new Error("Missing Tileset");
      if (
        !Number.isInteger(patch.baseIndex) ||
        patch.baseIndex < INT16_MIN ||
        patch.baseIndex > INT16_MAX
      )
        throw new RangeError("Invalid Tileset properties");
      if (layer.tilesetId !== id)
        for (const frame of timeline.frames) {
          const cells = frame.cels[timeline.activeLayer]?.tilemap?.tiles;
          if (cells && cells.some((value) => (value & TILE_INDEX_MASK) >= target.tileCount))
            throw new RangeError("Target Tileset has fewer tiles than the Tilemap uses");
        }
      const name = patch.name.trim();
      const flags =
        (target.flags & ~TILESET_MATCH_FLAGS_MASK) | (patch.matchFlags & TILESET_MATCH_FLAGS_MASK);
      const userDataChanged = Object.prototype.hasOwnProperty.call(patch, "userData");
      const tileUserDataChanged = patch.tileUserData !== undefined;
      let tileUserData = target.tileUserData;
      if (patch.tileUserData) {
        const { index, userData } = patch.tileUserData;
        if (!Number.isInteger(index) || index < 0 || index >= target.tileCount)
          throw new RangeError("Invalid Tileset tile index");
        tileUserData = Array.from({ length: target.tileCount }, (_, tileIndex) =>
          tileIndex === index ? (userData ?? {}) : (target.tileUserData?.[tileIndex] ?? {}),
        );
      }
      if (
        layer.tilesetId === id &&
        target.name === name &&
        target.baseIndex === patch.baseIndex &&
        target.flags === flags &&
        (!userDataChanged ||
          JSON.stringify(patch.userData ?? null) === JSON.stringify(target.userData ?? null)) &&
        (!tileUserDataChanged ||
          JSON.stringify(tileUserData ?? null) === JSON.stringify(target.tileUserData ?? null))
      )
        return timeline;
      const next = {
        ...timeline,
        tilesets: timeline.tilesets!.map((candidate) =>
          candidate.id === id
            ? {
                ...candidate,
                name,
                baseIndex: patch.baseIndex,
                flags,
                ...(userDataChanged ? { userData: patch.userData ?? undefined } : {}),
                ...(tileUserDataChanged ? { tileUserData } : {}),
              }
            : candidate,
        ),
        layers: timeline.layers.map((candidate, index) =>
          index === timeline.activeLayer ? { ...candidate, tilesetId: id } : candidate,
        ),
      };
      return layer.tilesetId === id ? next : refreshTilemapProjections(next);
    });
  }

  addTilemapLayer(options: TilemapLayerOptions): void {
    const timeline = this.port.getTimeline();
    if (!timeline || timeline.layers.length >= MAX_TIMELINE_LAYERS) return;
    this.port.changeTimeline("Edit Layer", (current) => createTilemapLayer(current, options));
    this.port.setSettings({
      tilemapMode:
        options.tilesetId === undefined ? TilemapDisplayMode.Pixels : TilemapDisplayMode.Tiles,
      tilesetMode: TilesetMode.Auto,
      selectedTile: 0,
    });
    this.port.publish(true);
  }

  convertLayerTilemap(toTilemap: boolean, options?: TilemapLayerConversionOptions): void {
    const timeline = this.port.getTimeline();
    const layer = timeline?.layers[timeline.activeLayer];
    if (
      !timeline ||
      !layer ||
      !layer.visible ||
      !this.port.canEditActiveLayer() ||
      layer.flags & (8 | 64) ||
      layer.kind === "group"
    )
      return;
    if (toTilemap && layer.kind !== "tilemap")
      this.port.changeTimeline("Edit Layer", (current) =>
        convertLayerToTilemap(
          current,
          current.activeLayer,
          options ?? {
            tileWidth: current.gridBounds?.width ?? 16,
            tileHeight: current.gridBounds?.height ?? 16,
          },
        ),
      );
    else if (!toTilemap && layer.kind === "tilemap")
      this.port.changeTimeline("Edit Layer", (current) =>
        rasterizeTilemapLayer(current, current.activeLayer),
      );
  }

  editTileset(action: TilesetAction, index: number): void {
    if (!this.isActiveLayerTilemap() || !this.port.canEditActiveLayer()) return;
    this.port.changeTimeline("Edit Layer", (timeline) => {
      const id = timeline.layers[timeline.activeLayer].tilesetId;
      const tileset = timeline.tilesets?.find((candidate) => candidate.id === id);
      if (!tileset || !Number.isInteger(index) || index <= 0 || index >= tileset.tileCount)
        return timeline;
      if (!externalPixelsAvailable(tileset)) return timeline;
      if (action === "delete") return deleteTilesetTile(timeline, tileset.id, index);
      if (action === "duplicate") return duplicateTilesetTile(timeline, tileset.id, index);
      const targetIndex = index + (action === "move-left" ? -1 : 1);
      if (targetIndex <= 0 || targetIndex >= tileset.tileCount) return timeline;
      const order = Array.from({ length: tileset.tileCount }, (_, tile) => tile);
      [order[index], order[targetIndex]] = [order[targetIndex], order[index]];
      return reorderTileset(timeline, tileset.id, order);
    });
    const timeline = this.port.getTimeline();
    const tileset = timeline?.tilesets?.find(
      (candidate) => candidate.id === timeline.layers[timeline.activeLayer].tilesetId,
    );
    if (tileset)
      this.setSelectedTile(
        Math.min(
          (this.port.getSettings().selectedTile ?? 0) & TILE_INDEX_MASK,
          tileset.tileCount - 1,
        ),
      );
  }

  moveSelectedTilesetTiles(indices: readonly number[], beforeIndex: number, copy = false): void {
    if (!this.isActiveLayerTilemap() || !this.port.canEditActiveLayer()) return;
    this.port.changeTimeline("Edit Layer", (timeline) => {
      const tileset = timeline.tilesets?.find(
        (candidate) => candidate.id === timeline.layers[timeline.activeLayer].tilesetId,
      );
      if (!tileset || !externalPixelsAvailable(tileset)) return timeline;
      return moveTilesetTiles(timeline, tileset.id, indices, beforeIndex, copy);
    });
  }

  deleteSelectedTilesetTiles(indices: readonly number[]): void {
    if (!this.isActiveLayerTilemap() || !this.port.canEditActiveLayer()) return;
    this.port.changeTimeline("Edit Layer", (timeline) => {
      const tileset = timeline.tilesets?.find(
        (candidate) => candidate.id === timeline.layers[timeline.activeLayer].tilesetId,
      );
      if (!tileset || !externalPixelsAvailable(tileset)) return timeline;
      const deleted = new Set(
        indices.filter(
          (index) => Number.isInteger(index) && index > 0 && index < tileset.tileCount,
        ),
      );
      if (!deleted.size) return timeline;
      return reorderTileset(
        timeline,
        tileset.id,
        Array.from({ length: tileset.tileCount }, (_, index) => index).filter(
          (index) => !deleted.has(index),
        ),
      );
    });
  }

  resizeTileset(tileCount: number): void {
    if (
      !this.isActiveLayerTilemap() ||
      !this.port.canEditActiveLayer() ||
      !Number.isInteger(tileCount) ||
      tileCount < 1
    )
      return;
    this.port.changeTimeline("Resize Tiles", (timeline) => {
      const tileset = timeline.tilesets?.find(
        (candidate) => candidate.id === timeline.layers[timeline.activeLayer].tilesetId,
      );
      if (!tileset || !externalPixelsAvailable(tileset) || tileCount === tileset.tileCount)
        return timeline;
      if (tileCount < tileset.tileCount)
        return reorderTileset(
          timeline,
          tileset.id,
          Array.from({ length: tileCount }, (_, index) => index),
        );
      const stride = tileset.tileWidth * tileset.tileHeight * 4;
      if (stride * tileCount > MAX_IMAGE_PIXELS * 4)
        throw new RangeError("Tileset exceeds memory limit");
      const pixels = new Uint8Array(stride * tileCount);
      pixels.set(tileset.pixels);
      let asepritePixels: Uint8Array | undefined;
      if (tileset.asepritePixels) {
        const sampleStride = tileset.asepritePixels.length / tileset.tileCount;
        asepritePixels = new Uint8Array(sampleStride * tileCount);
        asepritePixels.set(tileset.asepritePixels);
        for (let index = tileset.tileCount; index < tileCount; index++)
          asepritePixels.set(
            tileset.asepritePixels.subarray(0, sampleStride),
            index * sampleStride,
          );
      }
      const tileUserData = tileset.tileUserData ? [...tileset.tileUserData] : undefined;
      if (tileUserData) tileUserData.length = tileCount;
      return {
        ...timeline,
        tilesets: timeline.tilesets!.map((candidate) =>
          candidate.id === tileset.id
            ? { ...candidate, tileCount, pixels, asepritePixels, tileUserData }
            : candidate,
        ),
      };
    });
    const timeline = this.port.getTimeline();
    const active = timeline?.tilesets?.find(
      (candidate) => candidate.id === timeline.layers[timeline.activeLayer]?.tilesetId,
    );
    const selectedTile = this.port.getSettings().selectedTile ?? 0;
    if (active && (selectedTile & TILE_INDEX_MASK) >= active.tileCount)
      this.setSelectedTile(active.tileCount - 1);
  }

  remapTilesetReferences(oldSet: AsepriteTileset): void {
    if (!this.isActiveLayerTilemap() || !this.port.canEditActiveLayer()) return;
    this.port.changeTimeline("Edit Layer", (timeline) => {
      const tileset = timeline.tilesets?.find(
        (candidate) => candidate.id === timeline.layers[timeline.activeLayer].tilesetId,
      );
      return tileset && tileset.id === oldSet.id
        ? remapTilesetReferencesByContent(timeline, tileset.id, oldSet)
        : timeline;
    });
  }
}
