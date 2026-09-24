import {
  useDialogEditorSource,
  type DialogEditorTarget,
} from "$/managers/dialogs/internal-editor-source";
import type { AsepriteUserData } from "$/managers/user-data/user-data-manager";
import { INT16_MAX, INT16_MIN, isBackgroundLayer, UINT8_MAX } from "@xprite/editor-core";

export const CEL_OPACITY_MAX = UINT8_MAX;
export const CEL_Z_INDEX_MIN = INT16_MIN;
export const CEL_Z_INDEX_MAX = INT16_MAX;

export interface CelPropertiesTarget extends DialogEditorTarget {
  layerIds: readonly string[];
  frames: readonly number[];
}

export interface CelPropertiesEditView {
  opacity?: number;
  zIndex?: number;
  userData?: AsepriteUserData | null;
}

interface CelPropertiesView {
  target: CelPropertiesTarget | null;
  targetKey: string;
  opacity: number;
  zIndex: number;
  opacityEnabled: boolean;
  hasSelectedCels: boolean;
  hasSingleCel: boolean;
  userData?: AsepriteUserData;
}

export function useCelPropertiesManager() {
  const source = useDialogEditorSource();
  const timeline = source.document?.timeline;
  const activeFrame = timeline?.activeFrame ?? 0;
  const activeLayer = timeline?.activeLayer ?? 0;
  const range =
    timeline?.range ??
    (timeline ? { kind: "cels" as const, frames: [activeFrame], layers: [activeLayer] } : null);
  const selectedLayers =
    range && timeline
      ? range.frames.flatMap((frame) =>
          range.layers.flatMap((layerIndex) =>
            timeline.frames[frame]?.cels[layerIndex] ? [layerIndex] : [],
          ),
        )
      : [];
  const opacityEnabled = selectedLayers.some(
    (layerIndex) => timeline && !isBackgroundLayer(timeline.layers[layerIndex]),
  );
  const activeCel = timeline?.frames[activeFrame]?.cels[activeLayer];
  const selectedCels =
    range && timeline
      ? range.frames.flatMap((frame) =>
          range.layers.flatMap((layerIndex) =>
            timeline.frames[frame]?.cels[layerIndex]
              ? [{ frame, layerIndex, cel: timeline.frames[frame]!.cels[layerIndex]! }]
              : [],
          ),
        )
      : [];
  const propertyCel =
    selectedCels.length === 1
      ? selectedCels[0].cel
      : timeline?.frames[activeFrame]?.cels[activeLayer];
  const celUserData =
    propertyCel?.userData === null
      ? undefined
      : (propertyCel?.userData ?? propertyCel?.source?.userData);
  const target: CelPropertiesTarget | null =
    source.target && range && timeline
      ? {
          ...source.target,
          layerIds: range.layers.flatMap((layerIndex) => {
            const layer = timeline.layers[layerIndex];
            return layer ? [layer.id] : [];
          }),
          frames: [...range.frames],
        }
      : null;
  const view: CelPropertiesView = {
    target,
    targetKey: JSON.stringify([
      source.documentKey,
      activeFrame,
      timeline?.layers[activeLayer]?.id,
      range?.frames,
      range?.layers,
    ]),
    opacity: activeCel?.opacity ?? 0,
    zIndex: activeCel?.zIndex ?? 0,
    opacityEnabled,
    hasSelectedCels: selectedLayers.length > 0,
    hasSingleCel: selectedCels.length === 1,
    userData: celUserData,
  };
  return {
    view,
    setCelProperties(target: CelPropertiesTarget, properties: CelPropertiesEditView): boolean {
      const core = source.core;
      if (!core || !source.isCurrentTarget(target)) return false;
      const currentTimeline = core.getSnapshot().document?.timeline;
      if (!currentTimeline) return false;
      const layers = target.layerIds
        .map((id) => currentTimeline.layers.findIndex((layer) => layer.id === id))
        .filter((index) => index >= 0);
      core.timeline.setCelProperties(properties, {
        kind: "cels",
        layers,
        frames: target.frames.filter((frame) => frame < currentTimeline.frames.length),
      });
      return true;
    },
  };
}
