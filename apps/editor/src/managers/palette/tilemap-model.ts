import { useCallback, useEffect, useMemo, useRef, useState } from "react";

import { WorkingColorTarget } from "$/managers/colors/working-color-target";
import { useEditorFields } from "$/managers/editor/editor-state-manager";
import { useEditorManagerContext } from "$/managers/editor/editor-state-manager";
import { useEditorSnapshot } from "$/managers/editor/use-editor-snapshot";
import { useEditorPlatformPorts } from "$/managers/platform/editor-platform-context";
import type { AsepriteUserData } from "$/managers/user-data/user-data-manager";
import { useOptionalEditorRuntimeManagerContext } from "$/managers/workspace/editor-runtime-context";
import {
  TILE_DIAGONAL_FLIP,
  TILE_INDEX_MASK,
  TILE_X_FLIP,
  TILE_Y_FLIP,
  TILESET_EMBEDDED_PIXELS_FLAG,
  TILESET_MATCH_FLAGS_MASK,
  TilemapDisplayMode,
  TilesetMode,
  expandAsepriteSamples,
  paletteForColors,
  type EditorSnapshot,
  type RasterEditor,
} from "@xprite/editor-core";
import type { AsepriteTileset } from "@xprite/editor-core/import-export";

export const TilemapPaletteDisplayMode = TilemapDisplayMode;
export type TilemapPaletteDisplayMode = TilemapDisplayMode;
export const TilesetEditingMode = TilesetMode;
export type TilesetEditingMode = TilesetMode;

const SHOW_BOTH_KEY = "xse.tilemap.color-and-tiles.v1";
const DEFAULT_MODE_KEY = "xse.tilemap.default-tileset-mode.v1";
const initializedModes = new WeakSet<RasterEditor>();

interface TilemapTilesetPreview {
  id: number;
  flags: number;
  name: string;
  tileWidth: number;
  tileHeight: number;
  tileCount: number;
  baseIndex: number;
  external: boolean;
  hasPixels: boolean;
  pixels: Uint8Array;
  tileUserData?: readonly AsepriteUserData[];
}

export interface TilemapPaletteModel {
  gestureOwner: object;
  isGestureOwnerCurrent(owner: object): boolean;
  workingColorTarget: WorkingColorTarget;
  setWorkingColorTarget(value: WorkingColorTarget): void;
  tilesetEditable: boolean;
  setTilesetEditable(value: boolean): void;
  active: boolean;
  tileset: TilemapTilesetPreview | null;
  selectedTileWord: number;
  backgroundTileWord: number;
  displayMode: TilemapPaletteDisplayMode;
  tilesetMode: TilesetEditingMode;
  selectTile(index: number): void;
  setBackgroundTile(index: number): void;
  setTileUserData(index: number, userData: AsepriteUserData | null): void;
  setDisplayMode(mode: TilemapPaletteDisplayMode): void;
  setTilesetMode(mode: TilesetEditingMode): void;
  resizeTileset(count: number): void;
  deleteTilesetTiles(indices: readonly number[]): void;
  moveTilesetTiles(indices: readonly number[], before: number, copy: boolean): void;
  remapMovedTiles(): void;
}

export function paletteTileIndex(tileWord: number): number {
  return tileWord & TILE_INDEX_MASK;
}

export function paletteTileSourcePoint(
  tileWord: number,
  x: number,
  y: number,
  width: number,
  height: number,
): { x: number; y: number } | null {
  let sourceX = tileWord & TILE_X_FLIP ? width - 1 - x : x;
  let sourceY = tileWord & TILE_Y_FLIP ? height - 1 - y : y;
  if (tileWord & TILE_DIAGONAL_FLIP) [sourceX, sourceY] = [sourceY, sourceX];
  return sourceX < width && sourceY < height ? { x: sourceX, y: sourceY } : null;
}

