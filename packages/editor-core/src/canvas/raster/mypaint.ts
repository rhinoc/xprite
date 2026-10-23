/* Ported from libmypaint 1.6.1 (commit 2768251dacce3939136c839aeca413f4aa4241d0):
 * mypaint-mapping.c, mypaint-brush.c and brushsettings.json.
 * libmypaint - The MyPaint Brush Library
 * Copyright (C) 2007-2011 Martin Renold <martinxyz@gmx.ch>
 * Copyright (C) 2008-2011 Martin Renold and contributors
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
 * See LICENSES/libmypaint.txt. */

/** `soft_minimum`/`soft_maximum` of the brushsettings.json inputs. */
export const MYPAINT_PRESSURE_RANGE = [0, 1] as const;
export const MYPAINT_SPEED_RANGE = [0, 4] as const;
/** `speed1_slowness` default: fine speed filter time constant in seconds. */
export const MYPAINT_SPEED_SLOWNESS = 0.04;
/** `speed1_gamma` default; the stored value is the logarithm of gamma. */
const MYPAINT_SPEED_GAMMA_LOG = 4;
/** `slow_tracking` range. 0 disables slow position tracking. */
export const MYPAINT_SLOW_TRACKING_MAX = 10;
/** `pressure_gain_log` range. */
export const MYPAINT_PRESSURE_GAIN_LOG_LIMIT = 1.8;
/** update_states_and_setting_values() replaces a zero time step with this value. */
export const MYPAINT_MIN_DTIME = 0.001;
/** mypaint_brush_stroke_to_internal() scales slow tracking time by this factor. */
const SLOW_TRACKING_TIME_SCALE = 100;
const EXP_DECAY_MIN_TIME_CONSTANT = 0.001;
const SPEED_FIX_X = 45;
const SPEED_FIX_Y = 0.5;
const SPEED_FIX_DY = 0.015;

/** exp_decay(): the fraction still left after `time` for `timeConstant`. */
function mypaintExpDecay(timeConstant: number, time: number): number {
  if (timeConstant <= EXP_DECAY_MIN_TIME_CONSTANT) return 0;
  return Math.exp(-time / timeConstant);
}

type MyPaintControlPoint = readonly [x: number, y: number];

/** One input of a MyPaintMapping: stepwise linear control points, at least two. */
export interface MyPaintCurve {
  input: number;
  points: readonly MyPaintControlPoint[];
}

/** mypaint_mapping_calculate(): base value plus every curve evaluated at its input. */
export function mypaintMappingCalculate(
  baseValue: number,
  curves: readonly MyPaintCurve[],
  inputs: readonly number[],
): number {
  let result = baseValue;
  for (const { input, points } of curves) {
    if (points.length < 2) continue;
    const x = inputs[input];
    let [x0, y0] = points[0];
    let [x1, y1] = points[1];
    for (let i = 2; i < points.length && x > x1; i++) {
      x0 = x1;
      y0 = y1;
      [x1, y1] = points[i];
    }
    result += x0 === x1 || y0 === y1 ? y0 : (y1 * (x - x0) + y0 * (x1 - x)) / (x1 - x0);
  }
  return result;
}

export interface MyPaintSpeedMapping {
  gamma: number;
  m: number;
  q: number;
}

/** settings_base_values_have_changed(): y = log(gamma + x) * m + q, fixed so a
 * physical speed of 45 reports 0.5 with slope 0.015. */
export function mypaintSpeedMapping(gammaLog = MYPAINT_SPEED_GAMMA_LOG): MyPaintSpeedMapping {
  const gamma = Math.exp(gammaLog);
  const m = SPEED_FIX_DY * (SPEED_FIX_X + gamma);
  const q = SPEED_FIX_Y - m * Math.log(SPEED_FIX_X + gamma);
  return { gamma, m, q };
}

/** The speed input reported for a filtered physical speed in pixels per second. */
export function mypaintSpeedInput(mapping: MyPaintSpeedMapping, speed: number): number {
  return Math.log(mapping.gamma + speed) * mapping.m + mapping.q;
}

/** NORM_SPEED1_SLOW state update: exponential filter of the physical speed. */
export function mypaintFilterSpeed(
  filtered: number,
  speed: number,
  slowness: number,
  dtime: number,
): number {
  return filtered + (speed - filtered) * (1 - mypaintExpDecay(slowness, dtime));
}

/** Slow position tracking from mypaint_brush_stroke_to_internal(). */
export function mypaintSlowTracking(
  tracked: number,
  target: number,
  slowTracking: number,
  dtime: number,
): number {
  const fac = 1 - mypaintExpDecay(slowTracking, SLOW_TRACKING_TIME_SCALE * dtime);
  return tracked + (target - tracked) * fac;
}

/** INPUT(PRESSURE): tablet pressure multiplied by exp(pressure_gain_log). */
export function mypaintPressureInput(pressure: number, gainLog: number): number {
  return Math.max(0, pressure) * Math.exp(gainLog);
}
