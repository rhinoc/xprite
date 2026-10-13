// Runs one Node script once per item in parallel child processes (a few at a time), for checks
// whose items are independent and each slow (a TypeScript program, a dependency-cruiser run).
import { spawn } from "node:child_process";
import os from "node:os";

export const fanOutJobs = () =>
  Number(process.env.XPRITE_FANOUT_JOBS) ||
  Math.max(1, Math.min(4, Math.floor((os.availableParallelism?.() ?? os.cpus().length) / 2)));

export async function fanOut(
  script,
  items,
  argsFor,
  { cwd, env, concurrency = fanOutJobs() } = {},
) {
  const queue = items.map((item, index) => ({ item, index }));
  const results = Array.from({ length: items.length });
  const runOne = ({ item, index }) =>
    new Promise((resolve) => {
      const child = spawn(process.execPath, [script, ...argsFor(item)], {
        cwd,
        env: { ...process.env, ...env?.(item) },
        stdio: ["ignore", "pipe", "pipe"],
      });
      let stdout = "";
      let stderr = "";
      child.stdout.on("data", (c) => (stdout += c));
      child.stderr.on("data", (c) => (stderr += c));
      child.on("error", (error) => (stderr += error.message));
      child.on("close", (code) =>
        resolve((results[index] = { item, code: code ?? 1, stdout, stderr })),
      );
    });
  await Promise.all(
    Array.from({ length: Math.min(concurrency, queue.length) }, async () => {
      while (queue.length) await runOne(queue.shift());
    }),
  );
  return results;
}
