import { createHash } from "node:crypto";
import { mkdir, readFile, writeFile } from "node:fs/promises";
import path from "node:path";
import { fileURLToPath } from "node:url";
import { deflateSync, inflateSync } from "node:zlib";

import { PNG } from "pngjs";

import { inspectPng } from "../../base/screenshot.mjs";

const DEFAULT_SCREENSHOT_DIRECTORY = fileURLToPath(
  new URL("../../../apps/growth/public/showcase/ipad/screenshots/", import.meta.url),
);
const DISPLAY_DIRECTORY = "display";
const MANIFEST_FILE = "captures.json";
const PROFILE_FILE = "compositor.icc";
const PROFILE_NAME = "Chromium compositor";
// This repair is specific to the capture set in captures.json. Do not assign a
// profile from a different workstation or capture session to untagged pixels.
const CAPTURE_PROFILE_SHA256 = "ecbbbb7400d6582cbc0b24149acdcfc16799b3360f7912933859975c6e778549";
const PNG_SIGNATURE_LENGTH = 8;
const CHUNK_OVERHEAD = 12;
const CRC_INITIAL = 0xffffffff;
const CRC_POLYNOMIAL = 0xedb88320;
const COLOR_CHUNKS = new Set(["iCCP", "sRGB", "gAMA", "cHRM", "cICP"]);
const sha256 = (bytes) => createHash("sha256").update(bytes).digest("hex");

function chunks(bytes) {
  inspectPng(bytes);
  const result = [];
  let offset = PNG_SIGNATURE_LENGTH;
  while (offset < bytes.length) {
    const length = bytes.readUInt32BE(offset);
    const end = offset + length + CHUNK_OVERHEAD;
    result.push({
      type: bytes.toString("ascii", offset + 4, offset + 8),
      data: bytes.subarray(offset + 8, end - 4),
      bytes: bytes.subarray(offset, end),
    });
    offset = end;
  }
  return result;
}

function encodeChunk(type, data) {
  const body = Buffer.concat([Buffer.from(type, "ascii"), data]);
  let crc = CRC_INITIAL;
  for (const byte of body) {
    crc ^= byte;
    for (let bit = 0; bit < 8; bit += 1) {
      crc = (crc >>> 1) ^ (crc & 1 ? CRC_POLYNOMIAL : 0);
    }
  }
  const length = Buffer.alloc(4);
  length.writeUInt32BE(data.length);
  const checksum = Buffer.alloc(4);
  checksum.writeUInt32BE((crc ^ CRC_INITIAL) >>> 0);
  return Buffer.concat([length, body, checksum]);
}

function profileFromCapture(bytes) {
  const profileChunk = chunks(bytes).find(({ type }) => type === "iCCP");
  if (!profileChunk)
    throw new Error("The reference must be a native PNG with an embedded ICC profile.");
  const separator = profileChunk.data.indexOf(0);
  const profile = inflateSync(profileChunk.data.subarray(separator + 2));
  if (sha256(profile) !== CAPTURE_PROFILE_SHA256) {
    throw new Error("The reference compositor ICC does not match this historical capture set.");
  }
  return profile;
}

function taggedPresentationCopy(bytes, profile) {
  const original = chunks(bytes);
  if (original.some(({ type }) => COLOR_CHUNKS.has(type))) {
    throw new Error(
      "A source already has color metadata; do not replace its color interpretation.",
    );
  }
  const profileChunk = encodeChunk(
    "iCCP",
    Buffer.concat([Buffer.from(`${PROFILE_NAME}\0\0`, "ascii"), deflateSync(profile)]),
  );
  const tagged = Buffer.concat([
    bytes.subarray(0, PNG_SIGNATURE_LENGTH),
    original[0].bytes,
    profileChunk,
    ...original.slice(1).map((chunk) => chunk.bytes),
  ]);
  const before = PNG.sync.read(bytes);
  const after = PNG.sync.read(tagged);
  if (
    before.width !== after.width ||
    before.height !== after.height ||
    !before.data.equals(after.data)
  ) {
    throw new Error("Presentation tagging changed decoded pixels.");
  }
  return tagged;
}

async function main() {
  const [flag, referencePath, directoryFlag, directoryPath, ...extra] = process.argv.slice(2);
  if (
    flag !== "--profile-capture" ||
    !referencePath ||
    extra.length ||
    (directoryFlag !== undefined && (directoryFlag !== "--screenshots-dir" || !directoryPath))
  ) {
    throw new Error(
      "Usage: node scripts/showcase/ipad/normalize-screen-color.mjs --profile-capture /path/to/native.png [--screenshots-dir /path/to/captures]",
    );
  }
  const referenceBytes = await readFile(referencePath);
  const profile = profileFromCapture(referenceBytes);
  const screenshotDirectory = directoryPath
    ? path.resolve(directoryPath)
    : DEFAULT_SCREENSHOT_DIRECTORY;
  const sourceManifest = JSON.parse(
    await readFile(path.join(screenshotDirectory, MANIFEST_FILE), "utf8"),
  );
  const displayPath = path.join(screenshotDirectory, DISPLAY_DIRECTORY);
  const derived = [];
  for (const capture of sourceManifest.captures) {
    const sourcePath = path.join(screenshotDirectory, capture.file);
    const original = await readFile(sourcePath);
    if (sha256(original) !== capture.sha256) {
      throw new Error(`Original capture hash changed: ${capture.file}`);
    }
    const output = taggedPresentationCopy(original, profile);
    const destination = path.join(displayPath, capture.file);
    await mkdir(path.dirname(destination), { recursive: true });
    await writeFile(destination, output);
    derived.push({
      file: capture.file,
      source: `../${capture.file}`,
      sourceSha256: capture.sha256,
      sourceCapturedAt: capture.capturedAt,
      ...inspectPng(output),
      unchangedDecodedPixels: capture.width * capture.height,
      unchangedCompressedImageData: true,
    });
  }
  await writeFile(path.join(displayPath, PROFILE_FILE), profile);
  await writeFile(
    path.join(displayPath, MANIFEST_FILE),
    `${JSON.stringify(
      {
        schemaVersion: 1,
        generatedAt: new Date().toISOString(),
        purpose:
          "Color-managed showcase presentation copies; not raw captures or visual-audit candidates.",
        treatment:
          "Add the verified Chromium compositor ICC. Original RGB samples, alpha, dimensions, and compressed IDAT chunks are unchanged. The browser converts the tagged image into the sRGB screen canvas.",
        profile: {
          file: PROFILE_FILE,
          sha256: sha256(profile),
          source: "Native Chromium PNG with an embedded Google/Skia ICC profile",
          sourcePng: path.relative(displayPath, path.resolve(referencePath)),
          sourcePngSha256: sha256(referenceBytes),
          sourcePngColorSpace: inspectPng(referenceBytes).colorSpace,
        },
        colorDiagnosis: "../color-reference/proof.json",
        sourceManifest: `../${MANIFEST_FILE}`,
        captures: derived,
      },
      null,
      2,
    )}\n`,
  );
  console.log(
    JSON.stringify({
      displayDirectory: displayPath,
      copies: derived.length,
      profileSha256: sha256(profile),
    }),
  );
}

await main();
