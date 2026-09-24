import { MAX_IMAGE_PIXELS } from "$/base/image-limits";
import { duplicateLayers, layerSubtree } from "$/timeline/layer-operations";
import { validTimelineRange } from "$/timeline/tags";
import { isBackgroundLayer } from "$/timeline/timeline";
import {
  TimelineLayerDropPosition,
  type SpriteTimeline,
  type TimelineRange,
} from "$/timeline/types";

/** Drop positions are visual: sibling rows are shown in reverse storage order. */
export function dropTimelineLayers(
  timeline: SpriteTimeline,
  range: TimelineRange,
  target: number,
  position: TimelineLayerDropPosition,
  copy = false,
): SpriteTimeline {
  if (
    range.kind !== "layers" ||
    !validTimelineRange(timeline, range) ||
    !Number.isInteger(target) ||
    !timeline.layers[target] ||
    !Object.values(TimelineLayerDropPosition).includes(position)
  )
    return timeline;
  const selected = [
    ...new Set(range.layers.flatMap((index) => layerSubtree(timeline, index))),
  ].sort((a, b) => a - b);
  const destination = timeline.layers[target];
  if (
    (!copy && selected.includes(target)) ||
    selected.some((index) => isBackgroundLayer(timeline.layers[index])) ||
    (position === TimelineLayerDropPosition.Inside && destination.kind !== "group") ||
    (position === TimelineLayerDropPosition.Below && isBackgroundLayer(destination))
  )
    return timeline;

  if (!copy) return moveSelection(timeline, selected, target, position, range);

  const retained = new Set(
    timeline.frames.flatMap((frame) => frame.cels.flatMap((cel) => (cel ? [cel.pixels] : []))),
  );
  const copied = new Set(
    timeline.frames.flatMap((frame) =>
      selected.flatMap((index) => (frame.cels[index] ? [frame.cels[index]!.pixels] : [])),
    ),
  );
  if (
    [...retained, ...copied].reduce((sum, pixels) => sum + pixels.data.byteLength, 0) >
    MAX_IMAGE_PIXELS * 4
  )
    return timeline;
  const duplicate = duplicateLayers(timeline, selected);
  if (duplicate === timeline) return timeline;
  const copiedIndices = selected.map((_, index) => duplicate.activeLayer + index);
  const copiedTarget = duplicate.layers.findIndex((layer) => layer.id === destination.id);
  const result = moveSelection(duplicate, copiedIndices, copiedTarget, position, range, true);
  // The temporary duplicates must never be committed if the resulting hierarchy is invalid.
  return result === duplicate ? timeline : result;
}

function moveSelection(
  timeline: SpriteTimeline,
  selected: readonly number[],
  target: number,
  position: TimelineLayerDropPosition,
  range: TimelineRange,
  updateSelection = false,
): SpriteTimeline {
  const destination = timeline.layers[target];
  const selectedIds = new Set(selected.map((index) => timeline.layers[index].id));
  const roots = new Set(
    selected.filter((index) => !selectedIds.has(timeline.layers[index].parentId ?? "")),
  );
  const parentId =
    position === TimelineLayerDropPosition.Inside ? destination.id : (destination.parentId ?? null);
  if (parentId && selectedIds.has(parentId)) return timeline;
  const boundary =
    position === TimelineLayerDropPosition.Below
      ? target
      : Math.max(...layerSubtree(timeline, target)) + 1;
  const rest = timeline.layers
    .map((_, index) => index)
    .filter((index) => !selected.includes(index));
  const insertion = rest.filter((index) => index < boundary).length;
  const order = [...rest];
  order.splice(insertion, 0, ...selected);
  if (
    !updateSelection &&
    order.every((index, at) => index === at) &&
    [...roots].every((index) => (timeline.layers[index].parentId ?? null) === parentId)
  )
    return timeline;
  const layers = order.map((index) =>
    roots.has(index) ? { ...timeline.layers[index], parentId } : timeline.layers[index],
  );
  // Every parent must precede its contiguous subtree, including roots adopted from other groups.
  let parents: string[] = [];
  for (const layer of layers) {
    if (layer.parentId) {
      const depth = parents.indexOf(layer.parentId);
      if (depth < 0) return timeline;
      parents = parents.slice(0, depth + 1);
    } else parents = [];
    if (layer.kind === "group") parents.push(layer.id);
  }
  const selectedResult = selected.map((_, index) => insertion + index);
  return {
    ...timeline,
    layers,
    frames: timeline.frames.map((frame) => ({
      ...frame,
      cels: order.map((index) => frame.cels[index]),
    })),
    activeLayer: insertion,
    range: { ...range, layers: selectedResult },
  };
}
