import { execFile } from "node:child_process";
import { fileURLToPath } from "node:url";
import { promisify } from "node:util";

import { PNG } from "pngjs";

const run = promisify(execFile);
const MAX_DECODED_IMAGE_BYTES = 64 * 1024 * 1024;
const filePath = (value) => (value instanceof URL ? fileURLToPath(value) : value);

// Asset generation and verification require cwebp/dwebp from libwebp.
export async function encodeLosslessWebp(source, destination) {
  await run("cwebp", [
    "-lossless",
    "-z",
    "9",
    "-exact",
    "-metadata",
    "all",
    "-quiet",
    filePath(source),
    "-o",
    filePath(destination),
  ]);
}

export async function readWebpPixels(source) {
  const { stdout } = await run("dwebp", [filePath(source), "-quiet", "-o", "-"], {
    encoding: "buffer",
    maxBuffer: MAX_DECODED_IMAGE_BYTES,
  });
  return PNG.sync.read(stdout);
}
