import { UINT16_MAX, UINT8_MAX } from "$/base";
import { mulUn8 } from "$/canvas";
import type {
  PsdAnimationSequence,
  PsdDocument,
  PsdLayer,
  PsdLayerFrameState,
  PsdTimelineKey,
} from "$/import-export/psd/model";
import { PsdCodecError, PsdIssueCode } from "$/import-export/psd/signature";

const DEFAULT_PSD_FRAME_DURATION_MS = 100;
const MIN_PSD_FRAME_DURATION_MS = 1;
const MAX_PSD_FRAME_DURATION_MS = UINT16_MAX;
const MS_PER_SECOND = 1000;
const MAX_VIDEO_TIMELINE_SAMPLED_FRAMES = 240;

interface ResolvedFrame {
  readonly id: number;
  readonly durationMs: number;
  readonly timeSeconds?: number;
}

export interface ResolvedAnimation {
  readonly kind: "static" | "frame-animation" | "video-timeline";
  readonly frames: readonly ResolvedFrame[];
  readonly activeFrameIndex: number;
  readonly currentTimeSeconds?: number;
  readonly loopCount?: number;
}

export interface ResolvedLayerState {
  readonly enabled: boolean;
  readonly offsetX: number;
  readonly offsetY: number;
  readonly opacity: number;
}

function clampByte(value: number): number {
  if (!Number.isFinite(value) || value <= 0) return 0;
  if (value >= UINT8_MAX) return UINT8_MAX;
  return Math.round(value);
}

function normalizeFrameDurationMs(delaySeconds: number): number {
  if (!Number.isFinite(delaySeconds) || delaySeconds <= 0) return DEFAULT_PSD_FRAME_DURATION_MS;
  const ms = Math.round(delaySeconds * MS_PER_SECOND);
  if (ms < MIN_PSD_FRAME_DURATION_MS) return DEFAULT_PSD_FRAME_DURATION_MS;
  if (ms > MAX_PSD_FRAME_DURATION_MS) return MAX_PSD_FRAME_DURATION_MS;
  return ms;
}

function activeAnimationSequence(document: PsdDocument): PsdAnimationSequence | null {
  const animations = document.animations;
  if (!animations || animations.sequences.length === 0) return null;
  if (animations.activeAnimation !== undefined) {
    const matched = animations.sequences.find((seq) => seq.id === animations.activeAnimation);
    if (matched && matched.frameIds.length > 0) return matched;
  }
  return animations.sequences.find((seq) => seq.frameIds.length > 0) ?? null;
}

/** Resolves either Photoshop Frame Animation (`AnDs`) or Video Timeline (`tmln`) into discrete frames. */
export function resolvePsdAnimation(document: PsdDocument, maxFrames: number): ResolvedAnimation {
  const animations = document.animations;
  const sequence = activeAnimationSequence(document);
  if (animations && sequence && sequence.frameIds.length > 1) {
    if (sequence.frameIds.length > maxFrames) {
      throw new PsdCodecError(
        `PSD contains ${sequence.frameIds.length} frames, exceeding the ${maxFrames} frame limit.`,
        PsdIssueCode.ResourceLimit,
      );
    }
    const byId = new Map(animations.frames.map((frame) => [frame.id, frame]));
    const frames: ResolvedFrame[] = sequence.frameIds.map((id) => ({
      id,
      durationMs: normalizeFrameDurationMs(byId.get(id)?.delaySeconds ?? 0),
    }));
    const activeFrameIndex =
      sequence.activeFrame !== undefined &&
      sequence.activeFrame >= 0 &&
      sequence.activeFrame < frames.length
        ? sequence.activeFrame
        : 0;
    return {
      kind: "frame-animation",
      frames,
      activeFrameIndex,
      ...(sequence.repeats !== undefined && sequence.repeats >= 0
        ? { loopCount: sequence.repeats }
        : {}),
    };
  }

  const video = document.videoTimeline;
  if (video && video.enabled && video.frameRate > 0 && video.durationSeconds > 0) {
    const startSec = Math.max(0, video.workInSeconds);
    const endSec = Math.max(
      startSec,
      video.workOutSeconds > 0 ? video.workOutSeconds : video.durationSeconds,
    );
    const spanSec = endSec - startSec;
    const rawCount = Math.max(1, Math.round(spanSec * video.frameRate));
    if (rawCount > 1) {
      const cap = Math.min(maxFrames, MAX_VIDEO_TIMELINE_SAMPLED_FRAMES);
      const count = Math.min(rawCount, cap);
      const stepSec = spanSec / count;
      const durationMs = normalizeFrameDurationMs(stepSec);
      const frames: ResolvedFrame[] = [];
      for (let i = 0; i < count; i++) {
        frames.push({ id: i, durationMs, timeSeconds: startSec + i * stepSec });
      }
      const activeFrameIndex = Math.max(
        0,
        Math.min(
          count - 1,
          Math.round((video.currentTimeSeconds - startSec) / Math.max(1e-6, stepSec)),
        ),
      );
      return {
        kind: "video-timeline",
        frames,
        activeFrameIndex,
        currentTimeSeconds: video.currentTimeSeconds,
        ...(video.repeats !== undefined && video.repeats >= 0 ? { loopCount: video.repeats } : {}),
      };
    }
  }

  return {
    kind: "static",
    frames: [{ id: sequence?.frameIds[0] ?? 0, durationMs: DEFAULT_PSD_FRAME_DURATION_MS }],
    activeFrameIndex: 0,
  };
}

