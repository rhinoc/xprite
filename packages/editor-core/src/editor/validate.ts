import { UINT8_MAX } from "$/base/numeric-constants";
import type { PixelBuffer } from "$/base/primitives";
import type { EditorDocument } from "$/document/types";
import { BatchEditError, BatchEditErrorCode } from "$/editor/batch-edit-types";
import {
  effectiveLayerVisible,
  renderTimelineFrame,
  timelineTags,
  type SpriteTimeline,
} from "$/timeline";

export const VALIDATE_CHECKS = [
  "palette",
  "strays",
  "outline",
  "banding",
  "antialiasing",
  "layers",
  "animation",
  "export_readiness",
] as const;
export type ValidateCheck = (typeof VALIDATE_CHECKS)[number];

export type ValidateSeverity = "error" | "warning" | "note";

export interface ValidateFinding {
  check: string;
  severity: ValidateSeverity;
  message: string;
  layerId?: string;
  frameIndex?: number;
  at?: { x: number; y: number };
  count?: number;
}

export interface ValidateOptions {
  checks?: readonly string[];
  strict?: boolean;
  expect?: {
    /** Per layerId, zero-based [from,to] frame ranges (inclusive) that must hold ink. */
    layerFrames?: Record<string, readonly (readonly [number, number])[]>;
    /** Layer id pairs whose opaque pixels must never intersect on the same frame. */
    mustNotOverlap?: readonly (readonly [string, string])[];
  };
}

export interface ValidateResult {
  passed: boolean;
  score: number;
  findings: ValidateFinding[];
  summary: string;
}

const CHANNELS = 4;
const STRAYS_ERROR_THRESHOLD = 3;
const OUTLINE_OWNER_SHARE = 0.6;
const NEAR_DUPLICATE_DELTA_E = 3;
const NEAR_DUPLICATE_COLOR_LIMIT = 512;
const NEAR_DUPLICATE_REPORT_LIMIT = 8;
const LARGE_PALETTE_NOTE = 64;
const UNIFORM_DURATION_MIN_FRAMES = 4;
const BANDING_MIN_RUN = 8;
const ERROR_SCORE_COST = 15;
const WARNING_SCORE_COST = 5;

const DIRECTIONS = [
  [1, 0],
  [-1, 0],
  [0, 1],
  [0, -1],
] as const;

function opaque(data: Uint8ClampedArray, at: number): boolean {
  return data[at + 3] !== 0;
}

function hex(data: Uint8ClampedArray, at: number): string {
  const a = data[at + 3];
  const channels = a === UINT8_MAX ? [0, 1, 2] : [0, 1, 2, 3];
  return `#${channels.map((index) => data[at + index].toString(16).padStart(2, "0")).join("")}`;
}

/** Cel pixels with the live active-layer draft substituted, as batch-edit does. */
function celSource(
  doc: EditorDocument,
  t: SpriteTimeline,
  layerIndex: number,
  frameIndex: number,
): { pixels: PixelBuffer; x: number; y: number } | null {
  const cel = t.frames[frameIndex]?.cels[layerIndex];
  const active = layerIndex === t.activeLayer && frameIndex === t.activeFrame;
  const pixels = active ? doc.layer.pixels : cel?.pixels;
  if (!pixels) return null;
  const x = active ? doc.layer.x : (cel?.x ?? 0);
  const y = active ? doc.layer.y : (cel?.y ?? 0);
  return { pixels, x, y };
}

function celHasInk(source: { pixels: PixelBuffer } | null): boolean {
  if (!source) return false;
  const data = source.pixels.data;
  for (let at = 3; at < data.length; at += CHANNELS) if (data[at] !== 0) return true;
  return false;
}

