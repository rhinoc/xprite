import { MAX_IMAGE_PIXELS } from "$/base/image-limits";
import { UINT16_MAX } from "$/base/numeric-constants";
import type { PixelBuffer, Rgba } from "$/base/primitives";
import { workingColorProfile, colorProfileToSrgb } from "$/color/icc-profile";
import type { EditorDocument } from "$/document/types";
import { AsepriteTagDirection } from "$/import-export/aseprite/model";
import {
  renderExport,
  exportGeometry,
  type ExportFileOptions,
} from "$/import-export/image/export-plan";
import { timelineTags } from "$/timeline/operations/timeline-range";
import { AsepriteAnimationPlayback, AsepritePlaybackMode } from "$/timeline/playback";

export interface ExportAnimationFrame {
  pixels: PixelBuffer;
  duration: number;
  sourceFrame: number;
  palette?: readonly Rgba[];
}
export function exportFrameOrder(doc: EditorDocument, options: ExportFileOptions): number[] {
  exportGeometry(doc, options);
  const t = doc.timeline,
    count = t?.frames.length ?? 1;
  const tags = t ? timelineTags(t) : [];
  let frames =
    options.frames === "all"
      ? Array.from({ length: count }, (_, i) => i)
      : options.frames === "selected"
        ? [...(t?.range?.frames ?? [options.frame])].sort((a, b) => a - b)
        : [options.frame];
  if (options.frames?.startsWith("tag:")) {
    const tag = tags.find((tag) => tag.name === options.frames!.slice(4));
    if (!tag) throw new Error("The selected animation tag no longer exists.");
    frames = Array.from({ length: tag.to - tag.from + 1 }, (_, i) => tag.from + i);
  }
  if (frames.some((i) => !Number.isInteger(i) || i < 0 || i >= count))
    throw new RangeError("Invalid export frames.");
  const directed = (
    list: number[],
    direction = options.direction ?? AsepriteTagDirection.Forward,
  ) => {
    const base =
      direction === AsepriteTagDirection.Reverse ||
      direction === AsepriteTagDirection.PingPongReverse
        ? [...list].reverse()
        : list;
    return direction.startsWith(AsepriteTagDirection.PingPong) && base.length > 1
      ? [...base, ...base.slice(1, -1).reverse()]
      : base;
  };
  if (options.playSubtags && options.frames !== "selected" && options.frames !== "current") {
    // calculate_frames_sequence() in app/ui/layer_frame_comboboxes.cpp:
    // PlayAll receives original sprite bounds and an owned tag-direction override.
    const direction = options.direction ?? AsepriteTagDirection.Forward,
      all = options.frames === "all";
    const owned = tags.map((tag) => ({ ...tag }));
    const selected = options.frames?.startsWith("tag:")
      ? owned.find((tag) => tag.name === options.frames!.slice(4))
      : undefined;
    let forward = 1,
      start = 0;
    if (all) {
      forward =
        direction === AsepriteTagDirection.Reverse ||
        direction === AsepriteTagDirection.PingPongReverse
          ? -1
          : 1;
      start = forward < 0 ? count - 1 : 0;
      const inner = owned
        .filter((tag) => tag.from <= start && tag.to >= start)
        .sort((a, b) => a.to - a.from - (b.to - b.from))[0];
      if (inner) {
        const tagForward =
          inner.direction === AsepriteTagDirection.Reverse ||
          inner.direction === AsepriteTagDirection.PingPongReverse
            ? -1
            : 1;
        start = forward * tagForward > 0 ? inner.from : inner.to;
      }
    } else if (selected) {
      selected.direction = direction;
      start =
        direction === AsepriteTagDirection.Reverse ||
        direction === AsepriteTagDirection.PingPongReverse
          ? selected.to
          : selected.from;
    }
    const playback = new AsepriteAnimationPlayback(
      count - 1,
      owned,
      start,
      AsepritePlaybackMode.All,
      selected,
      forward,
    );
    const result = [playback.frame];
    while (playback.mode !== AsepritePlaybackMode.Stopped) {
      playback.next();
      if ((playback.mode as AsepritePlaybackMode) === AsepritePlaybackMode.Stopped) break;
      result.push(playback.frame);
      if (result.length > UINT16_MAX)
        throw new RangeError("Animation repetitions exceed the export limit.");
    }
    if (direction.startsWith(AsepriteTagDirection.PingPong)) {
      if (all) return result.length > 1 ? [...result, ...result.slice(1, -1).reverse()] : result;
      if (selected) result.pop();
    }
    return result;
  }
  return directed(frames);
}
export function renderExportAnimation(
  doc: EditorDocument,
  options: ExportFileOptions,
): ExportAnimationFrame[] {
  const order = exportFrameOrder(doc, options),
    geometry = exportGeometry(doc, options);
  if (geometry.width * geometry.height * order.length > MAX_IMAGE_PIXELS)
    throw new RangeError("Animation export exceeds the pixel budget.");
  const cached = new Map<number, PixelBuffer>();
  const frames: ExportAnimationFrame[] = [];
  for (const frame of order) {
    let pixels = cached.get(frame);
    if (!pixels) {
      pixels = renderExport(doc, { ...options, frame });
      cached.set(frame, pixels);
    }
    if (options.ignoreEmpty && !pixels.data.some((v, i) => i % 4 === 3 && v !== 0)) continue;
    frames.push({
      pixels,
      duration: doc.timeline?.frames[frame].duration ?? 100,
      sourceFrame: frame,
      palette: (doc.timeline?.frames[frame].palette ?? doc.palette)?.map((color) =>
        colorProfileToSrgb(color, workingColorProfile(doc.timeline)),
      ),
    });
  }
  if (!frames.length) throw new Error("There are no nonempty frames to export.");
  return frames;
}
/** Aseprite sequence numbering preserves existing numeric suffix width. */
export function sequenceFilename(name: string, index: number, count: number): string {
  if (count <= 1) return name;
  const match = /^(.*?)(\d+)?(\.[^.]+)$/.exec(name);
  if (!match) throw new Error("Missing sequence filename extension.");
  const start = match[2] ? Number(match[2]) : 1;
  const digits = match[2]?.length ?? String(count).length;
  return `${match[1]}${String(start + index).padStart(digits, "0")}${match[3]}`;
}