function activeTileset(
  snapshot: EditorSnapshot | null,
): { source: AsepriteTileset; pixels: Uint8Array } | null {
  const timeline = snapshot?.document?.timeline;
  if (!timeline) return null;
  const layer = timeline.layers[timeline.activeLayer];
  if (layer?.kind !== "tilemap") return null;
  const source = timeline.tilesets?.find((candidate) => candidate.id === layer.tilesetId);
  if (!source) return null;
  const depth = timeline.colorDepth;
  const colors = timeline.frames[timeline.activeFrame]?.palette ?? snapshot.document?.palette;
  const pixels =
    source.asepritePixels && (depth === 8 || depth === 16)
      ? new Uint8Array(
          expandAsepriteSamples(
            {
              depth,
              width: source.tileWidth,
              height: source.tileHeight * source.tileCount,
              data: source.asepritePixels,
            },
            paletteForColors(colors),
            timeline.transparentIndex ?? 0,
          ),
        )
      : source.pixels;
  return { source, pixels };
}

function viewTileset(source: AsepriteTileset, pixels: Uint8Array): TilemapTilesetPreview {
  return {
    id: source.id,
    flags: source.flags,
    name: source.name,
    tileWidth: source.tileWidth,
    tileHeight: source.tileHeight,
    tileCount: source.tileCount,
    baseIndex: source.baseIndex,
    external: Boolean(source.external),
    hasPixels: !source.external || Boolean(source.flags & TILESET_EMBEDDED_PIXELS_FLAG),
    pixels,
    tileUserData: source.tileUserData,
  };
}

export function useTilemapPaletteModel(): TilemapPaletteModel {
  const workflow = useEditorFields([
    "workingColorTarget",
    "setWorkingColorTarget",
    "tilesetEditable",
    "setTilesetEditable",
  ]);
  const { core } = useEditorManagerContext();
  const snapshot = useEditorSnapshot(core);
  const activeSet = activeTileset(snapshot);
  const runtime = useOptionalEditorRuntimeManagerContext();
  const documentKey = snapshot?.document?.id ?? snapshot?.document?.name ?? null;
  const gestureOwner = useMemo(() => ({}), [core, documentKey, activeSet?.source.id]);
  const isGestureOwnerCurrent = (owner: object) => {
    if (owner !== gestureOwner || (runtime && runtime.workspace.active.core !== core)) return false;
    const current = core?.getSnapshot() ?? null;
    const timeline = current?.document?.timeline;
    const layer = timeline?.layers[timeline.activeLayer];
    return (
      (current?.document?.id ?? current?.document?.name ?? null) === documentKey &&
      (layer?.kind === "tilemap" ? layer.tilesetId : undefined) === activeSet?.source.id
    );
  };
  const movedTileset = useRef<AsepriteTileset | null>(null);
  const mode = snapshot?.settings.tilemapMode ?? TilemapDisplayMode.Tiles;
  const tilesetMode = snapshot?.settings.tilesetMode ?? TilesetMode.Auto;
  useEffect(() => {
    movedTileset.current = null;
  }, [core, activeSet?.source.id]);
  const timeline = snapshot?.document?.timeline;
  return {
    ...workflow,
    gestureOwner,
    isGestureOwnerCurrent,
    active: timeline?.layers[timeline.activeLayer]?.kind === "tilemap",
    tileset: activeSet ? viewTileset(activeSet.source, activeSet.pixels) : null,
    selectedTileWord: snapshot?.settings.selectedTile ?? 0,
    backgroundTileWord: snapshot?.settings.backgroundTile ?? 0,
    displayMode: mode,
    tilesetMode,
    selectTile: (index) => core?.tilemap.setSelectedTile(index),
    setBackgroundTile: (index) => core?.tilemap.setBackgroundTile(index),
    setTileUserData: (index, userData) => {
      if (!core || !activeSet) return;
      const set = activeSet.source;
      core.tilemap.setActiveLayerTilesetProperties(set.id, {
        name: set.name,
        baseIndex: set.baseIndex,
        matchFlags: set.flags & TILESET_MATCH_FLAGS_MASK,
        tileUserData: { index, userData },
      });
    },
    setDisplayMode: (value) => core?.tilemap.setTilemapMode(value),
    setTilesetMode: (value) => core?.tilemap.setTilesetMode(value),
    resizeTileset: (count) => core?.tilemap.resizeTileset(count),
    deleteTilesetTiles: (indices) => core?.tilemap.deleteSelectedTilesetTiles(indices),
    moveTilesetTiles: (indices, before, copy) => {
      if (!core || !activeSet) return;
      movedTileset.current = copy ? null : activeSet.source;
      core.tilemap.moveSelectedTilesetTiles(indices, before, copy);
    },
    remapMovedTiles: () => {
      if (core && movedTileset.current) core.tilemap.remapTilesetReferences(movedTileset.current);
      movedTileset.current = null;
    },
  };
}