/** CIE76 distance in CIELAB; good enough for near-duplicate palette lints. */
function deltaE(a: readonly number[], b: readonly number[]): number {
  const lab = (r: number, g: number, b: number): [number, number, number] => {
    const linear = (value: number) => {
      value /= UINT8_MAX;
      return value > 0.04045 ? Math.pow((value + 0.055) / 1.055, 2.4) : value / 12.92;
    };
    const x = (linear(r) * 0.4124 + linear(g) * 0.3576 + linear(b) * 0.1805) / 0.95047;
    const y = linear(r) * 0.2126 + linear(g) * 0.7152 + linear(b) * 0.0722;
    const z = (linear(r) * 0.0193 + linear(g) * 0.1192 + linear(b) * 0.9505) / 1.08883;
    const f = (value: number) => (value > 0.008856 ? Math.cbrt(value) : 7.787 * value + 16 / 116);
    const fx = f(x),
      fy = f(y),
      fz = f(z);
    return [116 * fy - 16, 500 * (fx - fy), 200 * (fy - fz)];
  };
  const la = lab(a[0], a[1], a[2]),
    lb = lab(b[0], b[1], b[2]);
  return Math.sqrt((la[0] - lb[0]) ** 2 + (la[1] - lb[1]) ** 2 + (la[2] - lb[2]) ** 2);
}

function layerIndexById(t: SpriteTimeline, id: string): number {
  return t.layers.findIndex((layer) => layer.id === id);
}

function wantedChecks(input: ValidateOptions): Set<ValidateCheck> {
  if (input.checks === undefined) return new Set(VALIDATE_CHECKS);
  if (!Array.isArray(input.checks))
    throw new BatchEditError(BatchEditErrorCode.InvalidInput, "Invalid checks");
  return new Set(
    input.checks.map((check) => {
      if (!(VALIDATE_CHECKS as readonly string[]).includes(check))
        throw new BatchEditError(BatchEditErrorCode.InvalidInput, `Unknown check "${check}"`);
      return check as ValidateCheck;
    }),
  );
}

/**
 * Lint a document against pixel-art rules and report located problems.
 * Pure read: no history entry and no content change.
 */
