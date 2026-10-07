import {
  ReplayInteractionKind,
  type RecordedReplayPointer,
  type ReplayInteraction,
} from "$/managers/replay/replay-recording";
import { EditorPointerPhase, replayPointerAt } from "@xprite/editor-core";

const KEYS_VISIBLE_MS = 1500;
/** Interpolation changes position only; cursor appearance remains the recorded one. */
export function recordedPointerAt(samples: readonly RecordedReplayPointer[], position: number) {
  let low = 0,
    high = samples.length;
  while (low < high) {
    const middle = (low + high) >>> 1;
    if (samples[middle].at <= position) low = middle + 1;
    else high = middle;
  }
  const before = samples[low - 1];
  if (
    !before?.point ||
    !before.cursor ||
    before.phase === EditorPointerPhase.Leave ||
    before.phase === EditorPointerPhase.Cancel
  )
    return null;
  // A real cursor remains visible while idle. Recorded hide/leave controls visibility.
  const pointer = replayPointerAt(samples, position) ?? before;
  return pointer.point ? { point: pointer.point, cursor: before.cursor } : null;
}

export function recordedKeysAt(events: readonly ReplayInteraction[], position: number) {
  let low = 0,
    high = events.length;
  while (low < high) {
    const middle = (low + high) >>> 1;
    if (events[middle].at <= position) low = middle + 1;
    else high = middle;
  }
  for (let index = low - 1; index >= 0; index--) {
    const event = events[index];
    if (position - event.at > KEYS_VISIBLE_MS) return null;
    if (event.kind === ReplayInteractionKind.Shortcut && event.keys) return event.keys;
  }
  return null;
}
