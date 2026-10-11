/* Algorithm adaptation from Aseprite doc/octree_map and render/color_histogram,
 * median_cut, quantization (MIT).
 * Copyright (c) 2018-present Igara Studio S.A.
 * Copyright (c) 2001-2018 David Capello
 * Permission is hereby granted, free of charge, to any person obtaining a copy
 * of this software and associated documentation files (the "Software"), to deal
 * in the Software without restriction, including without limitation the rights
 * to use, copy, modify, merge, publish, distribute, sublicense, and/or sell copies
 * of the Software, and to permit persons to whom the Software is furnished to do
 * so, subject to the following conditions:
 * The above copyright notice and this permission notice shall be included in
 * all copies or substantial portions of the Software.
 * THE SOFTWARE IS PROVIDED "AS IS", WITHOUT WARRANTY OF ANY KIND, EXPRESS OR
 * IMPLIED, INCLUDING BUT NOT LIMITED TO THE WARRANTIES OF MERCHANTABILITY,
 * FITNESS FOR A PARTICULAR PURPOSE AND NONINFRINGEMENT. IN NO EVENT SHALL THE
 * AUTHORS OR COPYRIGHT HOLDERS BE LIABLE FOR ANY CLAIM, DAMAGES OR OTHER
 * LIABILITY, WHETHER IN AN ACTION OF CONTRACT, TORT OR OTHERWISE, ARISING FROM,
 * OUT OF OR IN CONNECTION WITH THE SOFTWARE OR THE USE OR OTHER DEALINGS IN THE
 * SOFTWARE.
 */
import { UINT8_MAX } from "$/base/numeric-constants";
import type { PixelBuffer, Rgba } from "$/base/primitives";
import { assertPaletteAllocation } from "$/color/palette-resize";

export enum PaletteQuantizationAlgorithm {
  Default = "default",
  Rgb5a3 = "rgb5a3",
  Octree = "octree",
}
export enum PaletteGenerationTarget {
  New = "new",
  Current = "current",
  Selected = "selected",
}
export interface PaletteGenerationOptions {
  count: number;
  alpha: boolean;
  algorithm: PaletteQuantizationAlgorithm;
  target: PaletteGenerationTarget;
}
const CHANNELS = 4;
const BRANCHES = 16;
const EXACT_LIMIT = 256;
const HISTOGRAM_BITS = [5, 6, 5, 5] as const;
const BLACK: Rgba = [0, 0, 0, UINT8_MAX];
interface Accumulator {
  sum: number[];
  count: number;
}
interface TreeNode extends Accumulator {
  children: (TreeNode | undefined)[];
  parent: TreeNode | null;
}
const node = (parent: TreeNode | null): TreeNode => ({
  parent,
  children: [],
  sum: [0, 0, 0, 0],
  count: 0,
});
const add = (to: Accumulator, from: Accumulator) => {
  to.count += from.count;
  for (let c = 0; c < CHANNELS; c++) to.sum[c] += from.sum[c];
};
const mean = (value: Accumulator): Rgba =>
  value.sum.map(
    (sum) => Math.trunc(sum / value.count) + (sum % value.count > value.count / 2 ? 1 : 0),
  ) as unknown as Rgba;

