#!/usr/bin/env node
// Content-hashed files of previous production releases (see infra/previous-release-assets.ts).
//   fetch                     download the asset archives of the last PREVIOUS_RELEASES_KEPT
//                             production releases from this repository's GitHub releases into
//                             .tmp/deploy/previous-assets (read-only; needs GH_TOKEN or GITHUB_TOKEN)
//   archive <site> <ref> <sha> [out]
//                             archive the immutable files of a built site, as deploy:prepare does
//                             for the release it prepares (for example to backfill an older tag)
import { mkdir, rm, writeFile } from "node:fs/promises";
import { join, resolve } from "node:path";
import { fileURLToPath } from "node:url";

import {
  ASSET_ARCHIVE_INDEX,
  PREVIOUS_RELEASES_KEPT,
  assetArchiveName,
  selectPreviousArchives,
  writeAssetArchive,
} from "../../infra/previous-release-assets.ts";

const repositoryRoot = fileURLToPath(new URL("../../", import.meta.url));
export const previousAssetsDirectory = join(repositoryRoot, ".tmp/deploy/previous-assets");
export const releaseAssetsDirectory = join(repositoryRoot, ".tmp/deploy/release-assets");
const GITHUB_API = "https://api.github.com";
const DEFAULT_REPOSITORY = "rhinoc/xprite";
const RELEASES_PER_PAGE = 100;
const MAX_RELEASE_PAGES = 5;
const REQUEST_ATTEMPTS = 3;
const RETRY_MS = 2_000;

function githubHeaders(accept) {
  const token = process.env.GH_TOKEN?.trim() || process.env.GITHUB_TOKEN?.trim();
  return {
    Accept: accept,
    "X-GitHub-Api-Version": "2022-11-28",
    "User-Agent": "xprite-deploy",
    ...(token ? { Authorization: `Bearer ${token}` } : {}),
  };
}

async function request(url, accept) {
  let lastError;
  for (let attempt = 1; attempt <= REQUEST_ATTEMPTS; attempt++) {
    try {
      const response = await fetch(url, { headers: githubHeaders(accept) });
      if (response.ok) return response;
      lastError = new Error(`GitHub returned HTTP ${response.status} for ${url}.`);
      if (response.status < 500 && response.status !== 429) break;
    } catch (error) {
      lastError = error;
    }
    if (attempt < REQUEST_ATTEMPTS) await new Promise((done) => setTimeout(done, RETRY_MS));
  }
  throw lastError;
}

async function listReleases(repository) {
  const releases = [];
  for (let page = 1; page <= MAX_RELEASE_PAGES; page++) {
    const url = `${GITHUB_API}/repos/${repository}/releases?per_page=${RELEASES_PER_PAGE}&page=${page}`;
    const batch = await (await request(url, "application/vnd.github+json")).json();
    releases.push(...batch);
    if (batch.length < RELEASES_PER_PAGE) break;
  }
  return releases;
}

/** Download the archives the next deploy:prepare carries over. Fewer (or none) is fine. */
export async function fetchPreviousAssets({
  repository = process.env.GITHUB_REPOSITORY || DEFAULT_REPOSITORY,
  currentRef = process.env.DEPLOY_REF?.trim() ?? "",
  directory = previousAssetsDirectory,
} = {}) {
  const selected = selectPreviousArchives(await listReleases(repository), currentRef);
  await rm(directory, { recursive: true, force: true });
  await mkdir(directory, { recursive: true });
  for (const archive of selected) {
    const response = await request(archive.url, "application/octet-stream");
    const bytes = Buffer.from(await response.arrayBuffer());
    if (bytes.length !== archive.size)
      throw new Error(`${archive.name}: downloaded ${bytes.length} of ${archive.size} bytes.`);
    await writeFile(join(directory, archive.name), bytes);
  }
  await writeFile(
    join(directory, ASSET_ARCHIVE_INDEX),
    `${JSON.stringify(
      selected.map(({ ref, name, uploadedAt, size }) => ({ ref, name, uploadedAt, size })),
      null,
      2,
    )}\n`,
  );
  console.log(
    selected.length
      ? `Previous release assets: ${selected.map(({ ref }) => ref).join(", ")} (up to ${PREVIOUS_RELEASES_KEPT}).`
      : "Previous release assets: no archived production release yet; nothing will be carried over.",
  );
  return selected;
}

if (process.argv[1] && resolve(process.argv[1]) === fileURLToPath(import.meta.url)) {
  const [command, ...args] = process.argv.slice(2);
  try {
    if (command === "fetch") await fetchPreviousAssets();
    else if (command === "archive") {
      const [site, ref, release, out = releaseAssetsDirectory] = args;
      if (!site || !ref || !release) throw new Error("Use archive <site> <ref> <sha> [out].");
      const path = join(resolve(out), assetArchiveName(ref));
      const manifest = await writeAssetArchive(resolve(site), path, { ref, release });
      console.log(`Archived ${manifest.files.length} immutable files of ${ref} in ${path}.`);
    } else throw new Error("Use fetch, or archive <site> <ref> <sha> [out].");
  } catch (error) {
    console.error(error instanceof Error ? error.message : String(error));
    process.exitCode = 1;
  }
}
