import { AsepriteTagDirection } from "$/import-export/aseprite/model";
import { AsepriteAnimationPlayback, AsepritePlaybackMode } from "$/timeline/playback";
import { MAX_TIMELINE_FRAMES, type TimelinePlaybackRange } from "$/timeline/timeline";
import type {
  OnionSkinSettings,
  PlaybackSettings,
  SpriteTimeline,
  TimelineRange,
} from "$/timeline/types";
export type { OnionSkinSettings, PlaybackSettings } from "$/timeline/types";
import { UINT8_MAX } from "$/base/numeric-constants";
import { assertAnimationLoopCount } from "$/timeline/animation-loop";
import { layerSubtree } from "$/timeline/layer-operations";
import { timelineTags, validTimelineRange } from "$/timeline/tags";

export const defaultOnionSkinSettings: Readonly<OnionSkinSettings> = {
  active: false,
  previousFrames: 1,
  nextFrames: 1,
  opacityBase: 68,
  opacityStep: 28,
  type: "merge",
  loopTag: true,
  currentLayer: false,
  position: "behind",
};
export const defaultPlaybackSettings: Readonly<PlaybackSettings> = {
  speed: 1,
  playOnce: false,
  playAll: false,
  playSubtags: true,
  rewindOnStop: false,
};
export const asepritePlaybackSpeeds = [0.25, 0.5, 1, 1.5, 2, 3] as const;
const integer = (value: number, min: number, max: number) =>
  Number.isFinite(value) ? Math.max(min, Math.min(max, Math.round(value))) : min;
export function normalizeOnionSkin(settings: Partial<OnionSkinSettings>): OnionSkinSettings {
  const s = { ...defaultOnionSkinSettings, ...settings };
  return {
    ...s,
    previousFrames: integer(s.previousFrames, 0, MAX_TIMELINE_FRAMES),
    nextFrames: integer(s.nextFrames, 0, MAX_TIMELINE_FRAMES),
    opacityBase: integer(s.opacityBase, 0, UINT8_MAX),
    opacityStep: integer(s.opacityStep, 0, UINT8_MAX),
  };
}
export function normalizePlayback(settings: Partial<PlaybackSettings>): PlaybackSettings {
  const s = { ...defaultPlaybackSettings, ...settings };
  return { ...s, speed: Number.isFinite(s.speed) && s.speed > 0 ? Math.min(64, s.speed) : 1 };
}
export function animationPlaybackRange(
  t: SpriteTimeline,
  settings: PlaybackSettings,
  frame = t.activeFrame,
): TimelinePlaybackRange {
  const tags = timelineTags(t)
    .filter((tag) => tag.from <= frame && tag.to >= frame)
    .sort((a, b) => a.to - a.from - (b.to - b.from));
  const tag = settings.playAll
    ? undefined
    : (tags[0] ?? timelineTags(t).find((candidate) => candidate.name === "Loop"));
  return {
    from: tag?.from ?? 0,
    to: tag?.to ?? t.frames.length - 1,
    direction: tag?.direction ?? AsepriteTagDirection.Forward,
    repeat: settings.playOnce ? 1 : (tag?.repeat ?? t.loopCount ?? 0),
  };
}
/** Onion-skin frame traversal follows the MIT-licensed render library: it
 * visits furthest previous to furthest next.
 * It skips the active frame even when tag wrapping visits it again. */
export function onionSkinFrames(
  t: SpriteTimeline,
  settings: OnionSkinSettings,
  frame = t.activeFrame,
) {
  const s = normalizeOnionSkin(settings),
    tag = s.loopTag
      ? timelineTags(t)
          .filter((tag) => tag.from <= frame && tag.to >= frame)
          .sort((a, b) => a.to - a.from - (b.to - b.from))[0]
      : undefined;
  const result: { frame: number; offset: number; opacity: number }[] = [];
  const previous = tag ? s.previousFrames : Math.min(frame, s.previousFrames);
  const playback = new AsepriteAnimationPlayback(
    t.frames.length - 1,
    [],
    frame,
    tag ? AsepritePlaybackMode.Loop : AsepritePlaybackMode.All,
    tag,
  );
  playback.next(-previous);
  for (let offset = -previous; offset <= s.nextFrames; offset++, playback.next()) {
    const at = playback.frame,
      opacity = Math.max(0, s.opacityBase - s.opacityStep * (Math.abs(offset) - 1));
    if (
      at !== frame &&
      at >= 0 &&
      at < t.frames.length &&
      opacity > 0 &&
      playback.mode !== AsepritePlaybackMode.Stopped
    )
      result.push({ frame: at, offset, opacity });
  }
  return result;
}
/** LibreSprite's GPLv2 cmd_reverse_frames uses contiguous endpoints, leaves tags anchored,
 * reverses durations only for whole-frame ranges, and retains linked pixels. */
