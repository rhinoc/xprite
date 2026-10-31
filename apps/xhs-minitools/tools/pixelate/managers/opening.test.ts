import assert from "node:assert/strict";

import { describe, it } from "vitest";

import { MiniToolEditor } from "$/tools/pixelate/managers/editor";
import type { MiniToolPort } from "$/tools/pixelate/managers/ports";
import type { PixelBuffer } from "@xprite/editor-core/base";
import { PixelationAlgorithm, type PixelGridAnalysis } from "@xprite/pixelate";
import { PixelationManager, type PixelationPort } from "@xprite/tools-app/pixelation";

const photo: PixelBuffer = { width: 40, height: 30, data: new Uint8ClampedArray(40 * 30 * 4) };
const blocks: PixelBuffer = { width: 8, height: 6, data: new Uint8ClampedArray(8 * 6 * 4) };
const grid = {
  reliable: false,
  algorithm: PixelationAlgorithm.Auto,
} as unknown as PixelGridAnalysis;

/** Each step of opening waits a task, as reading and converting do in the browser. */
const later = <T>(value: T) => new Promise<T>((resolve) => setTimeout(() => resolve(value), 0));

function port(convert: () => Promise<PixelBuffer>): PixelationPort {
  return {
    readWheel: () => ({}) as never,
    paletteResources: () => ({ choices: [] }),
    read: () => later(photo),
    example: () => later(new File([], "example.jpg", { type: "image/jpeg" })),
    detectGrid: () => later(grid),
    convert,
    save: async () => {},
    edit: async () => {},
    prepare() {},
    dispose() {},
  };
}

/** Every state the screen renders while `open` runs: empty, opening or a shown result. */
async function screens(open: (pixelation: PixelationManager) => Promise<void>, failing = false) {
  const pixelation = new PixelationManager(
    port(() => (failing ? Promise.reject(new Error("broken")) : later(blocks))),
  );
  const tool = {
    shrink: (image: PixelBuffer) => image,
    preview: () => later(blocks),
  } as unknown as MiniToolPort;
  const editor = new MiniToolEditor(pixelation, tool);
  const seen: string[] = [];
  const record = () => {
    const state = editor.getSnapshot();
    const screen = state.shown ? "photo" : state.opening ? "opening" : "empty";
    if (seen[seen.length - 1] !== screen) seen.push(screen);
  };
  record();
  editor.subscribe(record);
  pixelation.subscribe(record);
  await open(pixelation);
  await new Promise((resolve) => setTimeout(resolve, 10));
  editor.dispose();
  pixelation.dispose();
  return seen;
}

describe("opening a photo", () => {
  it("goes from empty to opening to the photo, never back to empty in between", async () => {
    assert.deepEqual(await screens((pixelation) => pixelation.open(new File([], "cat.jpg"))), [
      "empty",
      "opening",
      "photo",
    ]);
  });

  it("does the same for the example", async () => {
    assert.deepEqual(await screens((pixelation) => pixelation.openExample()), [
      "empty",
      "opening",
      "photo",
    ]);
  });

  it("returns to the empty state when the photo cannot be converted", async () => {
    assert.deepEqual(
      await screens((pixelation) => pixelation.open(new File([], "cat.jpg")), true),
      ["empty", "opening", "empty"],
    );
  });
});
