import { createHash } from "node:crypto";
import { mkdir, readFile, writeFile } from "node:fs/promises";
import path from "node:path";

import { PNG } from "pngjs";

import { captureBrowserPng, saveScreenshot } from "../../base/screenshot.mjs";

const FRAME_STEP_MS = 32;
const MAX_CAPTURE_STEPS = 160;
const ARTWORK_WIDTH = 128;
const ARTWORK_HEIGHT = 80;

// Browser-side, read-only DOM inspection. No application state or styling is modified.
function playbackState() {
  const input = document.querySelector(
    'input[aria-label="Current frame"], input[aria-label="当前帧"]',
  );
  const stop = document.querySelector(
    'button[aria-label="Stop playback"], button[aria-label="停止播放"]',
  );
  const frames = [...document.querySelectorAll('[data-timeline-kind="frames"][data-frame]')];
  return {
    frame: Number(input?.value),
    playing: !!stop,
    frames: frames.map((frame) => ({
      index: Number(frame.getAttribute("data-frame")),
      label: frame.getAttribute("aria-label"),
      pressed: frame.getAttribute("aria-pressed"),
    })),
    viewport: { width: innerWidth, height: innerHeight, devicePixelRatio },
    source: `${location.origin}${location.pathname}`,
  };
}

function artworkColorMapping(screenshot, artwork, bounds) {
  const colors = new Map();
  const reverse = new Map();
  for (let y = 0; y < ARTWORK_HEIGHT; y += 1) {
    for (let x = 0; x < ARTWORK_WIDTH; x += 1) {
      const screenX = Math.floor(bounds.x + ((x + 0.5) * bounds.width) / ARTWORK_WIDTH);
      const screenY = Math.floor(bounds.y + ((y + 0.5) * bounds.height) / ARTWORK_HEIGHT);
      const actual = (screenY * screenshot.width + screenX) * 4;
      const expected = (y * artwork.width + x) * 4;
      const sourceColor = [...artwork.data.subarray(expected, expected + 3)].join(",");
      const captureColor = [...screenshot.data.subarray(actual, actual + 3)].join(",");
      // macOS Chromium capture can emit display-managed RGB. Require an exact
      // one-to-one palette mapping and every source pixel's native location.
      if ((sourceColor === "255,255,255") !== (captureColor === "255,255,255")) return null;
      if (colors.has(sourceColor) && colors.get(sourceColor) !== captureColor) return null;
      if (reverse.has(captureColor) && reverse.get(captureColor) !== sourceColor) return null;
      colors.set(sourceColor, captureColor);
      reverse.set(captureColor, sourceColor);
    }
  }
  return Object.fromEntries(colors);
}

/**
 * Run from an existing ego-browser task after opening hello.aseprite in Xprite,
 * setting its zoom, and pressing the real Play control. The output PNGs are the
 * browser's unmodified screenshots, including the native canvas and timeline.
 *
 * await capturePlayback(page, { outputDirectory, artworkDirectory, artworkBounds });
 */
export async function capturePlayback(
  page,
  { outputDirectory, artworkDirectory, artworkBounds, frameCount = 8, resume = false },
) {
  const source = JSON.parse(await readFile(path.join(artworkDirectory, "frames.json"), "utf8"));
  const expected = await Promise.all(
    Array.from({ length: frameCount }, async (_, index) =>
      PNG.sync.read(
        await readFile(
          path.join(artworkDirectory, `hello-frame-${String(index + 1).padStart(2, "0")}.png`),
        ),
      ),
    ),
  );
  const captures = new Map();
  await mkdir(outputDirectory, { recursive: true });
  if (resume) {
    const current = await page.evaluate(playbackState);
    for (let frame = 1; frame <= frameCount; frame += 1) {
      let previous;
      try {
        previous = JSON.parse(await readFile(path.join(outputDirectory, `${frame}.json`), "utf8"));
      } catch (error) {
        if (error.code === "ENOENT") continue;
        throw error;
      }
      const bytes = await readFile(path.join(outputDirectory, previous.file));
      const screenshot = PNG.sync.read(bytes);
      if (
        previous.frame !== frame ||
        previous.sourceAsepriteSha256 !== source.animation.sourceSha256 ||
        previous.source !== current.source ||
        JSON.stringify(previous.viewport) !== JSON.stringify(current.viewport) ||
        previous.sha256 !== createHash("sha256").update(bytes).digest("hex") ||
        !artworkColorMapping(screenshot, expected[frame - 1], artworkBounds)
      )
        throw new Error(
          `Saved native playback frame ${frame} does not match this capture session.`,
        );
      captures.set(frame, previous);
    }
  }
  for (let step = 0; step < MAX_CAPTURE_STEPS && captures.size < frameCount; step += 1) {
    const before = await page.evaluate(playbackState);
    if (!before.playing || before.frames.length !== frameCount) {
      throw new Error("Open the real eight-frame hello document and start playback first.");
    }
    if (!captures.has(before.frame)) {
      const capture = await captureBrowserPng(page, {
        expectedDpr: before.viewport.devicePixelRatio,
      });
      const data = capture.bytes;
      const screenshot = PNG.sync.read(data);
      const after = await page.evaluate(playbackState);
      const colorMapping = artworkColorMapping(
        screenshot,
        expected[before.frame - 1],
        artworkBounds,
      );
      const activeFrameMatches = (state) =>
        state.frames.filter((frame) => frame.pressed === "true").length === 1 &&
        state.frames[before.frame - 1]?.pressed === "true";
      if (
        before.frame === after.frame &&
        after.playing &&
        activeFrameMatches(before) &&
        activeFrameMatches(after) &&
        colorMapping
      ) {
        const file = `${before.frame}.png`;
        const saved = await saveScreenshot(data, {
          path: path.join(outputDirectory, file),
          viewport: capture.metadata.viewport,
          clip: capture.metadata.captureClip,
          method: capture.metadata.method,
          expectedDpr: before.viewport.devicePixelRatio,
          metadataPath: null,
        });
        captures.set(before.frame, {
          file,
          width: screenshot.width,
          height: screenshot.height,
          sha256: saved.sha256,
          capture: saved,
          capturedAt: new Date().toISOString(),
          sourceFrameIndex: before.frame - 1,
          durationMs: source.animation.frames[before.frame - 1].durationMs,
          sourceAsepriteSha256: source.animation.sourceSha256,
          artworkPixelsVerified: ARTWORK_WIDTH * ARTWORK_HEIGHT,
          artworkColorMapping: colorMapping,
          ...before,
        });
        await writeFile(
          path.join(outputDirectory, `${before.frame}.json`),
          `${JSON.stringify(captures.get(before.frame), null, 2)}\n`,
        );
      }
    }
    await new Promise((resolve) => setTimeout(resolve, FRAME_STEP_MS));
  }
  if (captures.size !== frameCount) {
    throw new Error(`Captured ${captures.size}/${frameCount} matching native playback frames.`);
  }
  const result = [...captures.values()].sort((left, right) => left.frame - right.frame);
  await writeFile(
    path.join(outputDirectory, "captures.json"),
    `${JSON.stringify(result, null, 2)}\n`,
  );
  return result;
}