export function reverseAnimationFrames(
  t: SpriteTimeline,
  range: TimelineRange | undefined = t.range,
): SpriteTimeline {
  if (!range || !validTimelineRange(t, range)) return t;
  const from = range.kind === "layers" ? 0 : Math.min(...range.frames),
    to = range.kind === "layers" ? t.frames.length - 1 : Math.max(...range.frames);
  if (from >= to) return t;
  if (range.kind === "frames") {
    const frames = [...t.frames];
    frames.splice(from, to - from + 1, ...frames.slice(from, to + 1).reverse());
    return { ...t, frames };
  }
  const layers = new Set(range.layers.flatMap((index) => layerSubtree(t, index)));
  const frames = t.frames.map((frame, index) =>
    index < from || index > to
      ? frame
      : {
          ...frame,
          cels: frame.cels.map((cel, layer) =>
            layers.has(layer) ? t.frames[from + to - index].cels[layer] : cel,
          ),
        },
  );
  return { ...t, frames };
}
/** Independent playback clock: never mutates document active frame or history. */
export function createAnimationPlayback(
  t: SpriteTimeline,
  settings: PlaybackSettings,
  frame = t.activeFrame,
) {
  let tag = settings.playAll
    ? undefined
    : (timelineTags(t)
        .filter((tag) => tag.from <= frame && tag.to >= frame)
        .sort((a, b) => a.to - a.from - (b.to - b.from))[0] ??
      timelineTags(t).find((candidate) => candidate.name === "Loop"));
  if (settings.playSubtags && tag && tag.repeat !== 0) tag = undefined;
  return new AsepriteAnimationPlayback(
    t.frames.length - 1,
    settings.playSubtags ? timelineTags(t) : [],
    frame,
    settings.playOnce
      ? AsepritePlaybackMode.Once
      : settings.playAll
        ? AsepritePlaybackMode.WithoutTags
        : AsepritePlaybackMode.Loop,
    tag,
  );
}
export class AnimationPreviewPlayer {
  frame = 0;
  playing = false;
  private elapsed = 0;
  private start = 0;
  private clock: AsepriteAnimationPlayback | undefined;
  private remainingPlays = 0;
  play(t: SpriteTimeline, settings: PlaybackSettings, frame = t.activeFrame) {
    this.start = frame;
    this.elapsed = 0;
    // File loop metadata governs whole-sprite playback. Authored tag previews
    // retain their existing repetition/direction rules; Play All ignores tags.
    const wholeSprite = settings.playAll || timelineTags(t).length === 0;
    this.remainingPlays =
      !settings.playOnce && wholeSprite && t.loopCount !== undefined
        ? assertAnimationLoopCount(t.loopCount)
        : 0;
    this.clock = createAnimationPlayback(t, settings, this.remainingPlays > 0 ? 0 : frame);
    this.frame = this.clock.frame;
    this.playing = t.frames.length > 1;
  }
  stop(settings: PlaybackSettings) {
    this.playing = false;
    this.clock?.stop();
    this.frame = this.clock?.frame ?? this.frame;
    if (settings.rewindOnStop) this.frame = this.start;
  }
  sync(frame: number) {
    if (!this.playing) this.frame = frame;
  }
  advance(t: SpriteTimeline, delta: number, settings: PlaybackSettings) {
    if (!this.playing || !this.clock || !Number.isFinite(delta) || delta < 0) return false;
    const before = this.frame;
    this.elapsed += delta * normalizePlayback(settings).speed;
    for (let steps = 0; this.playing && steps < 100000; steps++) {
      const duration = t.frames[this.frame]?.duration;
      if (!duration || duration < 0) {
        this.stop(settings);
        break;
      }
      if (this.elapsed < duration) break;
      this.elapsed -= duration;
      if (this.remainingPlays > 0 && this.frame === t.frames.length - 1) {
        this.remainingPlays--;
        if (this.remainingPlays === 0) {
          const last = this.frame;
          this.stop(settings);
          this.frame = settings.rewindOnStop ? this.start : last;
          break;
        }
      }
      this.frame = this.clock.next();
      if (this.clock.mode === AsepritePlaybackMode.Stopped) this.stop(settings);
    }
    return before !== this.frame;
  }
}