function readShowBoth(storage: ReturnType<typeof useEditorPlatformPorts>): boolean {
  try {
    return storage?.preferences.getItem(SHOW_BOTH_KEY) !== "false";
  } catch {
    return true;
  }
}

function readDefaultMode(storage: ReturnType<typeof useEditorPlatformPorts>): TilesetMode {
  try {
    const value = storage?.preferences.getItem(DEFAULT_MODE_KEY);
    if (value === TilesetMode.Manual || value === TilesetMode.Auto || value === TilesetMode.Stack)
      return value;
  } catch {
    // Keep the editor default when preferences are unavailable.
  }
  return TilesetMode.Auto;
}

export function useTilemapPalettePreferences() {
  const ports = useEditorPlatformPorts();
  const [showBoth, setShowBoth] = useState(() => readShowBoth(ports));
  const setShowBothAndSave = useCallback(
    (value: boolean) => {
      setShowBoth(value);
      try {
        ports?.preferences.setItem(SHOW_BOTH_KEY, String(value));
      } catch {
        // The session preference still applies.
      }
    },
    [ports],
  );
  return { showBoth, setShowBoth: setShowBothAndSave };
}

export function useTilemapModeBarModel() {
  const workflow = useEditorFields(["tilesetEditable", "setTilesetEditable"]);
  const { core } = useEditorManagerContext();
  const ports = useEditorPlatformPorts();
  const snapshot = useEditorSnapshot(core);
  const mode = snapshot?.settings.tilemapMode ?? TilemapDisplayMode.Tiles;
  const tilesetMode = snapshot?.settings.tilesetMode ?? TilesetMode.Auto;
  const defaultTilesetMode = readDefaultMode(ports);
  const activeSet = activeTileset(snapshot);
  useEffect(() => {
    if (!core || initializedModes.has(core)) return;
    initializedModes.add(core);
    const preferred = readDefaultMode(ports);
    if (preferred !== snapshot?.settings.tilesetMode) core.tilemap.setTilesetMode(preferred);
  }, [core, ports, snapshot?.settings.tilesetMode]);
  return {
    ...workflow,
    canReorderTiles: Boolean(
      activeSet &&
      (!activeSet.source.external || activeSet.source.flags & TILESET_EMBEDDED_PIXELS_FLAG),
    ),
    mode,
    tilesetMode,
    defaultTilesetMode,
    toggleDisplayMode: () =>
      core?.tilemap.setTilemapMode(
        mode === TilemapDisplayMode.Tiles ? TilemapDisplayMode.Pixels : TilemapDisplayMode.Tiles,
      ),
    setTilesetMode: (value: TilesetMode) => core?.tilemap.setTilesetMode(value),
    saveDefaultTilesetMode: (value: TilesetMode) => {
      try {
        ports?.preferences.setItem(DEFAULT_MODE_KEY, value);
      } catch {
        // The selected mode remains active for this session.
      }
    },
  };
}
