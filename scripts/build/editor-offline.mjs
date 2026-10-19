#!/usr/bin/env node
// Editor offline manifest tooling.
//   seal [dir]   re-hash the final editor output and rewrite the sw.js manifest, then verify.
//                Run after anything that rewrites built files (PostHog source map injection).
//   verify [dir] re-hash the output against the manifest; exit 1 on any mismatch.
// Default directory: apps/editor/dist. Pass .tmp/site to check an assembled deployment.
import { readFile } from "node:fs/promises";
import { resolve } from "node:path";
import { fileURLToPath } from "node:url";

import {
  describeOfflineReport,
  readOfflineManifest,
  verifyOfflineManifest,
  writeOfflineManifest,
} from "../../apps/editor/build/offline-manifest.ts";

const repositoryRoot = fileURLToPath(new URL("../../", import.meta.url));

export async function verifyEditorOffline(directory, label = directory) {
  const report = await verifyOfflineManifest(directory);
  if (report.mismatches.length || report.unlisted.length) {
    const sample = report.mismatches
      .slice(0, 10)
      .map((entry) => `  ${entry.reason}: ${entry.url}`)
      .join("\n");
    throw new Error(
      `Service worker offline manifest does not match ${label}: ${describeOfflineReport(report)}.\n` +
        `${sample}\nThe worker would reject its precache (SRI) and offline mode would never become ready.`,
    );
  }
  return report;
}

if (process.env.XPRITE_DISTRIBUTION === "itch" && process.argv[2] === "seal") {
  // The itch.io build ships no service worker.
  console.log("editor offline: itch.io distribution has no service worker; nothing to seal.");
} else if (process.argv[1] && resolve(process.argv[1]) === fileURLToPath(import.meta.url)) {
  const [mode, directoryArgument] = process.argv.slice(2);
  const directory = resolve(repositoryRoot, directoryArgument ?? "apps/editor/dist");
  try {
    if (mode === "seal") {
      await readFile(resolve(directory, "sw.js"), "utf8");
      const { shell } = await readOfflineManifest(directory);
      const { entries } = await writeOfflineManifest(directory, shell);
      console.log(`editor offline: sealed ${entries} entries from final bytes in ${directory}.`);
    } else if (mode !== "verify") throw new Error("Use seal [dir] or verify [dir].");
    const report = await verifyEditorOffline(directory);
    console.log(`editor offline: ${describeOfflineReport(report)} (${directory}).`);
  } catch (error) {
    console.error(error instanceof Error ? error.message : error);
    process.exit(1);
  }
}
