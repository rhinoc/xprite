import { useState } from "react";

import {
  AnimationPreviewPlayer,
  renderAnimationPreview,
  type PlaybackSettings,
  type SpriteTimeline,
} from "@xprite/editor-core";

/** Playback commands exposed to the animation preview view. */
function createAnimationPreviewController() {
  const player = new AnimationPreviewPlayer();
  return {
    get frame() {
      return player.frame;
    },
    get playing() {
      return player.playing;
    },
    sync: (frame: number) => player.sync(frame),
    stop: (settings: PlaybackSettings) => player.stop(settings),
    play: (timeline: SpriteTimeline, settings: PlaybackSettings, frame?: number) =>
      player.play(timeline, settings, frame),
    advance: (timeline: SpriteTimeline, elapsed: number, settings: PlaybackSettings) =>
      player.advance(timeline, elapsed, settings),
  };
}

export function useAnimationPreviewManager() {
  const [controller] = useState(createAnimationPreviewController);
  return controller;
}

/** Render the selected timeline frame for the preview surface. */
export function renderTimelinePreview(...args: Parameters<typeof renderAnimationPreview>) {
  return renderAnimationPreview(...args);
}
