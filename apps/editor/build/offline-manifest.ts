import { createHash } from "node:crypto";
import { readFile, readdir, writeFile } from "node:fs/promises";
import { resolve } from "node:path";

const WORKER_FILENAME = "sw.js";
export const OFFLINE_SHELL_PREFIX = "editor-offline-";
export const BUILD_PLACEHOLDER = "const OFFLINE_BUILD = null;";
const BUILD_ASSIGNMENT = /^const OFFLINE_BUILD = (\{.*\});$/m;
const OFFLINE_RESOURCE_PATTERN =
  /\.(?:js|mjs|css|json|webmanifest|png|jpe?g|webp|gif|svg|ico|woff2?|ttf|otf|wasm|bin|icc|ase|aseprite|gpl|pal)$/i;
const HASH_ALGORITHM = "sha256";

interface OfflineEntry {
  url: string;
  integrity: string;
}

interface OfflineBuild {
  version: string;
  shell: string;
  entries: OfflineEntry[];
}

interface OfflineManifestMismatch {
  url: string;
  reason: "missing" | "integrity";
}

export interface OfflineManifestReport {
  total: number;
  mismatches: OfflineManifestMismatch[];
  /** Files that would be precached but are not listed in the manifest. */
  unlisted: string[];
}

async function outputFiles(directory: string, prefix = ""): Promise<string[]> {
  const files = await readdir(directory, { withFileTypes: true });
  const nested = await Promise.all(
    files.map(async (file) => {
      const relative = `${prefix}${file.name}`;
      if (file.isDirectory()) return outputFiles(resolve(directory, file.name), `${relative}/`);
      return file.isFile() ? [relative] : [];
    }),
  );
  return nested.flat();
}

function integrityOf(bytes: Uint8Array): string {
  return `${HASH_ALGORITHM}-${createHash(HASH_ALGORITHM).update(bytes).digest("base64")}`;
}

async function precachedResources(outputDirectory: string, shell: string): Promise<string[]> {
  const files = await outputFiles(outputDirectory);
  return files
    .filter(
      (file) =>
        file !== WORKER_FILENAME &&
        !file.startsWith("LICENSES/") &&
        !file.startsWith(OFFLINE_SHELL_PREFIX) &&
        !file.endsWith(".map") &&
        (file.startsWith("assets/") || OFFLINE_RESOURCE_PATTERN.test(file)),
    )
    .concat(shell)
    .sort();
}

/** Hash the final bytes in the output directory and write the manifest into sw.js. */
export async function writeOfflineManifest(
  outputDirectory: string,
  shell: string,
): Promise<{ entries: number }> {
  const workerPath = resolve(outputDirectory, WORKER_FILENAME);
  const workerSource = await readFile(workerPath, "utf8");
  // Re-sealing replaces the previous manifest, so the version depends only on the source.
  const template = BUILD_ASSIGNMENT.test(workerSource)
    ? workerSource.replace(BUILD_ASSIGNMENT, BUILD_PLACEHOLDER)
    : workerSource;
  if (!template.includes(BUILD_PLACEHOLDER))
    throw new Error("Missing editor offline worker build placeholder");
  const resources = await precachedResources(outputDirectory, shell);
  const entries: OfflineEntry[] = await Promise.all(
    resources.map(async (file) => ({
      url: file,
      integrity: integrityOf(await readFile(resolve(outputDirectory, file))),
    })),
  );
  const version = createHash(HASH_ALGORITHM)
    .update(template)
    .update(JSON.stringify(entries))
    .digest("hex");
  const build: OfflineBuild = { version, shell, entries };
  await writeFile(
    workerPath,
    template.replace(BUILD_PLACEHOLDER, `const OFFLINE_BUILD = ${JSON.stringify(build)};`),
  );
  return { entries: entries.length };
}

export async function readOfflineManifest(outputDirectory: string): Promise<OfflineBuild> {
  const source = await readFile(resolve(outputDirectory, WORKER_FILENAME), "utf8");
  const match = BUILD_ASSIGNMENT.exec(source);
  if (!match) throw new Error("sw.js has no embedded offline manifest.");
  return JSON.parse(match[1]) as OfflineBuild;
}

/** Re-hash the built output against the manifest the service worker will enforce. */
export async function verifyOfflineManifest(
  outputDirectory: string,
): Promise<OfflineManifestReport> {
  const build = await readOfflineManifest(outputDirectory);
  if (!build.entries.length) throw new Error("The offline manifest is empty.");
  const mismatches: OfflineManifestMismatch[] = [];
  await Promise.all(
    build.entries.map(async (entry) => {
      let bytes: Buffer;
      try {
        bytes = await readFile(resolve(outputDirectory, decodeURIComponent(entry.url)));
      } catch {
        mismatches.push({ url: entry.url, reason: "missing" });
        return;
      }
      if (integrityOf(bytes) !== entry.integrity)
        mismatches.push({ url: entry.url, reason: "integrity" });
    }),
  );
  mismatches.sort((a, b) => a.url.localeCompare(b.url));
  const listed = new Set(build.entries.map((entry) => entry.url));
  const unlisted = (await precachedResources(outputDirectory, build.shell)).filter(
    (file) => !listed.has(file),
  );
  return { total: build.entries.length, mismatches, unlisted };
}

export function describeOfflineReport(report: OfflineManifestReport): string {
  return `${report.mismatches.length}/${report.total} offline manifest entries mismatch, ${report.unlisted.length} unlisted`;
}
