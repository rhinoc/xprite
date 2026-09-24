import { describe, expect, it } from "vitest";

import {
  AsepriteTagDirection,
  asepriteFromProject,
  decodeAsepriteSync,
  encodeAsepriteSync,
  projectFromAseprite,
} from "$/import-export/aseprite";
import { rasterAnimationProject } from "$/import-export/image/animation";
import { encodeApng, encodeGif } from "$/import-export/image/encoders";
import { decodeGifAnimation } from "$/import-export/image/gif-import";
import { parseWebpAnimation, decodeWebpAnimation } from "$/import-export/image/webp-import";
import { animationExportLoopCount, assertAnimationLoopCount } from "$/timeline/animation-loop";
import { AnimationPreviewPlayer, defaultPlaybackSettings } from "$/timeline/animation-options";

const ascii = (value: string) => Array.from(value, (character) => character.charCodeAt(0));
const word = (value: number) => [value & 255, value >>> 8];
const dword = (value: number) => [
  value & 255,
  (value >>> 8) & 255,
  (value >>> 16) & 255,
  value >>> 24,
];
const gifFrame = (literal: number) => [
  0x2c,
  0,
  0,
  0,
  0,
  1,
  0,
  1,
  0,
  0,
  2,
  2,
  literal ? 0x4c : 0x44,
  1,
  0,
];
const gifExtension = (count: number, identifier = "NETSCAPE2.0") => [
  0x21,
  0xff,
  11,
  ...ascii(identifier),
  3,
  1,
  ...word(count),
  0,
];
const gif = (extensions: readonly number[] = []) =>
  new Uint8Array([
    ...ascii("GIF89a"),
    1,
    0,
    1,
    0,
    0x80,
    0,
    0,
    0,
    0,
    0,
    255,
    0,
    0,
    ...extensions,
    ...gifFrame(1),
    ...gifFrame(0),
    0x3b,
  ]);
function chunk(kind: string, bytes: readonly number[]) {
  return [...ascii(kind), ...dword(bytes.length), ...bytes, ...(bytes.length & 1 ? [0] : [])];
}
function webp(count: number) {
  const frame = chunk("ANMF", [
    0,
    0,
    0,
    0,
    0,
    0,
    0,
    0,
    0,
    0,
    0,
    0,
    50,
    0,
    0,
    2,
    ...chunk("VP8L", [0x2f, 0, 0, 0, 0]),
  ]);
  const body = [
    ...ascii("WEBP"),
    ...chunk("VP8X", [2, 0, 0, 0, 0, 0, 0, 0, 0, 0]),
    ...chunk("ANIM", [0, 0, 0, 0, ...word(count)]),
    ...frame,
    ...frame,
  ];
  return new Uint8Array([...ascii("RIFF"), ...dword(body.length), ...body]);
}
function animation(count: number) {
  return rasterAnimationProject({
    width: 1,
    height: 1,
    loopCount: count,
    frames: [10, 200].map((red) => ({
      durationMs: 50,
      pixels: { width: 1, height: 1, data: new Uint8ClampedArray([red, 0, 0, 255]) },
    })),
  });
}

