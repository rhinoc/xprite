/**
 * Brush-dynamics math adapted from libmypaint 1.6.1 (ISC).
 * Copyright (C) 2007-2011 Martin Renold <martinxyz@gmx.ch> and contributors.
 * Copyright (C) 2008-2011 Martin Renold and contributors.
 *
 * Permission to use, copy, modify, and/or distribute this software for any
 * purpose with or without fee is hereby granted, provided that the above
 * copyright notice and this permission notice appear in all copies.
 *
 * THE SOFTWARE IS PROVIDED "AS IS" AND THE AUTHOR DISCLAIMS ALL WARRANTIES
 * WITH REGARD TO THIS SOFTWARE INCLUDING ALL IMPLIED WARRANTIES OF
 * MERCHANTABILITY AND FITNESS. IN NO EVENT SHALL THE AUTHOR BE LIABLE FOR
 * ANY SPECIAL, DIRECT, INDIRECT, OR CONSEQUENTIAL DAMAGES OR ANY DAMAGES
 * WHATSOEVER RESULTING FROM LOSS OF USE, DATA OR PROFITS, WHETHER IN AN
 * ACTION OF CONTRACT, NEGLIGENCE OR OTHER TORTIOUS ACTION, ARISING OUT OF
 * OR IN CONNECTION WITH THE USE OR PERFORMANCE OF THIS SOFTWARE.
 *
 * Upstream: https://github.com/mypaint/libmypaint/tree/v1.6.1
 * Commit: 2768251dacce3939136c839aeca413f4aa4241d0
 * Notice: LICENSES/libmypaint.txt
 *
 * Adapted from mypaint-mapping.c (`mypaint_mapping_calculate`) and the
 * fine-speed, pressure-gain, logarithmic-radius, and slow-tracking steps in
 * mypaint-brush.c. Defaults are the published brushsettings.json values.
 * Pixel stamps round the mapped radius and angle; that quantization is local.
 */

import { clamp } from "@xprite/bedrock/common/clamp";

/** `exp_decay` treats shorter constants as an immediate fall to zero. */
const EXP_DECAY_MIN_TIME_CONSTANT = 0.001;
/** `stroke_to` substitutes this when the caller reports no positive dt. */
const MIN_STROKE_DTIME_SECONDS = 0.0001;
/** `stroke_to` resets the brush when a gap exceeds this many seconds. */
export const MAX_STROKE_DTIME_SECONDS = 5;
/** Slow tracking scales wall-clock dt by this factor (`100.0 * dtime`). */
const SLOW_TRACKING_TIME_SCALE = 100;
/** Hardcoded fine-speed anchors in `settings_base_values_have_changed`. */
const SPEED_CURVE_FIX1_X = 45;
const SPEED_CURVE_FIX1_Y = 0.5;
const SPEED_CURVE_FIX2_X = 45;
const SPEED_CURVE_FIX2_DY = 0.015;

/** `speed1_gamma` default. Constant setting; larger values straighten the curve. */
export const SPEED1_GAMMA = 4;
/** `speed1_slowness` default, in seconds. */
export const SPEED1_SLOWNESS = 0.04;
/** `pressure_gain_log` default. Gain is `exp` of this value. */
export const PRESSURE_GAIN_LOG = 0;
/** Published soft range of the fine-speed input. */
export const SPEED1_SOFT_MIN = 0;
export const SPEED1_SOFT_MAX = 4;
/** `slow_tracking` range. Zero disables the follow filter. */
export const SLOW_TRACKING_MIN = 0;
export const SLOW_TRACKING_MAX = 10;
/** Amount used when an artist turns slow tracking on from zero. */
export const SLOW_TRACKING_ENABLED_AMOUNT = 2;
/** Clock used when a pointer sample has no timestamp. libmypaint always receives dt. */
export const MISSING_CLOCK_DTIME_SECONDS = 1 / 60;

export const BRUSH_STAMP_SIZE_MIN = 1;
export const BRUSH_STAMP_SIZE_MAX = 64;
export const BRUSH_STAMP_ANGLE_LIMIT = 180;

export interface MappingPoint {
  x: number;
  y: number;
}

interface SpeedCurve {
  gamma: number;
  slope: number;
  offset: number;
}

function speedCurve(gammaBase: number): SpeedCurve {
  const gamma = Math.exp(gammaBase);
  const logAnchor = Math.log(SPEED_CURVE_FIX1_X + gamma);
  const slope = SPEED_CURVE_FIX2_DY * (SPEED_CURVE_FIX2_X + gamma);
  return { gamma, slope, offset: SPEED_CURVE_FIX1_Y - slope * logAnchor };
}

const FINE_SPEED = speedCurve(SPEED1_GAMMA);

/** Fraction still left after `seconds`, from `exp_decay`. */
export function expDecay(timeConstant: number, seconds: number): number {
  if (!(timeConstant > EXP_DECAY_MIN_TIME_CONSTANT)) return 0;
  return Math.exp(-seconds / timeConstant);
}

/**
 * Fine-speed input. Physical speed is pixels per second; 45 px/s maps to 0.5
 * by the upstream anchor.
 */
export function speed1Input(normSpeedPxPerSec: number): number {
  const speed = Number.isFinite(normSpeedPxPerSec) ? Math.max(0, normSpeedPxPerSec) : 0;
  return Math.log(FINE_SPEED.gamma + speed) * FINE_SPEED.slope + FINE_SPEED.offset;
}

