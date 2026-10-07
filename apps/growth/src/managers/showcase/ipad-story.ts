import { CREATE_TIMING, LAUNCH_TIMING } from "$/managers/ports/ipad-launch-motion";

// Source-film seconds stay shared by the screen captures, hand and editable rig.
export const FILM_START = 3;
export const FILM_DURATION = 32;
export const FILM_SETTLE_DURATION = 0.9;
export const MILLISECONDS_PER_SECOND = 1000;

const STORY_TIME = {
  unlockEnter: 3.75,
  desktop: 5.5,
  pencilEnter: 13,
  writingStart: 16,
  writingEnd: 26,
  playHandExit: 28.25,
} as const;

export const FILM_INTERACTION_START = STORY_TIME.unlockEnter;
export const FILM_OUTRO_START = STORY_TIME.writingEnd;
const SCENE_GAP_SECONDS = 0.08;
const UNLOCK_PLAYBACK_RATE = 2;
const TAP_PLAYBACK_RATE = 1.5;
const CREATE_PLAYBACK_RATE = 1.6;
const PENCIL_ARRIVAL_SECONDS = 0.9;
const WRITING_PLAYBACK_RATE = 2.5;
const NATURAL_PLAYBACK_RATE = 1;

// Compress holds, entrances and writing on the shared clock; animation playback stays native.
const FILM_PACING = [
  { end: STORY_TIME.desktop, rate: UNLOCK_PLAYBACK_RATE },
  {
    end: LAUNCH_TIMING.enter,
    rate: (LAUNCH_TIMING.enter - STORY_TIME.desktop) / SCENE_GAP_SECONDS,
  },
  { end: LAUNCH_TIMING.opened, rate: TAP_PLAYBACK_RATE },
  {
    end: CREATE_TIMING.enter,
    rate: (CREATE_TIMING.enter - LAUNCH_TIMING.opened) / SCENE_GAP_SECONDS,
  },
  { end: CREATE_TIMING.exit, rate: CREATE_PLAYBACK_RATE },
  {
    end: STORY_TIME.pencilEnter,
    rate: (STORY_TIME.pencilEnter - CREATE_TIMING.exit) / SCENE_GAP_SECONDS,
  },
  {
    end: STORY_TIME.writingStart,
    rate: (STORY_TIME.writingStart - STORY_TIME.pencilEnter) / PENCIL_ARRIVAL_SECONDS,
  },
  { end: STORY_TIME.writingEnd, rate: WRITING_PLAYBACK_RATE },
  { end: STORY_TIME.playHandExit, rate: TAP_PLAYBACK_RATE },
  { end: FILM_DURATION, rate: NATURAL_PLAYBACK_RATE },
] as const;

export function advanceFilmTime(time: number, elapsedSeconds: number): number {
  let next = time;
  let remaining = elapsedSeconds;
  for (const segment of FILM_PACING) {
    if (next >= segment.end) continue;
    const duration = (segment.end - next) / segment.rate;
    if (remaining <= duration) return next + remaining * segment.rate;
    remaining -= duration;
    next = segment.end;
  }
  return next + remaining;
}
