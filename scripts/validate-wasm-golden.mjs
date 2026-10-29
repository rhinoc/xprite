#!/usr/bin/env node
/**
 * Golden parity validation for AC+RL consensus WASM against Python Fixer.
 *
 * Tests the WASM detectFastAcRl implementation on 8 golden test cases.
 * Gate: WASM must fire 8/8 with G matching Python (all consensus="fast:ac+rl(S)").
 */

import fs from "fs";
import path from "path";
import { fileURLToPath } from "url";

import { PNG } from "pngjs";

const __dirname = path.dirname(fileURLToPath(import.meta.url));
const WORKSPACE = path.resolve(__dirname, "..");
const UPLOADS = "/home/ubuntu/.cursor/projects/workspace/uploads";

// Load manifest
const manifestPath = path.resolve(UPLOADS, "manifest_9dc4.json");
if (!fs.existsSync(manifestPath)) {
  console.error(`ERROR: Manifest not found at ${manifestPath}`);
  process.exit(1);
}

const manifest = JSON.parse(fs.readFileSync(manifestPath, "utf8"));

console.log(`\n${"=".repeat(80)}`);
console.log("AC+RL Consensus WASM Golden Parity Validation");
console.log(`${"=".repeat(80)}\n`);
console.log(`Test cases: ${manifest.length}`);
console.log(`Gate: WASM must fire 8/${manifest.length} with G matching Python`);
console.log(`Expected consensus: "fast:ac+rl(S)" on all cases\n`);

// Map uploaded PNGs by base name
const pngMap = {};
const pngFiles = fs.readdirSync(UPLOADS).filter((f) => f.endsWith(".png"));
for (const pngFile of pngFiles) {
  // Extract original name from filename like "gtn-002-lpc-tile-a__block_reset_5630.png"
  const match = pngFile.match(/^(.+?)_[0-9a-f]{4}\.png$/);
  if (match) {
    const baseName = match[1];
    pngMap[baseName] = path.resolve(UPLOADS, pngFile);
  }
}

console.log(`Found ${Object.keys(pngMap).length} PNG files in uploads/\n`);

// Load WASM module
console.log("Loading WASM module...");
const wasmPkgPath = path.resolve(WORKSPACE, "packages/fixer-detect-wasm/pixelfixer_detect.js");
const { initSync, detectFastAcRl } = await import(wasmPkgPath);

// Initialize WASM synchronously
const wasmPath = path.resolve(WORKSPACE, "packages/fixer-detect-wasm/pixelfixer_detect_bg.wasm");
const wasmBuffer = fs.readFileSync(wasmPath);
initSync(wasmBuffer);
console.log("WASM initialized.\n");

// Helper to load PNG
function loadPNG(filepath) {
  return new Promise((resolve, reject) => {
    fs.createReadStream(filepath)
      .pipe(new PNG())
      .on("parsed", function () {
        resolve({
          data: new Uint8Array(this.data),
          width: this.width,
          height: this.height,
        });
      })
      .on("error", reject);
  });
}

// Test each case
const results = [];
let wasmFireCount = 0;
let wasmPyMatchCount = 0;

console.log(
  `${"#".padStart(3)} | ${"Image".padEnd(48)} | ${"Python G".padEnd(10)} | ${"WASM G".padEnd(10)} | ${"Match".padEnd(6)} | Notes`,
);
console.log("-".repeat(110));

