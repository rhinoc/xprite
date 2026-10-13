// Runs pnpm scripts in parallel with buffered output, then prints one block per script with its
// time, so parallel logs never interleave. Used by the pre-push hook.
import { spawn } from "node:child_process";

export const seconds = (from) => `${((performance.now() - from) / 1000).toFixed(1)}s`;
const pnpm = process.platform === "win32" ? "pnpm.cmd" : "pnpm";

export function run(script, { buffered, args = [], env = {} }) {
  const t0 = performance.now();
  const label = [script, ...args].join(" ");
  return new Promise((resolve) => {
    const child = spawn(pnpm, ["run", "--silent", script, ...args], {
      stdio: buffered ? ["ignore", "pipe", "pipe"] : "inherit",
      shell: process.platform === "win32",
      env: {
        ...process.env,
        ...env,
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

export const report = (results) => {
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