function octree(
  colors: readonly { color: Rgba; count: number }[],
  limit: number,
  depth: number,
): Rgba[] {
  const root = node(null);
  for (const sample of colors) {
    let current = root;
    for (let level = 0; level < depth; level++) {
      const shift = 7 - level;
      const branch = sample.color.reduce(
        (index, channel, component) => index | (((channel >>> shift) & 1) << component),
        0,
      );
      current = current.children[branch] ??= node(current);
    }
    add(current, {
      sum: sample.color.map((channel) => channel * sample.count),
      count: sample.count,
    });
  }
  const leaves: TreeNode[] = [];
  const collect = (parent: TreeNode) => {
    for (let i = 0; i < BRANCHES; i++) {
      const child = parent.children[i];
      if (!child) continue;
      if (child.count) leaves.push(child);
      else collect(child);
    }
  };
  collect(root);
  if (depth === 7 && leaves.length < limit) return octree(colors, limit, 8);
  if (limit === 0) return [];
  let pending: TreeNode[] = [];
  for (let level = depth; level >= 0; level--) {
    let done = false;
    while (true) {
      if (leaves.length + pending.length <= limit) {
        leaves.push(...pending.reverse());
        pending = [];
        done = true;
        break;
      }
      if (!leaves.length) {
        if (pending.length <= BRANCHES && limit < BRANCHES) {
          pending.sort((a, b) => b.count - a.count);
          while (pending.length > limit) add(pending[pending.length - 2]!, pending.pop()!);
          leaves.push(...pending);
          pending = [];
          done = true;
        }
        break;
      }
      const parent = leaves[leaves.length - 1]!.parent;
      if (!parent) {
        done = true;
        break;
      }
      for (let i = BRANCHES - 1; i >= 0; i--) {
        const child = parent.children[i];
        if (child?.count) {
          add(parent, child);
          if (leaves[leaves.length - 1] === child) leaves.pop();
        }
      }
      pending.push(parent);
    }
    if (done) break;
    leaves.push(...pending.reverse());
    pending = [];
  }
  return leaves.map(mean);
}
interface HistogramPoint {
  channels: number[];
  count: number;
}
interface Box {
  points: HistogramPoint[];
  low: number[];
  high: number[];
  volume: number;
}
function box(points: HistogramPoint[], low: number[], high: number[]): Box {
  return {
    points,
    low,
    high,
    volume: high.reduce((volume, value, channel) => volume * (value - low[channel] + 1), 1),
  };
}
function medianCut(points: HistogramPoint[], limit: number): Rgba[] {
  if (!points.length) return [];
  // Match the volume-prioritized heap, including its right-child tie rule.
  const heap: Box[] = [];
  const push = (value: Box) => {
    let at = heap.length;
    heap.push(value);
    while (at > 0) {
      const parent = Math.floor((at - 1) / 2);
      if (heap[parent]!.volume >= value.volume) break;
      heap[at] = heap[parent]!;
      at = parent;
    }
    heap[at] = value;
  };
  const pop = () => {
    const first = heap[0]!;
    const last = heap.pop()!;
    if (heap.length) {
      let at = 0;
      while (at * 2 + 1 < heap.length) {
        let child = at * 2 + 1;
        if (child + 1 < heap.length && heap[child + 1]!.volume >= heap[child]!.volume) child++;
        heap[at] = heap[child]!;
        at = child;
      }
      heap[at] = last;
      while (at > 0) {
        const parent = Math.floor((at - 1) / 2);
        if (heap[parent]!.volume >= last.volume) break;
        heap[at] = heap[parent]!;
        at = parent;
      }
      heap[at] = last;
    }
    return first;
  };
  const average = (value: Box): Rgba => {
    const count = value.points.reduce((total, point) => total + point.count, 0);
    return HISTOGRAM_BITS.map((bits, channel) =>
      Math.trunc(
        (UINT8_MAX *
          Math.trunc(
            value.points.reduce((sum, point) => sum + point.channels[channel] * point.count, 0) /
              count,
          )) /
          ((1 << bits) - 1),
      ),
    ) as unknown as Rgba;
  };
  push(
    box(
      points,
      [0, 0, 0, 0],
      HISTOGRAM_BITS.map((bits) => (1 << bits) - 1),
    ),
  );
  const result: Rgba[] = [];
  while (heap.length && heap.length < limit) {
    const current = pop();
    const low = [Infinity, Infinity, Infinity, Infinity];
    const high = [-Infinity, -Infinity, -Infinity, -Infinity];
    for (const point of current.points)
      for (let channel = 0; channel < CHANNELS; channel++) {
        low[channel] = Math.min(low[channel], point.channels[channel]);
        high[channel] = Math.max(high[channel], point.channels[channel]);
      }
    let axis = 0;
    for (let c = 1; c < CHANNELS; c++) if (high[c] - low[c] > high[axis] - low[axis]) axis = c;
    const planes = new Map<number, number>();
    let total = 0;
    for (const point of current.points) {
      planes.set(point.channels[axis], (planes.get(point.channels[axis]) ?? 0) + point.count);
      total += point.count;
    }
    let left = 0;
    let cut: number | null = null;
    for (let position = low[axis]; position <= high[axis]; position++) {
      const plane = planes.get(position) ?? 0;
      left += plane;
      if (left > total - left) {
        if (total - left > 0) cut = position;
        else if (left - plane > 0) cut = position - 1;
        break;
      }
    }
    if (cut === null) {
      if (result.length < limit) result.push(average(current));
      else break;
    } else {
      const end = [...high];
      end[axis] = cut;
      const start = [...low];
      start[axis] = cut + 1;
      push(
        box(
          current.points.filter((point) => point.channels[axis] <= cut!),
          low,
          end,
        ),
      );
      push(
        box(
          current.points.filter((point) => point.channels[axis] > cut!),
          start,
          high,
        ),
      );
    }
  }
  while (heap.length && result.length < limit) result.push(average(pop()));
  return result;
}

export function quantizePalette(
  images: Iterable<PixelBuffer>,
  count: number,
  withAlpha: boolean,
  algorithm = PaletteQuantizationAlgorithm.Default,
  maskIndex = 0,
  maskColor = 0,
): Rgba[] {
  assertPaletteAllocation(count);
  const colors = new Map<string, { color: Rgba; count: number }>();
  for (const image of images)
    for (let at = 0; at < image.data.length; at += CHANNELS) {
      const d = image.data;
      if (!d[at + 3]) continue;
      const color: Rgba = [d[at], d[at + 1], d[at + 2], withAlpha ? d[at + 3] : UINT8_MAX];
      const key = color.join(",");
      const sample = colors.get(key);
      if (sample) sample.count++;
      else colors.set(key, { color, count: 1 });
    }
  if (algorithm !== PaletteQuantizationAlgorithm.Rgb5a3) {
    const mask = maskIndex >= 0;
    const result = octree([...colors.values()], Math.max(0, count - Number(mask)), 7);
    return mask
      ? [
          [
            maskColor & UINT8_MAX,
            (maskColor >>> 8) & UINT8_MAX,
            (maskColor >>> 16) & UINT8_MAX,
            (maskColor >>> 24) & UINT8_MAX,
          ],
          ...result,
        ]
      : result.length
        ? result
        : [BLACK];
  }
  const mask = count > 1 && maskIndex >= 0 && maskIndex < count;
  const available = count - Number(mask);
  let result: Rgba[];
  if (colors.size <= EXACT_LIMIT && colors.size <= available)
    result = [...colors.values()].map((sample) => sample.color);
  else {
    const histogram = new Map<string, HistogramPoint>();
    for (const sample of colors.values()) {
      const channels = sample.color.map(
        (channel, index) => channel >>> (8 - HISTOGRAM_BITS[index]),
      );
      const key = channels.join(",");
      const point = histogram.get(key);
      if (point) point.count += sample.count;
      else histogram.set(key, { channels, count: sample.count });
    }
    result = medianCut([...histogram.values()], available);
  }
  if (mask) {
    if (maskIndex <= result.length)
      result.splice(maskIndex, 0, [0, 0, 0, withAlpha ? 0 : UINT8_MAX]);
    else result.push(BLACK);
  }
  return result.length ? result : [BLACK];
}
