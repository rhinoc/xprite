import { createHash } from "node:crypto";
import { mkdir, writeFile } from "node:fs/promises";
import { dirname } from "node:path";
import { fileURLToPath } from "node:url";
import { inflateSync } from "node:zlib";

import { PNG } from "pngjs";

const PNG_SIGNATURE = Buffer.from([137, 80, 78, 71, 13, 10, 26, 10]);
const PNG_CHUNK_OVERHEAD = 12;
const PNG_HEADER_SIZE = 13;
const COLOR_CHUNKS = new Set(["iCCP", "sRGB", "gAMA", "cHRM", "cICP"]);
const MAX_PROFILE_BYTES = 16 * 1024 * 1024;
const SCREENSHOT_SCHEMA_VERSION = 1;
const CHROMIUM_CAPTURE_METHOD = "Chromium CDP native PNG";
const hash = (bytes) => createHash("sha256").update(bytes).digest("hex");
const filename = (value) => (value instanceof URL ? fileURLToPath(value) : value);

function pngChunks(value) {
  const bytes = Buffer.isBuffer(value) ? value : Buffer.from(value);
  if (!bytes.subarray(0, PNG_SIGNATURE.length).equals(PNG_SIGNATURE))
    throw new Error("Screenshot is not a PNG.");
  const chunks = [];
  let offset = PNG_SIGNATURE.length;
  while (offset + PNG_CHUNK_OVERHEAD <= bytes.length) {
    const length = bytes.readUInt32BE(offset);
    const end = offset + PNG_CHUNK_OVERHEAD + length;
    if (end > bytes.length) throw new Error("Truncated screenshot PNG chunk.");
    const type = bytes.toString("ascii", offset + 4, offset + 8);
    chunks.push({
      type,
      data: bytes.subarray(offset + 8, end - 4),
      bytes: bytes.subarray(offset, end),
    });
    offset = end;
    if (type === "IEND") break;
  }
  if (
    chunks[0]?.type !== "IHDR" ||
    chunks[0].data.length !== PNG_HEADER_SIZE ||
    chunks.at(-1)?.type !== "IEND" ||
    !chunks.some(({ type, data }) => type === "IDAT" && data.length > 0) ||
    offset !== bytes.length
  )
    throw new Error("Incomplete screenshot PNG.");
  return { bytes, chunks };
}

/** Inspect original bytes without decoding, resampling or converting their colors. */
export function inspectPng(value) {
  const { bytes, chunks } = pngChunks(value);
  const header = chunks[0].data;
  const width = header.readUInt32BE(0);
  const height = header.readUInt32BE(4);
  if (!width || !height) throw new Error("Screenshot PNG has no pixels.");
  const colorSpace = {
    iccSha256: null,
    srgbIntent: null,
    gamma: null,
    chromaticities: null,
    cicp: null,
  };
  for (const { type, data } of chunks) {
    if (type === "iCCP") {
      const separator = data.indexOf(0);
      if (separator < 1 || data[separator + 1] !== 0)
        throw new Error("Invalid screenshot ICC profile.");
      colorSpace.iccSha256 = hash(
        inflateSync(data.subarray(separator + 2), { maxOutputLength: MAX_PROFILE_BYTES }),
      );
    } else if (type === "sRGB") colorSpace.srgbIntent = data.toString("hex");
    else if (type === "gAMA") colorSpace.gamma = data.toString("hex");
    else if (type === "cHRM") colorSpace.chromaticities = data.toString("hex");
    else if (type === "cICP") colorSpace.cicp = data.toString("hex");
  }
  return { width, height, colorSpace, sha256: hash(bytes) };
}

/** Reject changed color interpretation rather than silently normalizing evidence. */
export function assertSamePngColorSpace(reference, candidate, label = "Screenshots") {
  if (
    JSON.stringify(inspectPng(reference).colorSpace) !==
    JSON.stringify(inspectPng(candidate).colorSpace)
  )
    throw new Error(
      `${label}: ICC or PNG color-space metadata changed. Review the capture environment.`,
    );
}

