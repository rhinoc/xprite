import crypto from "node:crypto";
import fs from "node:fs";
import path from "node:path";

import pixelmatch from "pixelmatch";
import { PNG } from "pngjs";

import { sceneIds } from "./scenes.mjs";

export const COMPARISON_METHOD =
  "decoded RGBA pixels; minimum 99% whole-window similarity; no masks or resizing";
const MINIMUM_PIXEL_SIMILARITY = 0.99;
const digest = (bytes) => crypto.createHash("sha256").update(bytes).digest("hex");

export function assertCaptureContract(baseline, candidate, language, ids) {
  if (baseline.language !== language || candidate.language !== language)
    throw Error(`${language}: capture manifest has the wrong language.`);
  for (const manifest of [baseline, candidate]) {
    if (
      manifest.schemaVersion !== 1 ||
      new Set(manifest.cases.map(({ id }) => id)).size !== manifest.cases.length ||
      manifest.cases.some(({ id }) => !sceneIds.includes(id)) ||
      ids.some((id) => !manifest.cases.some((entry) => entry.id === id))
    )
      throw Error("Capture manifest must contain every selected canonical scene exactly once.");
  }
  for (const key of ["theme", "language", "fixture"])
    if (JSON.stringify(baseline[key]) !== JSON.stringify(candidate[key]))
      throw Error(`Capture contract changed: ${key}. Review and explicitly update the baseline.`);
  if (JSON.stringify(baseline.browser) !== JSON.stringify(candidate.browser))
    throw Error("Browser version/platform changed. Review captures before updating the baseline.");
}

export function compareCase(baseline, candidate, baselineDir, candidateDir, id) {
  const expected = baseline.cases.find((entry) => entry.id === id),
    actual = candidate.cases.find((entry) => entry.id === id);
  for (const key of ["mode", "view", "viewport", "language", "frame", "zoom", "tooltip"])
    if (JSON.stringify(expected[key]) !== JSON.stringify(actual[key]))
      throw Error(`${id}: capture state changed: ${key}.`);
  const readImage = (directory, entry) => {
    const bytes = fs.readFileSync(path.join(directory, entry.file));
    if (digest(bytes) !== entry.sha256)
      throw Error(`${id}: PNG does not match its capture manifest.`);
    const image = PNG.sync.read(bytes);
    if (image.width !== entry.viewport.width || image.height !== entry.viewport.height)
      throw Error(`${id}: raw PNG dimensions do not match the viewport.`);
    return image;
  };
  const reference = readImage(baselineDir, expected),
    image = readImage(candidateDir, actual);
  const pixelsSame = reference.data.equals(image.data);
  const score = ({ name, x, y, width, height }) => {
    if (
      ![x, y, width, height].every(Number.isInteger) ||
      x < 0 ||
      y < 0 ||
      width <= 0 ||
      height <= 0 ||
      x + width > image.width ||
      y + height > image.height
    )
      throw Error(`${id}: invalid area ${name}.`);
    let differentPixels = 0;
    if (!pixelsSame)
      for (let row = y; row < y + height; row++)
        for (let col = x; col < x + width; col++) {
          const offset = (row * image.width + col) * 4;
          if (
            reference.data[offset] !== image.data[offset] ||
            reference.data[offset + 1] !== image.data[offset + 1] ||
            reference.data[offset + 2] !== image.data[offset + 2] ||
            reference.data[offset + 3] !== image.data[offset + 3]
          )
            differentPixels++;
        }
    return {
      name,
      x,
      y,
      width,
      height,
      differentPixels,
      totalPixels: width * height,
      similarity: 1 - differentPixels / (width * height),
      same: differentPixels === 0,
    };
  };
  const full = score({
    name: "whole-window",
    x: 0,
    y: 0,
    width: image.width,
    height: image.height,
  });
  const diffFile = `${id}-diff.png`;
  const diffPath = path.join(candidateDir, diffFile);
  if (!pixelsSame) {
    const diff = new PNG({ width: image.width, height: image.height });
    pixelmatch(reference.data, image.data, diff.data, image.width, image.height, {
      threshold: 0,
      includeAA: true,
    });
    fs.writeFileSync(diffPath, PNG.sync.write(diff));
  } else fs.rmSync(diffPath, { force: true });
  const geometrySame = JSON.stringify(expected.regions) === JSON.stringify(actual.regions);
  return {
    id,
    ...full,
    geometrySame,
    passed: full.similarity >= MINIMUM_PIXEL_SIMILARITY && geometrySame,
    regions: expected.regions.map(score),
    ...(!pixelsSame ? { diffFile } : {}),
  };
}