/** `hypot(dx / dt * viewzoom, dy / dt * viewzoom)`. */
export function normSpeed(dx: number, dy: number, dtimeSeconds: number, viewZoom = 1): number {
  const dt = dtimeSeconds > 0 ? dtimeSeconds : MIN_STROKE_DTIME_SECONDS;
  return Math.hypot((dx / dt) * viewZoom, (dy / dt) * viewZoom);
}

/** One-pole follow of `NORM_SPEED1_SLOW` toward the latest physical speed. */
export function smoothNormSpeed(
  previous: number,
  normSpeedPxPerSec: number,
  dtimeSeconds: number,
  slowness = SPEED1_SLOWNESS,
): number {
  const follow = 1 - expDecay(slowness, dtimeSeconds);
  return previous + (normSpeedPxPerSec - previous) * follow;
}

/** Pointer follow from `stroke_to`: `x += (target - x) * (1 - exp_decay(slow, 100 * dt))`. */
export function slowTrackingPosition(
  currentX: number,
  currentY: number,
  targetX: number,
  targetY: number,
  slowTracking: number,
  dtimeSeconds: number,
): { x: number; y: number } {
  const follow = 1 - expDecay(slowTracking, SLOW_TRACKING_TIME_SCALE * dtimeSeconds);
  return {
    x: currentX + (targetX - currentX) * follow,
    y: currentY + (targetY - currentY) * follow,
  };
}

/** `pressure * exp(pressure_gain_log)`. */
export function pressureInput(pressure: number, gainLog = PRESSURE_GAIN_LOG): number {
  const value = Number.isFinite(pressure) ? Math.max(0, pressure) : 0;
  return value * Math.exp(gainLog);
}

/**
 * Piecewise-linear mapping. The result is `base` plus each input's segment
 * value. Segments extrapolate past the outer control points, matching
 * `mypaint_mapping_calculate`.
 */
export function mappingCalculate(
  baseValue: number,
  inputs: readonly (readonly MappingPoint[])[],
  data: readonly number[],
): number {
  let result = baseValue;
  for (let index = 0; index < inputs.length; index++) {
    const points = inputs[index];
    if (!points || points.length < 2) continue;
    const x = data[index] ?? 0;
    let x0 = points[0].x;
    let y0 = points[0].y;
    let x1 = points[1].x;
    let y1 = points[1].y;
    for (let point = 2; point < points.length && x > x1; point++) {
      x0 = x1;
      y0 = y1;
      x1 = points[point].x;
      y1 = points[point].y;
    }
    const y = x0 === x1 || y0 === y1 ? y0 : (y1 * (x - x0) + y0 * (x1 - x)) / (x1 - x0);
    result += y;
  }
  return result;
}

function stampSize(value: number): number {
  return clamp(Math.round(value), BRUSH_STAMP_SIZE_MIN, BRUSH_STAMP_SIZE_MAX);
}

/** Logarithmic radius: base is `ln(high)`, and the low control point reaches `ln(low)`. */
export function dynamicStampSize(
  input: number,
  inputLow: number,
  inputHigh: number,
  minSize: number,
  maxSize: number,
): number {
  const low = stampSize(minSize);
  const high = stampSize(maxSize);
  const base = Math.log(high);
  const mapped = mappingCalculate(
    base,
    [
      [
        { x: inputLow, y: Math.log(low) - base },
        { x: inputHigh, y: 0 },
      ],
    ],
    [input],
  );
  const pixels = Math.exp(mapped);
  return clamp(Math.round(pixels), Math.min(low, high), Math.max(low, high));
}

/** Elliptical-dab angle is linear degrees added to the base angle. */
export function dynamicStampAngle(
  input: number,
  inputLow: number,
  inputHigh: number,
  minAngle: number,
  maxAngle: number,
): number {
  const low = clamp(minAngle, -BRUSH_STAMP_ANGLE_LIMIT, BRUSH_STAMP_ANGLE_LIMIT);
  const high = clamp(maxAngle, -BRUSH_STAMP_ANGLE_LIMIT, BRUSH_STAMP_ANGLE_LIMIT);
  const mapped = mappingCalculate(
    high,
    [
      [
        { x: inputLow, y: low - high },
        { x: inputHigh, y: 0 },
      ],
    ],
    [input],
  );
  return clamp(
    Math.round(clamp(mapped, Math.min(low, high), Math.max(low, high))),
    -BRUSH_STAMP_ANGLE_LIMIT,
    BRUSH_STAMP_ANGLE_LIMIT,
  );
}

/** Two-point mix. The mapping is linear between the control points; the result is clamped to 0..1. */
export function dynamicColorMix(input: number, inputLow: number, inputHigh: number): number {
  return clamp(
    mappingCalculate(
      0,
      [
        [
          { x: inputLow, y: 0 },
          { x: inputHigh, y: 1 },
        ],
      ],
      [input],
    ),
    0,
    1,
  );
}

/** Positive dt, or the upstream minimum when the clock does not advance. */
export function strokeDtimeSeconds(
  previousMs: number | undefined,
  nextMs: number | undefined,
): number {
  if (
    typeof previousMs === "number" &&
    typeof nextMs === "number" &&
    Number.isFinite(previousMs) &&
    Number.isFinite(nextMs)
  ) {
    const elapsed = (nextMs - previousMs) / 1000;
    return elapsed > 0 ? elapsed : MIN_STROKE_DTIME_SECONDS;
  }
  return MISSING_CLOCK_DTIME_SECONDS;
}
