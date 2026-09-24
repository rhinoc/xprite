import fs from "node:fs";
import path from "node:path";
import process from "node:process";

import pixelmatch from "pixelmatch";
import { PNG } from "pngjs";

export function comparePngFiles(referencePath, candidatePath, diffPath, threshold = 0.1) {
  const reference = PNG.sync.read(fs.readFileSync(referencePath));
  const candidate = PNG.sync.read(fs.readFileSync(candidatePath));

  if (reference.width !== candidate.width || reference.height !== candidate.height) {
    throw new Error(
      `dimension mismatch: reference ${reference.width}x${reference.height}, candidate ${candidate.width}x${candidate.height}`,
    );
  }

  const diff = new PNG({ width: reference.width, height: reference.height });
  const differentPixels = pixelmatch(
    reference.data,
    candidate.data,
    diff.data,
    reference.width,
    reference.height,
    { threshold, includeAA: true },
  );
  const totalPixels = reference.width * reference.height;

  fs.mkdirSync(path.dirname(path.resolve(diffPath)), { recursive: true });
  fs.writeFileSync(diffPath, PNG.sync.write(diff));

  return {
    same: differentPixels === 0,
    threshold,
    width: reference.width,
    height: reference.height,
    differentPixels,
    totalPixels,
    differencePercent: Number(((differentPixels / totalPixels) * 100).toFixed(6)),
    diffPath,
  };
}

function usage() {
  console.error(
    "Usage: node .agents/skills/pixel-to-pixel-analysis/scripts/pixel-diff.mjs reference.png candidate.png [diff.png] [--threshold 0.1]",
  );
}

const args = process.argv.slice(2);
const thresholdArgIndex = args.findIndex(
  (arg) => arg === "--threshold" || arg.startsWith("--threshold="),
);
let threshold = 0.1;
if (thresholdArgIndex >= 0) {
  const argument = args[thresholdArgIndex];
  const raw = argument.includes("=") ? argument.split("=", 2)[1] : args[thresholdArgIndex + 1];
  threshold = Number(raw);
  args.splice(thresholdArgIndex, argument === "--threshold" ? 2 : 1);
}

const [referencePath, candidatePath, diffPath = ".tmp/pixel-diff.png"] = args;
if (
  !referencePath ||
  !candidatePath ||
  !Number.isFinite(threshold) ||
  threshold < 0 ||
  threshold > 1
) {
  usage();
  process.exit(2);
}

try {
  const result = comparePngFiles(referencePath, candidatePath, diffPath, threshold);
  console.log(JSON.stringify(result, null, 2));
  process.exit(result.same ? 0 : 1);
} catch (error) {
  console.error(error instanceof Error ? error.message : error);
  process.exit(1);
}
