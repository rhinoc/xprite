import type { AsepriteTag } from "$/import-export/aseprite/model";
import type { SpriteTimeline, TimelineRange } from "$/timeline/types";

export const timelineTags = (timeline: SpriteTimeline): readonly AsepriteTag[] =>
  timeline.tags ?? timeline.asepriteSource?.tags ?? [];

/** Tags::innerTag(): choose the shortest tag containing the frame. */
export function timelineTagIndexAtFrame(
  timeline: SpriteTimeline,
  frame: number,
): number | undefined {
  let found: number | undefined;
  const tags = timelineTags(timeline);
  for (let index = 0; index < tags.length; index += 1) {
    const tag = tags[index];
    if (frame < tag.from || frame > tag.to) continue;
    if (found === undefined || tag.to - tag.from < tags[found].to - tags[found].from) found = index;
  }
  return found;
}

export function withTimelineTags(
  timeline: SpriteTimeline,
  tags: readonly AsepriteTag[],
): SpriteTimeline {
  return {
    ...timeline,
    tags,
    ...(timeline.asepriteSource
      ? { asepriteSource: { ...timeline.asepriteSource, tags: [...tags] } }
      : {}),
  };
}

export function validTimelineRange(timeline: SpriteTimeline, range: TimelineRange): boolean {
  return (
    ["frames", "layers", "cels"].includes(range.kind) &&
    new Set(range.frames).size === range.frames.length &&
    new Set(range.layers).size === range.layers.length &&
    range.frames.length > 0 &&
    range.layers.length > 0 &&
    range.frames.every(
      (index) => Number.isInteger(index) && index >= 0 && index < timeline.frames.length,
    ) &&
    range.layers.every(
      (index) => Number.isInteger(index) && index >= 0 && index < timeline.layers.length,
    )
  );
}