/** Keep the source color interpretation on diagnostic PNGs; pixel data stays untouched. */
export function preservePngColorSpace(source, output) {
  const sourceChunks = pngChunks(source).chunks;
  const outputChunks = pngChunks(output).chunks;
  return Buffer.concat([
    PNG_SIGNATURE,
    outputChunks[0].bytes,
    ...sourceChunks.filter(({ type }) => COLOR_CHUNKS.has(type)).map(({ bytes }) => bytes),
    ...outputChunks
      .slice(1)
      .filter(({ type }) => !COLOR_CHUNKS.has(type))
      .map(({ bytes }) => bytes),
  ]);
}

/** Integer pixel crop for diagnostic views; no CSS scale or interpolation is inferred. */
export function cropPngBytes(source, rectangle) {
  const image = PNG.sync.read(Buffer.isBuffer(source) ? source : Buffer.from(source));
  if (
    !validRectangle(rectangle) ||
    ![rectangle.x, rectangle.y, rectangle.width, rectangle.height].every(Number.isInteger) ||
    rectangle.x < 0 ||
    rectangle.y < 0 ||
    rectangle.x + rectangle.width > image.width ||
    rectangle.y + rectangle.height > image.height
  )
    throw new Error("Crop must use integer PNG pixels inside the screenshot.");
  const output = new PNG({ width: rectangle.width, height: rectangle.height });
  for (let row = 0; row < rectangle.height; row++) {
    const start = ((rectangle.y + row) * image.width + rectangle.x) * 4;
    image.data.copy(output.data, row * rectangle.width * 4, start, start + rectangle.width * 4);
  }
  return preservePngColorSpace(source, PNG.sync.write(output));
}

function validRectangle(rectangle) {
  return (
    rectangle &&
    [rectangle.x, rectangle.y, rectangle.width, rectangle.height].every(Number.isFinite) &&
    rectangle.width > 0 &&
    rectangle.height > 0
  );
}

function screenshotMetadata(bytes, { viewport = null, clip = null, method, expectedDpr }) {
  if (!method) throw new Error("Screenshot capture method is required.");
  const image = inspectPng(bytes);
  const captureClip =
    clip ?? (viewport ? { x: 0, y: 0, width: viewport.width, height: viewport.height } : null);
  if (captureClip && !validRectangle(captureClip))
    throw new Error("Invalid screenshot CSS rectangle.");
  const dpr = expectedDpr ?? viewport?.dpr;
  if (expectedDpr !== undefined && viewport?.dpr != null && expectedDpr !== viewport.dpr)
    throw new Error(
      `Observed screenshot DPR ${viewport.dpr} does not match requested DPR ${expectedDpr}.`,
    );
  if (dpr !== undefined && dpr !== null) {
    if (!Number.isFinite(dpr) || dpr <= 0 || !captureClip)
      throw new Error("Screenshot DPR requires positive CSS dimensions.");
    const width = Math.round(captureClip.width * dpr);
    const height = Math.round(captureClip.height * dpr);
    if (image.width !== width || image.height !== height)
      throw new Error(
        `Screenshot was rescaled: PNG ${image.width}x${image.height}, expected ${width}x${height} at DPR ${dpr}.`,
      );
  }
  return {
    schemaVersion: SCREENSHOT_SCHEMA_VERSION,
    capturedAt: new Date().toISOString(),
    method,
    viewport,
    captureClip,
    pixels: { width: image.width, height: image.height },
    pixelScale: captureClip
      ? { x: image.width / captureClip.width, y: image.height / captureClip.height }
      : null,
    colorSpace: image.colorSpace,
    sha256: image.sha256,
  };
}

