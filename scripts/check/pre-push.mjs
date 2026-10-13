#!/usr/bin/env node
// Pre-push gate: `pnpm run check`, then `pnpm run test:ci`, `pnpm run visual` and
// `pnpm run check:deploy` (the deploy workflow's build and validation); tests run alongside.
// The parallel steps' output is buffered and printed as one block per step, so logs never interleave.
// Nothing here is cached: every push runs all three. (Inside check, knip's --cache is keyed on file
// contents and only speeds up the analysis.) XPRITE_SKIP_VISUAL=1 still skips only the visual audits.
import { spawn } from "node:child_process";

const started = performance.now();
const seconds = (from) => `${((performance.now() - from) / 1000).toFixed(1)}s`;
const pnpm = process.platform === "win32" ? "pnpm.cmd" : "pnpm";

function run(script, { buffered }) {
  const t0 = performance.now();
  return new Promise((resolve) => {
    const child = spawn(pnpm, ["run", "--silent", script], {
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
        script,
        code: code ?? 1,
        output: Buffer.concat(chunks).toString(),
        time: seconds(t0),
      }),
    );
  });
}

console.log("pre-push: [1/2] pnpm run check");
const check = await run("check", { buffered: false });
if (check.code !== 0) {
  console.error(`pre-push: check failed after ${check.time}; tests and visual audits not run.`);
  process.exit(check.code);
}
console.log(`pre-push: check passed in ${check.time}`);
console.log(
  "pre-push: [2/2] test:ci in parallel with visual, then check:deploy (output grouped per step)",
);

// check:deploy rebuilds outputs that the visual audits' dev server serves, so it starts once
// visual is done; unit tests run alongside both.
const pending = [
  run("test:ci", { buffered: true }),
  run("visual", { buffered: true }).then(async (visual) => [
    visual,
    await run("check:deploy", { buffered: true }),
  ]),
];
let failed = 0;
for (const result of (await Promise.all(pending)).flat()) {
  const status = result.code === 0 ? "passed" : `FAILED (exit ${result.code})`;
  console.log(`\n===== ${result.script}: ${status} in ${result.time} =====`);
  process.stdout.write(
    result.output.endsWith("\n") || !result.output ? result.output : `${result.output}\n`,
  );
  console.log(`===== end ${result.script} =====`);
  if (result.code !== 0) failed = failed || result.code;
}
console.log(`\npre-push: ${failed ? "FAILED" : "all steps passed"} in ${seconds(started)} total.`);
process.exit(failed);
