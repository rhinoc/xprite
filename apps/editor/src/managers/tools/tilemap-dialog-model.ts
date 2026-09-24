import { useEditorManagerContext } from "$/managers/editor/editor-state-manager";
import { useEditorSnapshot } from "$/managers/editor/use-editor-snapshot";
import type { AsepriteUserData } from "$/managers/user-data/user-data-manager";
import type { TilemapLayerConversionOptions, TilemapLayerOptions } from "@xprite/editor-core";

interface TilemapDialogTileset {
  id: number;
  name: string;
  tileWidth: number;
  tileHeight: number;
  baseIndex: number;
  flags: number;
  tileCount: number;
  userData?: AsepriteUserData;
  tileUserData?: readonly AsepriteUserData[];
}

export interface TilemapDialogModel {
  tilesets: readonly TilemapDialogTileset[];
  activeTileset: TilemapDialogTileset | null;
  tilemapLayerCount: number;
  defaultTileWidth: number;
  defaultTileHeight: number;
  setActiveTilesetProperties(
    id: number,
    properties: {
      name: string;
      baseIndex: number;
      matchFlags: number;
      userData?: AsepriteUserData | null;
      tileUserData?: { index: number; userData: AsepriteUserData | null };
    },
  ): void;
  convertActiveLayer(options: TilemapLayerConversionOptions): void;
  addLayer(options: TilemapLayerOptions): void;
  selectTile(index: number): void;
}

/** Tilemap dialog projection and commands; callers never receive editor-core objects. */
export function useTilemapDialogModel(): TilemapDialogModel {
  const { core } = useEditorManagerContext();
  const snapshot = useEditorSnapshot(core);
  const timeline = snapshot?.document?.timeline;
  const tilesets = (timeline?.tilesets ?? []).map((tileset) => ({
    id: tileset.id,
    name: tileset.name,
    tileWidth: tileset.tileWidth,
    tileHeight: tileset.tileHeight,
    baseIndex: tileset.baseIndex,
    flags: tileset.flags,
    tileCount: tileset.tileCount,
    userData: tileset.userData,
    tileUserData: tileset.tileUserData,
  }));
  const activeId = timeline?.layers[timeline.activeLayer]?.tilesetId;
  return {
    tilesets,
    activeTileset: tilesets.find((tileset) => tileset.id === activeId) ?? null,
    tilemapLayerCount: timeline?.layers.filter((layer) => layer.kind === "tilemap").length ?? 0,
    defaultTileWidth: tilesets[0]?.tileWidth ?? timeline?.gridBounds?.width ?? 16,
    defaultTileHeight: tilesets[0]?.tileHeight ?? timeline?.gridBounds?.height ?? 16,
    setActiveTilesetProperties: (id, properties) =>
      core?.tilemap.setActiveLayerTilesetProperties(id, properties),
    convertActiveLayer: (options) => core?.tilemap.convertLayerTilemap(true, options),
    addLayer: (options) => core?.tilemap.addTilemapLayer(options),
    selectTile: (index) => core?.tilemap.setSelectedTile(index),
  };
}
