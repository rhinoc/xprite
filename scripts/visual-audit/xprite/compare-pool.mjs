// Runs compareCase for many ids across worker threads (one per CPU, at most one per case).
// PNG decoding dominates comparison time and every case is independent.
import os from "node:os";
import { Worker, isMainThread, parentPort, workerData } from "node:worker_threads";

import { compareCase } from "./compare-case.mjs";

if (!isMainThread) {
  const { baseline, candidate, baselineDir, candidateDir } = workerData;
  parentPort.on("message", ({ index, id }) => {
    try {
      parentPort.postMessage({
        index,
        result: compareCase(baseline, candidate, baselineDir, candidateDir, id),
      });
    } catch (error) {
      parentPort.postMessage({
        index,
        error: error instanceof Error ? error.message : String(error),
      });
    }
  });
}

export async function compareCases(baseline, candidate, baselineDir, candidateDir, ids) {
  const size = Math.max(1, Math.min(ids.length, os.availableParallelism()));
  const results = Array.from({ length: ids.length });
  let next = 0;
  let failure = null;
  await Promise.all(
    Array.from({ length: size }, async () => {
      const worker = new Worker(new URL(import.meta.url), {
        workerData: { baseline, candidate, baselineDir, candidateDir },
      });
      try {
        while (next < ids.length && !failure) {
          const index = next++;
          const reply = await new Promise((resolve, reject) => {
            worker.once("message", resolve);
            worker.once("error", reject);
            worker.postMessage({ index, id: ids[index] });
          });
          if (reply.error) failure = Error(reply.error);
          else results[reply.index] = reply.result;
        }
      } finally {
        await worker.terminate();
      }
    }),
  );
  if (failure) throw failure;
  return results;
}
