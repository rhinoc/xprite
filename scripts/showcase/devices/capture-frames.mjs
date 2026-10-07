import { mkdir, readFile, writeFile } from "node:fs/promises";

import { PNG } from "pngjs";

import { captureBrowserPng, saveScreenshot } from "../../base/screenshot.mjs";

const ART_WIDTH = 128;
const ART_HEIGHT = 80;
const MAX_CAPTURES = 64;
const CAPTURE_JITTER_MS = 37;

/** Identify each native compositor frame from every artwork pixel, instead of racing DOM state.
 * The palette mapping comes from an earlier verified capture on the same compositor.
 * PNG bytes and color profiles are preserved unchanged.
 */
export async function captureDeviceFrames(page, directory, bounds, palette) {
  const artwork = new URL("../../../apps/growth/public/showcase/ipad/hello/", import.meta.url);
  const source = JSON.parse(await readFile(new URL("frames.json", artwork), "utf8"));
  const originals = await Promise.all(
    source.animation.frames.map((_, i) =>
      readFile(new URL(`hello-frame-${String(i + 1).padStart(2, "0")}.png`, artwork)).then(
        (bytes) => PNG.sync.read(bytes),
      ),
    ),
  );
  const frames = new Map();
  await mkdir(directory, { recursive: true });
  for (let attempt = 0; attempt < MAX_CAPTURES && frames.size < originals.length; attempt++) {
    const playing = await page.evaluate(
      () =>
        !!document.querySelector(
          'button[aria-label="Stop playback"],button[aria-label="停止播放"]',
        ),
    );
    if (!playing) throw Error("Start the real editor playback before capturing.");
    const capture = await captureBrowserPng(page, { expectedDpr: 1 });
    const actual = PNG.sync.read(capture.bytes);
    const index = originals.findIndex((reference) => {
      for (let y = 0; y < ART_HEIGHT; y++)
        for (let x = 0; x < ART_WIDTH; x++) {
          const offset = (y * ART_WIDTH + x) * 4;
          const rgb =
            palette[
              `${reference.data[offset]},${reference.data[offset + 1]},${reference.data[offset + 2]}`
            ];
          if (!rgb) return false;
          const expected = rgb.split(",").map(Number);
          const pixel =
            (Math.floor(bounds.y + ((y + 0.5) * bounds.height) / ART_HEIGHT) * actual.width +
              Math.floor(bounds.x + ((x + 0.5) * bounds.width) / ART_WIDTH)) *
            4;
          if (expected.some((channel, c) => actual.data[pixel + c] !== channel)) return false;
        }
      return true;
    });
    if (index >= 0 && !frames.has(index)) {
      const metadata = await saveScreenshot(capture.bytes, {
        path: `${directory}/${index + 1}.png`,
        viewport: capture.metadata.viewport,
        expectedDpr: 1,
        method: capture.metadata.method,
      });
      const receipt = {
        ...metadata,
        frame: index + 1,
        durationMs: source.animation.frames[index].durationMs,
        sourceAsepriteSha256: source.animation.sourceSha256,
        artworkPixelsVerified: ART_WIDTH * ART_HEIGHT,
        artworkBounds: bounds,
        artworkColorMapping: palette,
      };
      frames.set(index, receipt);
      await writeFile(`${directory}/${index + 1}.json`, `${JSON.stringify(receipt, null, 2)}\n`);
      console.log(`Captured native frame ${index + 1} (${frames.size}/${originals.length})`);
    }
    await new Promise((resolve) => setTimeout(resolve, CAPTURE_JITTER_MS * (1 + (attempt % 5))));
  }
  if (frames.size !== originals.length)
    throw Error(`Captured ${frames.size}/${originals.length} frames.`);
  await writeFile(
    `${directory}/captures.json`,
    JSON.stringify(
      [...frames.values()].sort((a, b) => a.frame - b.frame),
      null,
      2,
    ) + "\n",
  );
  return [...frames.keys()].map((i) => i + 1).sort();
}