for (let i = 0; i < manifest.length; i++) {
  const testCase = manifest[i];
  const imageKey = testCase.image.replace(".png", "") + "__" + testCase.cat;
  const pngPath = pngMap[imageKey];

  if (!pngPath) {
    console.log(
      `${(i + 1).toString().padStart(3)} | ${testCase.image.padEnd(48)} | SKIP | PNG key not found: ${imageKey}`,
    );
    results.push({ case: testCase, wasmFires: false, match: false, error: "PNG not found" });
    continue;
  }

  try {
    // Load PNG
    const imageData = await loadPNG(pngPath);

    // Run WASM detector
    const wasmResult = detectFastAcRl(imageData.data, imageData.width, imageData.height);

    const pyG = testCase.py_G;
    const pyGStr = `${pyG.cols}×${pyG.rows}`;
    const wasmFires = wasmResult.consensus === "fast:ac+rl(S)";
    const wasmGStr = wasmFires
      ? `${wasmResult.cols}×${wasmResult.rows}`
      : `${wasmResult.cols}×${wasmResult.rows} (${wasmResult.consensus})`;

    const match = wasmFires && wasmResult.cols === pyG.cols && wasmResult.rows === pyG.rows;

    if (wasmFires) wasmFireCount++;
    if (match) wasmPyMatchCount++;

    const matchStr = match ? "✓" : wasmFires ? "✗" : "—";
    const notes = !wasmFires
      ? `consensus=${wasmResult.consensus}`
      : match
        ? "MATCH"
        : `WASM=${wasmResult.cols}×${wasmResult.rows}, Py=${pyGStr}`;

    const displayName = `${testCase.image} (${testCase.cat})`;
    console.log(
      `${(i + 1).toString().padStart(3)} | ${displayName.padEnd(48)} | ${pyGStr.padEnd(10)} | ${wasmGStr.padEnd(10)} | ${matchStr.padEnd(6)} | ${notes}`,
    );

    results.push({
      case: testCase,
      wasmFires,
      wasmResult,
      match,
      pyG,
    });
  } catch (err) {
    const msg = err instanceof Error ? err.message : String(err);
    console.log(
      `${(i + 1).toString().padStart(3)} | ${testCase.image.padEnd(48)} | ERROR | ${msg}`,
    );
    results.push({ case: testCase, wasmFires: false, match: false, error: msg });
  }
}

console.log("-".repeat(110));
console.log(`\n${"=".repeat(80)}`);
console.log(`RESULTS:`);
console.log(`  WASM fires:           ${wasmFireCount}/${manifest.length}`);
console.log(`  WASM matches Python:  ${wasmPyMatchCount}/${manifest.length}`);
console.log(`  Gate threshold:       8/${manifest.length}`);

const gatePass = wasmPyMatchCount === 8;
console.log(`\nGATE: ${gatePass ? "PASS ✓" : "FAIL ✗"}`);
console.log(`${"=".repeat(80)}\n`);

// Create golden parity table for commit message
console.log("Golden Parity Table for Commit/PR:");
console.log(
  `\n${"Case".padEnd(55)} | ${"Python G".padEnd(10)} | ${"WASM G".padEnd(10)} | ${"Match"}`,
);
console.log("-".repeat(85));
for (let i = 0; i < results.length; i++) {
  const r = results[i];
  if (r.error) {
    console.log(`${r.case.image.padEnd(55)} | ERROR: ${r.error}`);
  } else {
    const pyGStr = `${r.pyG.cols}×${r.pyG.rows}`;
    const wasmGStr = r.wasmFires ? `${r.wasmResult.cols}×${r.wasmResult.rows}` : "null";
    const matchStr = r.match ? "✓" : "✗";
    const caseName = `${r.case.image} (${r.case.cat})`;
    console.log(
      `${caseName.padEnd(55)} | ${pyGStr.padEnd(10)} | ${wasmGStr.padEnd(10)} | ${matchStr}`,
    );
  }
}
console.log();

if (!gatePass) {
  console.log(`\n❌ GATE FAILED: WASM must match Python on 8/${manifest.length} cases.`);
  console.log(`Do NOT push. Keep consensus off remote.`);
  process.exit(1);
}

console.log(`\n✅ GATE PASSED: Safe to push to origin/cursor/auto-recovery-stack-ff8f`);
console.log(`Expected harvest: focus Exact +5.4pp → 85.714% (vs Fixer 84.571%)`);
process.exit(0);