export function validateDocument(
  doc: EditorDocument,
  options: ValidateOptions = {},
): ValidateResult {
  const t = doc.timeline;
  if (!t) throw new BatchEditError(BatchEditErrorCode.Unsupported, "Document has no timeline");
  const wanted = wantedChecks(options);
  const findings: ValidateFinding[] = [];
  const add = (
    check: string,
    severity: ValidateSeverity,
    message: string,
    extra: Omit<ValidateFinding, "check" | "severity" | "message"> = {},
  ) => findings.push({ check, severity, message, ...extra });

  const imageLayers = t.layers
    .map((layer, index) => ({ layer, index }))
    .filter(({ layer }) => !layer.kind || layer.kind === "image");
  const visible = new Set(
    imageLayers.filter(({ index }) => effectiveLayerVisible(t, index)).map(({ index }) => index),
  );
  const hiddenSkipped = imageLayers.length - visible.size;

  if (wanted.has("palette")) {
    const counts = new Map<string, { rgba: number[]; pixels: number }>();
    for (const { index } of imageLayers) {
      if (!visible.has(index)) continue;
      for (let f = 0; f < t.frames.length; f++) {
        const source = celSource(doc, t, index, f);
        if (!source) continue;
        const data = source.pixels.data;
        for (let at = 0; at < data.length; at += CHANNELS) {
          if (data[at + 3] === 0) continue;
          const key = `${data[at]},${data[at + 1]},${data[at + 2]},${data[at + 3]}`;
          const entry = counts.get(key);
          if (entry) entry.pixels++;
          else counts.set(key, { rgba: [data[at], data[at + 1], data[at + 2]], pixels: 1 });
        }
      }
    }
    const palette = t.frames[t.activeFrame].palette ?? doc.palette;
    if (palette) {
      const onPalette = new Set(
        palette.map((rgba) => `${rgba[0]},${rgba[1]},${rgba[2]},${rgba[3]}`),
      );
      const off = [...counts.entries()].filter(([key]) => !onPalette.has(key));
      if (off.length > 0) {
        const worst = off.reduce((a, b) => (b[1].pixels > a[1].pixels ? b : a));
        const [r, g, b, a] = worst[0].split(",").map(Number);
        const worstHex = `#${(a === UINT8_MAX ? [r, g, b] : [r, g, b, a])
          .map((value) => value.toString(16).padStart(2, "0"))
          .join("")}`;
        add(
          "palette",
          "warning",
          `${off.length} colour(s) in the art are not in the palette; the most used is ${worstHex} (${worst[1].pixels}px).`,
          { count: off.length },
        );
      }
      if (palette.length > LARGE_PALETTE_NOTE)
        add(
          "palette",
          "note",
          `${palette.length} palette entries. Most sprites read better under 32 — a large palette usually means ramps that were never merged.`,
          { count: palette.length },
        );
    }
    if (counts.size > 1 && counts.size <= NEAR_DUPLICATE_COLOR_LIMIT) {
      const colors = [...counts.values()];
      const pairs: { a: number[]; b: number[]; distance: number }[] = [];
      for (let i = 0; i < colors.length; i++)
        for (let j = i + 1; j < colors.length; j++) {
          const distance = deltaE(colors[i].rgba, colors[j].rgba);
          if (distance < NEAR_DUPLICATE_DELTA_E)
            pairs.push({ a: colors[i].rgba, b: colors[j].rgba, distance });
        }
      pairs.sort((a, b) => a.distance - b.distance);
      for (const pair of pairs.slice(0, NEAR_DUPLICATE_REPORT_LIMIT)) {
        const toHex = (rgba: number[]) =>
          `#${rgba.map((value) => value.toString(16).padStart(2, "0")).join("")}`;
        add(
          "palette",
          "note",
          `Near-duplicate colours ${toHex(pair.a)} and ${toHex(pair.b)} (deltaE ${pair.distance.toFixed(1)}). Merge them unless the subtle ramp is deliberate.`,
        );
      }
    }
  }

  for (const { layer, index } of imageLayers) {
    if (wanted.has("layers")) {
      let hasInk = false;
      for (let f = 0; f < t.frames.length && !hasInk; f++)
        hasInk = celHasInk(celSource(doc, t, index, f));
      if (!hasInk)
        add("layers", "note", `Layer '${layer.name}' has no ink on any frame.`, {
          layerId: layer.id,
        });
    }

    if (!visible.has(index)) continue;

    for (let f = 0; f < t.frames.length; f++) {
      const source = celSource(doc, t, index, f);
      if (!source) continue;
      const { pixels } = source;
      const data = pixels.data,
        w = pixels.width,
        h = pixels.height;

      if (wanted.has("strays")) {
        let strays = 0;
        let first: { x: number; y: number } | undefined;
        for (let y = 0; y < h; y++)
          for (let x = 0; x < w; x++) {
            if (!opaque(data, (y * w + x) * CHANNELS)) continue;
            let neighbours = 0;
            for (const [dx, dy] of DIRECTIONS) {
              const nx = x + dx,
                ny = y + dy;
              if (nx >= 0 && ny >= 0 && nx < w && ny < h && opaque(data, (ny * w + nx) * CHANNELS))
                neighbours++;
            }
            if (neighbours === 0) {
              strays++;
              if (!first) first = { x: x + source.x, y: y + source.y };
            }
          }
        if (strays > 0)
          add(
            "strays",
            strays > STRAYS_ERROR_THRESHOLD ? "error" : "warning",
            `${strays} isolated pixel(s) with no neighbour on '${layer.name}' frame ${f}. These read as noise at 1x.`,
            { layerId: layer.id, frameIndex: f, at: first, count: strays },
          );
      }

      if (wanted.has("antialiasing")) {
        let semi = 0;
        let first: { x: number; y: number } | undefined;
        for (let p = 0; p < w * h; p++) {
          const a = data[p * CHANNELS + 3];
          if (a > 0 && a < UINT8_MAX) {
            semi++;
            if (!first) first = { x: (p % w) + source.x, y: Math.floor(p / w) + source.y };
          }
        }
        if (semi > 0)
          add(
            "antialiasing",
            "warning",
            `${semi} semi-transparent pixel(s) on '${layer.name}' frame ${f}. Partial alpha usually comes from a soft brush or a resize and reads as blur.`,
            { layerId: layer.id, frameIndex: f, at: first, count: semi },
          );
      }

      if (wanted.has("outline")) {
        const counts = new Map<string, number>();
        const edge: { x: number; y: number; color: string }[] = [];
        for (let y = 0; y < h; y++)
          for (let x = 0; x < w; x++) {
            const at = (y * w + x) * CHANNELS;
            if (!opaque(data, at)) continue;
            let exposed = false;
            for (const [dx, dy] of DIRECTIONS) {
              const nx = x + dx,
                ny = y + dy;
              if (nx < 0 || ny < 0 || nx >= w || ny >= h || !opaque(data, (ny * w + nx) * CHANNELS))
                exposed = true;
            }
            if (exposed) {
              const color = hex(data, at);
              counts.set(color, (counts.get(color) ?? 0) + 1);
              edge.push({ x: x + source.x, y: y + source.y, color });
            }
          }
        if (edge.length > 0) {
          let best = "",
            bestCount = 0;
          for (const [color, count] of counts)
            if (count > bestCount) {
              best = color;
              bestCount = count;
            }
          const share = bestCount / edge.length;
          if (share >= OUTLINE_OWNER_SHARE && share < 1) {
            const first = edge.find((point) => point.color !== best);
            add(
              "outline",
              "warning",
              `Outline is ${Math.round(share * 100)}% '${best}' but ${edge.length - bestCount} edge pixel(s) use a different colour on '${layer.name}' frame ${f}. A broken outline reads as a hole in the silhouette.`,
              { layerId: layer.id, frameIndex: f, at: first, count: edge.length - bestCount },
            );
          } else if (share < OUTLINE_OWNER_SHARE)
            add(
              "outline",
              "note",
              `No single colour owns the silhouette edge on '${layer.name}' frame ${f}, so this sprite is not outlined. That is a valid style — just keep it consistent.`,
              { layerId: layer.id, frameIndex: f },
            );
        }
      }

      if (wanted.has("banding")) {
        const threshold = Math.max(BANDING_MIN_RUN, Math.floor(w / 3));
        let worst = 0,
          worstAt: { x: number; y: number } | undefined,
          worstPair: [string, string] | undefined;
        for (let y = 0; y < h - 1; y++) {
          let run = 0,
            runX = 0;
          let above: string | null = null,
            below: string | null = null;
          for (let x = 0; x < w; x++) {
            const aAt = (y * w + x) * CHANNELS,
              bAt = ((y + 1) * w + x) * CHANNELS;
            const a = opaque(data, aAt) ? hex(data, aAt) : null;
            const b = opaque(data, bAt) ? hex(data, bAt) : null;
            if (a && b && a !== b && a === above && b === below) run++;
            else {
              above = a;
              below = b;
              run = a && b && a !== b ? 1 : 0;
              runX = x;
            }
            if (run > worst) {
              worst = run;
              worstAt = { x: runX + source.x, y: y + source.y };
              worstPair = [above as string, below as string];
            }
          }
        }
        if (worst >= threshold && worstPair)
          add(
            "banding",
            "note",
            `A ${worst}-pixel straight boundary between ${worstPair[0]} and ${worstPair[1]} on '${layer.name}' frame ${f}. Let the edge wander, or dither part of it, so it reads as a surface rather than a contour line.`,
            { layerId: layer.id, frameIndex: f, at: worstAt, count: worst },
          );
      }
    }
  }

  if (wanted.has("animation") && t.frames.length > 1) {
    if (timelineTags(t).length === 0)
      add(
        "animation",
        "error",
        `${t.frames.length} frames and no animation tags. An engine cannot address untagged frames — add a tag per cycle.`,
        { count: t.frames.length },
      );
    const durations = new Set(t.frames.map((frame) => frame.duration));
    if (durations.size === 1 && t.frames.length >= UNIFORM_DURATION_MIN_FRAMES)
      add(
        "animation",
        "note",
        "Every frame has the same duration. Uniform timing reads mechanical; hold contact poses longer than pass poses.",
      );
  }

  if (wanted.has("export_readiness")) {
    // Judge by what actually exports: the rendered composite covers tilemap
    // cels and group layers that per-image-cel scanning would miss.
    let anyInk = false;
    for (let f = 0; f < t.frames.length && !anyInk; f++)
      anyInk = celHasInk({
        pixels: renderTimelineFrame(t, doc.width, doc.height, f, undefined, false),
      });
    if (!anyInk)
      add("export_readiness", "warning", "Document has no ink on any frame — nothing to export.");
  }

  const expect = options.expect;
  if (expect?.layerFrames) {
    for (const [layerId, ranges] of Object.entries(expect.layerFrames)) {
      const index = layerIndexById(t, layerId);
      if (index < 0) {
        add("animation", "warning", `Expected layer '${layerId}' does not exist.`, { layerId });
        continue;
      }
      const inRange = new Set<number>();
      for (const [from, to] of ranges) for (let f = from; f <= to; f++) inRange.add(f);
      for (let f = 0; f < t.frames.length; f++) {
        const nonEmpty = celHasInk(celSource(doc, t, index, f));
        if (inRange.has(f) && !nonEmpty)
          add(
            "animation",
            "warning",
            `Layer '${t.layers[index].name}' expected art on frame ${f} but the cel is missing or empty.`,
            { layerId, frameIndex: f },
          );
        else if (!inRange.has(f) && nonEmpty)
          add(
            "animation",
            "warning",
            `Layer '${t.layers[index].name}' has art on frame ${f}, outside its expected range(s).`,
            { layerId, frameIndex: f },
          );
      }
    }
  }
  if (expect?.mustNotOverlap) {
    for (const [aId, bId] of expect.mustNotOverlap) {
      const aIndex = layerIndexById(t, aId),
        bIndex = layerIndexById(t, bId);
      if (aIndex < 0 || bIndex < 0) {
        add(
          "layers",
          "warning",
          `Overlap pair '${aId}'/'${bId}' refers to a layer that does not exist.`,
        );
        continue;
      }
      for (let f = 0; f < t.frames.length; f++) {
        const a = celSource(doc, t, aIndex, f),
          b = celSource(doc, t, bIndex, f);
        if (!a || !b) continue;
        const ox0 = Math.max(a.x, b.x),
          oy0 = Math.max(a.y, b.y);
        const ox1 = Math.min(a.x + a.pixels.width, b.x + b.pixels.width),
          oy1 = Math.min(a.y + a.pixels.height, b.y + b.pixels.height);
        let at: { x: number; y: number } | undefined;
        outer: for (let y = oy0; y < oy1; y++)
          for (let x = ox0; x < ox1; x++) {
            const aAt = ((y - a.y) * a.pixels.width + (x - a.x)) * CHANNELS;
            const bAt = ((y - b.y) * b.pixels.width + (x - b.x)) * CHANNELS;
            if (opaque(a.pixels.data, aAt) && opaque(b.pixels.data, bAt)) {
              at = { x, y };
              break outer;
            }
          }
        if (at)
          add(
            "layers",
            "error",
            `Layers '${t.layers[aIndex].name}' and '${t.layers[bIndex].name}' have overlapping opaque pixels on frame ${f}.`,
            { frameIndex: f, at },
          );
      }
    }
  }

  if (hiddenSkipped > 0)
    add(
      "layers",
      "note",
      `${hiddenSkipped} hidden layer(s) were not scanned for strays, outline, banding or antialiasing — those checks describe what the sprite shows. Make a layer visible to include it.`,
      { count: hiddenSkipped },
    );

  const errors = findings.filter((finding) => finding.severity === "error").length;
  const warnings = findings.filter((finding) => finding.severity === "warning").length;
  const strict = options.strict === true;
  const passed = errors === 0 && (!strict || warnings === 0);
  const score = Math.max(0, 100 - errors * ERROR_SCORE_COST - warnings * WARNING_SCORE_COST);
  const summary = passed
    ? `Clean${warnings > 0 ? ` (${warnings} style note(s))` : ""}.`
    : `${errors} error(s), ${warnings} warning(s). Fix the errors before calling this done.`;
  return { passed, score, findings, summary };
}