async function writeScreenshot(bytes, metadata, { path, metadataPath, exclusive = false }) {
  const output = filename(path);
  if (!output) throw new Error("Screenshot output path is required.");
  const sidecar =
    metadataPath === null
      ? null
      : metadataPath === undefined
        ? output.replace(/\.png$/i, ".json")
        : filename(metadataPath);
  if (sidecar === output) throw new Error("Screenshot metadata must not overwrite its PNG.");
  await mkdir(dirname(output), { recursive: true });
  await writeFile(output, bytes, { flag: exclusive ? "wx" : "w" });
  if (sidecar) {
    await mkdir(dirname(sidecar), { recursive: true });
    await writeFile(sidecar, `${JSON.stringify(metadata, null, 2)}\n`, {
      flag: exclusive ? "wx" : "w",
    });
  }
}

/** Save browser or native-provider bytes verbatim with observed dimensions and color metadata. */
export async function saveScreenshot(bytes, options) {
  const metadata = screenshotMetadata(bytes, options);
  await writeScreenshot(bytes, metadata, options);
  return metadata;
}

/** Ego page.screenshot exports CSS pixels. Capture the compositor's native pixels instead. */
export async function captureBrowserPng(page, { clip, expectedDpr } = {}) {
  await page.evaluate(async () => {
    await document.fonts.ready;
  });
  const metrics = await page.cdp("Page.getLayoutMetrics");
  const ratio = await page.cdp("Runtime.evaluate", {
    expression: "({dpr:window.devicePixelRatio,width:window.innerWidth,height:window.innerHeight})",
    returnByValue: true,
  });
  const { dpr, width, height } = ratio.result.value;
  if (!Number.isFinite(dpr) || dpr <= 0) throw new Error("Browser did not report a valid DPR.");
  if (expectedDpr !== undefined && dpr !== expectedDpr)
    throw new Error(`Browser DPR ${dpr} does not match requested DPR ${expectedDpr}.`);
  const visible = metrics.cssLayoutViewport;
  if (!visible || metrics.cssVisualViewport?.scale !== 1)
    throw new Error("Screenshot requires an unpinched CSS viewport.");
  // Layout metrics exclude native scrollbar gutters; whole-viewport captures must include them.
  const viewport = { width, height, dpr };
  const requestedClip = clip ?? { x: 0, y: 0, width: viewport.width, height: viewport.height };
  if (
    !validRectangle(requestedClip) ||
    requestedClip.x < 0 ||
    requestedClip.y < 0 ||
    requestedClip.x + requestedClip.width > viewport.width ||
    requestedClip.y + requestedClip.height > viewport.height
  )
    throw new Error("Screenshot crop must fit inside the visible CSS viewport.");
  // Align the crop to device pixels, preserving every included source pixel.
  const left = Math.floor((visible.pageX + requestedClip.x) * dpr);
  const top = Math.floor((visible.pageY + requestedClip.y) * dpr);
  const right = Math.ceil((visible.pageX + requestedClip.x + requestedClip.width) * dpr);
  const bottom = Math.ceil((visible.pageY + requestedClip.y + requestedClip.height) * dpr);
  const captureClip = {
    x: left / dpr - visible.pageX,
    y: top / dpr - visible.pageY,
    width: (right - left) / dpr,
    height: (bottom - top) / dpr,
  };
  const screenshot = await page.cdp("Page.captureScreenshot", {
    format: "png",
    fromSurface: true,
    captureBeyondViewport: false,
    clip: {
      x: left / dpr,
      y: top / dpr,
      width: captureClip.width,
      height: captureClip.height,
      scale: 1,
    },
  });
  const bytes = Buffer.from(screenshot.data, "base64");
  const metadata = screenshotMetadata(bytes, {
    viewport,
    clip: captureClip,
    method: CHROMIUM_CAPTURE_METHOD,
    expectedDpr: dpr,
  });
  metadata.requestedClip = requestedClip;
  return { bytes, metadata };
}

/** Capture and persist once; live frame samplers can use captureBrowserPng before choosing a frame. */
export async function captureBrowserScreenshot(page, options = {}) {
  const { bytes, metadata } = await captureBrowserPng(page, options);
  await writeScreenshot(bytes, metadata, options);
  return metadata;
}
