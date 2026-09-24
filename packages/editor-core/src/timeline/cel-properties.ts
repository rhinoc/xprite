import { UINT8_MAX, INT16_MAX, INT16_MIN } from "$/base/numeric-constants";
import type { AsepriteUserData } from "$/import-export/aseprite/model";
import type { TimelineRange } from "$/timeline/operations/timeline-range";
import { isBackgroundLayer, type SpriteTimeline } from "$/timeline/timeline";

export interface CelProperties {
  opacity?: number;
  zIndex?: number;
  userData?: AsepriteUserData | null;
}
/** Aseprite Cel Properties: opacity belongs to linked CelData, z-index to each cel. */
export function setTimelineCelProperties(
  t: SpriteTimeline,
  properties: CelProperties,
  range?: TimelineRange,
): SpriteTimeline {
  const frames = new Set(range?.frames ?? [t.activeFrame]),
    layers = new Set(range?.layers ?? [t.activeLayer]);
  const opacity =
    properties.opacity !== undefined && Number.isFinite(properties.opacity)
      ? Math.max(0, Math.min(UINT8_MAX, Math.round(properties.opacity)))
      : undefined;
  const zIndex =
    properties.zIndex !== undefined && Number.isFinite(properties.zIndex)
      ? Math.max(INT16_MIN, Math.min(INT16_MAX, Math.trunc(properties.zIndex)))
      : undefined;
  const userDataChanged = Object.prototype.hasOwnProperty.call(properties, "userData");
  const linked = new Map<number, Set<object>>();
  if (opacity !== undefined)
    for (const f of frames)
      for (const l of layers) {
        const cel = t.frames[f]?.cels[l];
        if (cel && t.layers[l] && !isBackgroundLayer(t.layers[l])) {
          const set = linked.get(l) ?? new Set();
          set.add(cel.pixels);
          linked.set(l, set);
        }
      }
  let changed = false;
  const next = t.frames.map((frame, f) => {
    let changedFrame = false;
    const cels = frame.cels.map((cel, l) => {
      if (!cel) return cel;
      const nextOpacity = linked.get(l)?.has(cel.pixels) ? opacity! : cel.opacity;
      const nextZ = frames.has(f) && layers.has(l) && zIndex !== undefined ? zIndex : cel.zIndex;
      const sourceUserData =
        cel.userData === null ? undefined : (cel.userData ?? cel.source?.userData);
      const userDataMatches =
        !userDataChanged ||
        JSON.stringify(properties.userData ?? null) === JSON.stringify(sourceUserData ?? null);
      if (nextOpacity === cel.opacity && nextZ === cel.zIndex && userDataMatches) return cel;
      changed = changedFrame = true;
      return {
        ...cel,
        opacity: nextOpacity,
        zIndex: nextZ,
        ...(userDataChanged ? { userData: properties.userData } : {}),
      };
    });
    return changedFrame ? { ...frame, cels } : frame;
  });
  return changed ? { ...t, frames: next } : t;
}