function sampleKeyScalar(
  keys: readonly PsdTimelineKey[] | undefined,
  timeSeconds: number,
  pick: (key: PsdTimelineKey) => number | undefined,
  fallback: number,
): number {
  if (!keys?.length) return fallback;
  const sorted = [...keys].sort((a, b) => a.timeSeconds - b.timeSeconds);
  const firstVal = pick(sorted[0]);
  if (timeSeconds <= sorted[0].timeSeconds) return firstVal ?? fallback;
  const last = sorted[sorted.length - 1];
  if (timeSeconds >= last.timeSeconds) return pick(last) ?? fallback;
  for (let i = 0; i < sorted.length - 1; i++) {
    const a = sorted[i];
    const b = sorted[i + 1];
    if (timeSeconds >= a.timeSeconds && timeSeconds <= b.timeSeconds) {
      const va = pick(a) ?? fallback;
      const vb = pick(b) ?? va;
      if (a.interpolation === "hold") return va;
      const span = b.timeSeconds - a.timeSeconds;
      const t = span <= 1e-6 ? 0 : (timeSeconds - a.timeSeconds) / span;
      return va + (vb - va) * t;
    }
  }
  return fallback;
}

/** Resolves per-frame visibility, offset, and opacity for a layer across static, frame-anim, or video-timeline PSDs. */
export function resolveLayerFrameStates(
  layer: PsdLayer,
  animation: ResolvedAnimation,
  hasEffects: boolean,
): readonly ResolvedLayerState[] {
  const effectiveFill = hasEffects ? UINT8_MAX : clampByte(layer.fillOpacity);
  const baseOpacity = mulUn8(clampByte(layer.opacity), effectiveFill);
  const baseEnabled = !layer.hidden;

  if (animation.kind === "video-timeline") {
    const tl = layer.videoTimeline;
    const currentSec = animation.currentTimeSeconds ?? 0;
    const basePosX = sampleKeyScalar(tl?.positionKeys, currentSec, (k) => k.x, 0);
    const basePosY = sampleKeyScalar(tl?.positionKeys, currentSec, (k) => k.y, 0);
    return animation.frames.map((frame) => {
      const t = frame.timeSeconds ?? 0;
      const inRange =
        !tl ||
        (t + 1e-4 >= tl.inSeconds && (tl.outSeconds <= tl.inSeconds || t < tl.outSeconds - 1e-4));
      const keyOpacity = tl?.opacityKeys?.length
        ? clampByte(sampleKeyScalar(tl.opacityKeys, t, (k) => k.opacity, layer.opacity))
        : clampByte(layer.opacity);
      const posX = sampleKeyScalar(tl?.positionKeys, t, (k) => k.x, basePosX);
      const posY = sampleKeyScalar(tl?.positionKeys, t, (k) => k.y, basePosY);
      return {
        enabled: baseEnabled && inRange,
        offsetX: Math.round(posX - basePosX),
        offsetY: Math.round(posY - basePosY),
        opacity: mulUn8(keyOpacity, effectiveFill),
      };
    });
  }

  if (animation.frames.length <= 1 || !layer.animationFrames?.length) {
    return animation.frames.map(() => ({
      enabled: baseEnabled,
      offsetX: 0,
      offsetY: 0,
      opacity: baseOpacity,
    }));
  }

  // Photoshop `mlst` entries carry visibility, offset, and opacity forward when omitted.
  const stateByFrameId = new Map<number, ResolvedLayerState>();
  let currentEnabled = baseEnabled;
  let currentOffsetX = 0;
  let currentOffsetY = 0;
  let currentOpacity = clampByte(layer.opacity);
  let currentFillOpacity = effectiveFill;

  for (const entry of layer.animationFrames as readonly PsdLayerFrameState[]) {
    if (entry.enabled !== undefined) currentEnabled = entry.enabled;
    if (entry.offsetX !== undefined) currentOffsetX = Math.round(entry.offsetX);
    if (entry.offsetY !== undefined) currentOffsetY = Math.round(entry.offsetY);
    if (entry.opacity !== undefined) currentOpacity = clampByte(entry.opacity);
    if (!hasEffects && entry.fillOpacity !== undefined)
      currentFillOpacity = clampByte(entry.fillOpacity);
    const snapshot: ResolvedLayerState = {
      enabled: currentEnabled,
      offsetX: currentOffsetX,
      offsetY: currentOffsetY,
      opacity: mulUn8(currentOpacity, currentFillOpacity),
    };
    for (const frameId of entry.frameIds) stateByFrameId.set(frameId, snapshot);
  }

  const activeFrameId = animation.frames[animation.activeFrameIndex]?.id;
  const activeState = activeFrameId !== undefined ? stateByFrameId.get(activeFrameId) : undefined;
  const activeOffsetX = activeState?.offsetX ?? 0;
  const activeOffsetY = activeState?.offsetY ?? 0;

  return animation.frames.map((frame) => {
    const matched = stateByFrameId.get(frame.id);
    if (!matched) {
      return {
        enabled: baseEnabled,
        offsetX: 0,
        offsetY: 0,
        opacity: baseOpacity,
      };
    }
    return {
      enabled: matched.enabled,
      offsetX: matched.offsetX - activeOffsetX,
      offsetY: matched.offsetY - activeOffsetY,
      opacity: matched.opacity,
    };
  });
}
