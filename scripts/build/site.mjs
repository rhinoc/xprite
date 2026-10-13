#!/usr/bin/env node
// Production site build (pnpm run build:site), always fresh. @xprite/ui and the shared type
// projects (bedrock, editor-core, editor-ui) build once, serially, because every app reads them.
// Then the four apps build in parallel; each writes only its own dist. XPRITE_UI_BUILT=1 tells
// the apps' prebuild hooks that ui is already built in this run (it is never persisted). Each
// lane's output goes to .tmp/build-logs/<lane>.log for the SSR-warning check, and is printed
// as one block per lane. The output is then assembled into .tmp/site.
import { spawn } from "node:child_process";
import { mkdirSync, writeFileSync } from "node:fs";
import path from "node:path";
import { fileURLToPath } from "node:url";

const root = path.resolve(path.dirname(fileURLToPath(import.meta.url)), "../..");
const pnpm = process.platform === "win32" ? "pnpm.cmd" : "pnpm";
const logs = path.join(root, ".tmp/build-logs");
mkdirSync(logs, { recursive: true });
const env = { ...process.env, XPRITE_UI_BUILT: "1" };
const started = performance.now();
const secs = (t) => `${((performance.now() - t) / 1000).toFixed(1)}s`;

function step(command, args) {
  return new Promise((resolve) => {
    const child = spawn(command, args, {
      cwd: root,
      env,
      stdio: ["ignore", "pipe", "pipe"],
      shell: process.platform === "win32",
    });
    let output = "";
    child.stdout.on("data", (c) => (output += c));
    child.stderr.on("data", (c) => (output += c));
    child.on("error", (error) => resolve({ code: 1, output: output + error.message }));
    child.on("close", (code) => resolve({ code: code ?? 1, output }));
  });
}

async function lane(name, steps) {
  const t0 = performance.now();
  let output = "";
  for (const [command, ...args] of steps) {
    output += `$ ${[command, ...args].join(" ")}\n`;
    const result = await step(command, args);
    output += result.output;
    if (result.code !== 0) {
      writeFileSync(path.join(logs, `${name}.log`), output);
      return { name, code: result.code, output, time: secs(t0) };
    }
  }
  writeFileSync(path.join(logs, `${name}.log`), output);
  return { name, code: 0, output, time: secs(t0) };
}

function print({ name, code, output, time }) {
  console.log(`--- build ${name}: ${code ? `FAILED (exit ${code})` : "ok"} in ${time} ---`);
  process.stdout.write(output.endsWith("\n") || !output ? output : `${output}\n`);
}

const filter = (pkg) => [pnpm, "--filter", pkg, "run", "build"];
const tsc = (project) => [path.join(root, "node_modules/.bin/tsc"), "-b", project];
const stages = [
  [
    [
      "shared",
      [
        filter("@xprite/ui"),
        filter("@xprite/bedrock"),
        filter("@xprite/editor-core"),
        tsc("packages/editor-ui/tsconfig.json"),
      ],
    ],
  ],
  [
    ["editor", [filter("@xprite/editor-app"), [pnpm, "run", "telemetry:sourcemaps"]]],
    ["growth", [filter("@xprite/growth-app")]],
    ["tools", [filter("@xprite/tools-app")]],
    ["components", [filter("@xprite/components-app")]],
  ],
  [
    [
      "assemble",
      [[process.execPath, "--experimental-transform-types", "scripts/deploy/assemble-site.mjs"]],
    ],
  ],
];
for (const lanes of stages) {
  const results = await Promise.all(lanes.map(([name, steps]) => lane(name, steps)));
  results.forEach(print);
  const failed = results.find((r) => r.code);
  if (failed) {
    console.error(`build:site: ${failed.name} failed after ${secs(started)}.`);
    process.exit(failed.code);
  }
}
console.log(`build:site: built in ${secs(started)}.`);
