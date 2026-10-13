#!/usr/bin/env node
// Pre-push gate. Phase 1: `pnpm run check` alongside one production site build
// (`check:deploy --build`). Phase 2: `test:ci`, `visual --prebuilt` (audits that build) and
// `check:deploy --prepare`, in parallel.
// The parallel steps' output is buffered and printed as one block per step, so logs never interleave.
// Nothing here is cached: every push runs all three. (Inside check, knip's --cache is keyed on file
// contents and only speeds up the analysis.) XPRITE_SKIP_VISUAL=1 still skips only the visual audits.
import { spawn } from "node:child_process";

const started = performance.now();
const seconds = (from) => `${((performance.now() - from) / 1000).toFixed(1)}s`;
const pnpm = process.platform === "win32" ? "pnpm.cmd" : "pnpm";

function run(script, { buffered, args = [] }) {
  const t0 = performance.now();
  const label = [script, ...args].join(" ");
  return new Promise((resolve) => {
    const child = spawn(pnpm, ["run", "--silent", script, ...args], {
      stdio: buffered ? ["ignore", "pipe", "pipe"] : "inherit",
      shell: process.platform === "win32",
      env: {
        ...process.env,
        FORCE_COLOR: process.env.FORCE_COLOR ?? (process.stdout.isTTY ? "1" : "0"),
      },
    });
    const chunks = [];
    if (buffered) {
      child.stdout.on("data", (c) => chunks.push(c));
      child.stderr.on("data", (c) => chunks.push(c));
    }
    child.on("close", (code) =>
      resolve({
        script: label,
        code: code ?? 1,
        output: Buffer.concat(chunks).toString(),
        time: seconds(t0),
      }),
    );
  });
}

const report = (results) => {
  let failed = 0;
  for (const result of results) {
    const status = result.code === 0 ? "passed" : `FAILED (exit ${result.code})`;
    console.log(`\n===== ${result.script}: ${status} in ${result.time} =====`);
    process.stdout.write(
      result.output.endsWith("\n") || !result.output ? result.output : `${result.output}\n`,
    );
    console.log(`===== end ${result.script} =====`);
    if (result.code !== 0) failed = failed || result.code;
  }
  return failed;
};

// Phase 1: static checks alongside the one production site build (deploy environment) that
// both the visual audits and deploy preparation use.
console.log("pre-push: [1/2] check in parallel with the site build (check:deploy --build)");
let failed = report(
  await Promise.all([
    run("check", { buffered: true }),
    run("check:deploy", { buffered: true, args: ["--build"] }),
  ]),
);
if (failed) {
  console.error(`pre-push: FAILED in ${seconds(started)}; tests and visual audits not run.`);
  process.exit(failed);
}
// Phase 2: unit tests, visual audits of the prebuilt site, and deploy preparation (which only
// reads .tmp/site) run together.
console.log("\npre-push: [2/2] test:ci, visual --prebuilt and check:deploy --prepare in parallel");
failed = report(
  await Promise.all([
    run("test:ci", { buffered: true }),
    run("visual", { buffered: true, args: ["--prebuilt"] }),
    run("check:deploy", { buffered: true, args: ["--prepare"] }),
  ]),
);
console.log(`\npre-push: ${failed ? "FAILED" : "all steps passed"} in ${seconds(started)} total.`);
process.exit(failed);