describe("animation play counts", () => {
  it("normalizes GIF repetitions to total plays, including absent/infinite/max/alternate extensions", () => {
    expect(decodeGifAnimation(gif())?.loopCount).toBe(1);
    expect(decodeGifAnimation(gif(gifExtension(0)))?.loopCount).toBe(0);
    expect(decodeGifAnimation(gif(gifExtension(2)))?.loopCount).toBe(3);
    expect(decodeGifAnimation(gif(gifExtension(65535, "ANIMEXTS1.0")))?.loopCount).toBe(65536);
    expect(decodeGifAnimation(gif([...gifExtension(2), ...gifExtension(8)]))?.loopCount).toBe(3);
    expect(decodeGifAnimation(gif(gifExtension(2, "UNKNOWNAPP0")))?.loopCount).toBe(1);
    const single = gif(gifExtension(2));
    const firstOnly = new Uint8Array([
      ...single.subarray(0, single.length - gifFrame(0).length - 1),
      0x3b,
    ]);
    expect(decodeGifAnimation(firstOnly)?.loopCount).toBe(3);
  });
  it.each([0, 1, 3, 65535])(
    "preserves WebP's total play count %s through frame composition",
    async (count) => {
      const parsed = parseWebpAnimation(webp(count))!;
      expect(parsed.loopCount).toBe(count);
      const decoded = await decodeWebpAnimation(parsed, async () => ({
        width: 1,
        height: 1,
        data: new Uint8ClampedArray([255, 0, 0, 255]),
      }));
      expect(rasterAnimationProject(decoded).timeline.loopCount).toBe(count);
    },
  );
  it.each([0, 1, 3, 65536])("round-trips count %s through GIF encoding", (count) => {
    const project = animation(count);
    const frames = project.timeline.frames.map((frame, sourceFrame) => ({
      pixels: frame.cels[0]!.pixels,
      duration: frame.duration,
      sourceFrame,
    }));
    expect(decodeGifAnimation(encodeGif(frames, { loopCount: count }))?.loopCount).toBe(count);
    const apng = encodeApng(frames, count);
    // IHDR occupies 25 bytes after the signature; acTL payload then stores num_frames/num_plays.
    expect(new DataView(apng.buffer).getUint32(45)).toBe(count);
  });
  it.each([0, 1, 3, 65536])("retains count %s in standard ASE extension properties", (count) => {
    const project = animation(count);
    const bytes = encodeAsepriteSync(asepriteFromProject(project));
    const restored = projectFromAseprite(decodeAsepriteSync(bytes));
    expect(restored.timeline.loopCount).toBe(count);
    expect(restored.timeline.tags ?? []).toEqual([]);
    restored.timeline.loopCount = 5;
    expect(
      projectFromAseprite(decodeAsepriteSync(encodeAsepriteSync(asepriteFromProject(restored))))
        .timeline.loopCount,
    ).toBe(5);
  });
  it("finishes exactly two complete passes, keeps the last frame and does not mutate the document", () => {
    const project = animation(2),
      before = structuredClone(project);
    const player = new AnimationPreviewPlayer();
    player.play(project.timeline, defaultPlaybackSettings, 1);
    expect(player.frame).toBe(0);
    player.advance(project.timeline, 199, defaultPlaybackSettings);
    expect(player.playing).toBe(true);
    expect(player.frame).toBe(1);
    player.advance(project.timeline, 1, defaultPlaybackSettings);
    expect(player.playing).toBe(false);
    expect(player.frame).toBe(1);
    expect(project).toEqual(before);
    player.play(project.timeline, defaultPlaybackSettings);
    expect(player.playing).toBe(true);
    player.advance(project.timeline, 200, defaultPlaybackSettings);
    expect(player.playing).toBe(false);
  });
  it("handles once, infinity, rewind and authored tag previews separately", () => {
    const player = new AnimationPreviewPlayer();
    const forever = animation(0).timeline;
    player.play(forever, defaultPlaybackSettings);
    player.advance(forever, 1000, defaultPlaybackSettings);
    expect(player.playing).toBe(true);
    const finite = animation(3).timeline;
    const once = { ...defaultPlaybackSettings, playOnce: true };
    player.play(finite, once);
    player.advance(finite, 100, once);
    expect(player.playing).toBe(false);
    const tagged = {
      ...animation(1).timeline,
      tags: [
        {
          name: "Loop",
          from: 0,
          to: 1,
          repeat: 0,
          direction: AsepriteTagDirection.Forward,
          color: [0, 0, 0, 255] as [number, number, number, number],
        },
      ],
    };
    player.play(tagged, defaultPlaybackSettings);
    player.advance(tagged, 300, defaultPlaybackSettings);
    expect(player.playing).toBe(true);
    const all = { ...defaultPlaybackSettings, playAll: true, rewindOnStop: true };
    player.play(tagged, all, 0);
    player.advance(tagged, 100, all);
    expect(player.playing).toBe(false);
    expect(player.frame).toBe(0);
  });
  it("honors explicit export overrides and rejects noninteger/overflow counts", () => {
    expect(animationExportLoopCount(3, {})).toBe(3);
    expect(animationExportLoopCount(3, { loopCount: 0 })).toBe(0);
    expect(animationExportLoopCount(3, { loopCount: 1 })).toBe(1);
    expect(animationExportLoopCount(3, { loopCount: 5 })).toBe(5);
    for (const count of [-1, 1.5, 65537, Number.NaN])
      expect(() => assertAnimationLoopCount(count)).toThrow();
  });
});
