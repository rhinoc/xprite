import fs from "node:fs";
import path from "node:path";
import process from "node:process";

import pixelmatch from "pixelmatch";
import { PNG } from "pngjs";

import {
  assertSamePngColorSpace,
  preservePngColorSpace,
} from "../../../../scripts/base/screenshot.mjs";
import { writeImageReport } from "../../../../scripts/visual-audit/report-html.mjs";

export function comparePngFiles(referencePath, candidatePath, diffPath, threshold = 0.1) {
  const referenceBytes = fs.readFileSync(referencePath);
  const candidateBytes = fs.readFileSync(candidatePath);
  assertSamePngColorSpace(referenceBytes, candidateBytes);
  const reference = PNG.sync.read(referenceBytes);
  const candidate = PNG.sync.read(candidateBytes);

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
  fs.writeFileSync(diffPath, preservePngColorSpace(referenceBytes, PNG.sync.write(diff)));

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

const htmlPath = path.resolve(path.dirname(diffPath), `${path.parse(diffPath).name}.html`);
fs.mkdirSync(path.dirname(htmlPath), { recursive: true });
const reportCase = {
  name: `${path.basename(referencePath)} → ${path.basename(candidatePath)}`,
  reference: path.resolve(referencePath),
  candidate: path.resolve(candidatePath),
  warnings: [],
};
const saveReport = () =>
  writeImageReport(htmlPath, {
    title: "PNG 图像差异报告",
    notice: `整张图像按 pixelmatch 阈值 ${threshold} 对比，包含抗锯齿像素。点击图片查看原始像素。此报告不改变比较脚本的退出结果。`,
    cases: [reportCase],
  });
try {
  const result = comparePngFiles(referencePath, candidatePath, diffPath, threshold);
  Object.assign(reportCase, {
    diff: path.resolve(diffPath),
    changed: !result.same,
    similarity: 1 - result.differentPixels / result.totalPixels,
    differentPixels: result.differentPixels,
    totalPixels: result.totalPixels,
  });
  saveReport();
  console.log(JSON.stringify({ ...result, htmlPath }, null, 2));
  process.exit(result.same ? 0 : 1);
} catch (error) {
  reportCase.warnings.push(error instanceof Error ? error.message : String(error));
  saveReport();
  console.error(error instanceof Error ? error.message : error);
  console.error(`Image diff report: ${htmlPath}`);
  process.exit(1);
}
