/**
 * Immutable build files carried over from previous production releases.
 *
 * Every EdgeOne upload replaces the whole site. A tab that is still running an older release
 * lazy-loads chunks, workers and wasm by their content-hashed names, and those names are gone
 * from the new upload. Each production deployment therefore archives its own content-hashed
 * files (`writeAssetArchive`), the release workflow attaches that archive to the tag's GitHub
 * release, and the next deployments merge the archives of the last `PREVIOUS_RELEASES_KEPT`
 * releases into their upload (`carryOverPreviousAssets`).
 *
 * Only files that Vite or an asset store named after their content are carried. Pages, the
 * service worker, manifests, release metadata and every other stable-name file always come
 * from the new build, and a carried file never replaces a file of the new build.
 */
import { execFile } from "node:child_process";
import { createHash } from "node:crypto";
import {
  copyFile,
  lstat,
  mkdir,
  mkdtemp,
  readFile,
  readdir,
  rm,
  writeFile,
} from "node:fs/promises";
import { tmpdir } from "node:os";
import { dirname, join, relative, resolve, sep } from "node:path";
import { promisify } from "node:util";

/** Previous production releases whose content-hashed files each deployment keeps serving. */
export const PREVIOUS_RELEASES_KEPT = 3;
const ASSET_ARCHIVE_PREFIX = "xprite-hashed-assets-";
const ASSET_ARCHIVE_EXTENSION = ".tar.gz";
/** Written next to downloaded archives; lists them newest deployment first. */
export const ASSET_ARCHIVE_INDEX = "index.json";
const ARCHIVE_MANIFEST = "manifest.json";
const ARCHIVE_FILES = "files";
const ARCHIVE_SCHEMA = 1;
const HASH_ALGORITHM = "sha256";
const REF_PATTERN = /^[A-Za-z0-9][A-Za-z0-9._-]*$/;
const RELEASE_PATTERN = /^[a-f0-9]{40}$/;
/** Output folders that hold only content-addressed files: Vite `assetsDir` and SSG asset stores. */
const IMMUTABLE_DIRECTORY_SEGMENTS = new Set(["assets", "ssg-assets"]);
/** Vite/Rolldown output names: `name-<8 character hash>.ext`. */
const VITE_HASHED_NAME = /^[^/]+-[A-Za-z0-9_-]{8}\.[A-Za-z0-9]+$/;
/** Asset stores (`<sha256 hex>.ext`). */
const DIGEST_NAME = /^[0-9a-f]{64}\.[A-Za-z0-9]+$/;
/** Never carried, whatever their name: documents, manifests and metadata describe one release. */
const RELEASE_SPECIFIC_EXTENSIONS = /\.(?:html?|json|webmanifest|map|xml|txt|md)$/i;
const STABLE_NAMES = new Set([
  "sw.js",
  "release.json",
  "edgeone.json",
  "middleware.js",
  "sitemap.xml",
  "robots.txt",
  "manifest.webmanifest",
]);

const execFileAsync = promisify(execFile);

interface AssetArchiveFile {
  /** Site-relative path with `/` separators, such as `assets/editor-index-BwuJOsYd.js`. */
  path: string;
  sha256: string;
  size: number;
}

export interface AssetArchiveManifest {
  schema: typeof ARCHIVE_SCHEMA;
  /** Deployed tag (or short commit for an untagged deployment). */
  ref: string;
  /** Full commit SHA of the deployed build. */
  release: string;
  createdAt: string;
  files: AssetArchiveFile[];
}

export function assetArchiveName(ref: string): string {
  if (!REF_PATTERN.test(ref))
    throw new Error(`Unsupported release ref for an asset archive: ${ref}`);
  return `${ASSET_ARCHIVE_PREFIX}${ref}${ASSET_ARCHIVE_EXTENSION}`;
}

/** Whether a site path is an immutable, content-hashed build file that may be carried over. */
export function isImmutableAsset(path: string): boolean {
  const parts = path.split("/");
  const name = parts.at(-1) ?? "";
  if (path.startsWith("/") || parts.some((part) => !part || part === "." || part === ".."))
    return false;
  if (STABLE_NAMES.has(name) || name.startsWith(".") || RELEASE_SPECIFIC_EXTENSIONS.test(name))
    return false;
  if (!parts.slice(0, -1).some((part) => IMMUTABLE_DIRECTORY_SEGMENTS.has(part))) return false;
  return VITE_HASHED_NAME.test(name) || DIGEST_NAME.test(name);
}

function digest(bytes: Uint8Array): string {
  return createHash(HASH_ALGORITHM).update(bytes).digest("hex");
}

async function siteFiles(directory: string): Promise<string[]> {
  const entries = await readdir(directory, { recursive: true, withFileTypes: true });
  return entries
    .filter((entry) => entry.isFile())
    .map((entry) => relative(directory, join(entry.parentPath, entry.name)).split(sep).join("/"))
    .sort();
}

/** The immutable files of one built site, with their digests. */
async function collectImmutableAssets(siteDirectory: string): Promise<AssetArchiveFile[]> {
  const root = resolve(siteDirectory);
  const paths = (await siteFiles(root)).filter(isImmutableAsset);
  return Promise.all(
    paths.map(async (path) => {
      const bytes = await readFile(join(root, path));
      return { path, sha256: digest(bytes), size: bytes.length };
    }),
  );
}

async function tar(args: string[]) {
  await execFileAsync("tar", args, { maxBuffer: 16 * 1024 * 1024 });
}

/**
 * Archive the immutable files of a built site (`.tmp/site`, before any carry-over) for later
 * deployments. Returns the manifest written into the archive.
 */
export async function writeAssetArchive(
  siteDirectory: string,
  archivePath: string,
  {
    ref,
    release,
    createdAt = new Date().toISOString(),
  }: { ref: string; release: string; createdAt?: string },
): Promise<AssetArchiveManifest> {
  assetArchiveName(ref);
  if (!RELEASE_PATTERN.test(release))
    throw new Error("An asset archive needs the full commit SHA.");
  const files = await collectImmutableAssets(siteDirectory);
  const manifest: AssetArchiveManifest = { schema: ARCHIVE_SCHEMA, ref, release, createdAt, files };
  const staging = await mkdtemp(join(tmpdir(), "xprite-asset-archive-"));
  try {
    for (const { path } of files) {
      const target = join(staging, ARCHIVE_FILES, path);
      await mkdir(dirname(target), { recursive: true });
      await copyFile(join(siteDirectory, path), target);
    }
    await mkdir(join(staging, ARCHIVE_FILES), { recursive: true });
    await writeFile(join(staging, ARCHIVE_MANIFEST), `${JSON.stringify(manifest, null, 2)}\n`);
    await mkdir(dirname(resolve(archivePath)), { recursive: true });
    await tar(["-czf", resolve(archivePath), "-C", staging, ARCHIVE_MANIFEST, ARCHIVE_FILES]);
  } finally {
    await rm(staging, { recursive: true, force: true });
  }
  return manifest;
}

function parseManifest(source: string, archive: string): AssetArchiveManifest {
  const manifest = JSON.parse(source) as AssetArchiveManifest;
  if (
    manifest?.schema !== ARCHIVE_SCHEMA ||
    typeof manifest.ref !== "string" ||
    !REF_PATTERN.test(manifest.ref) ||
    typeof manifest.release !== "string" ||
    !RELEASE_PATTERN.test(manifest.release) ||
    !Array.isArray(manifest.files)
  )
    throw new Error(`${archive}: unsupported asset archive manifest.`);
  return manifest;
}

/**
 * Extract one archive into `directory` and prove it: every listed file is an immutable asset
 * whose bytes match its digest, and the archive holds nothing else (no links, no extra files).
 */
export async function extractAssetArchive(
  archivePath: string,
  directory: string,
): Promise<AssetArchiveManifest> {
  const label = archivePath.split(sep).pop() ?? archivePath;
  await mkdir(directory, { recursive: true });
  await tar([
    "-xzf",
    resolve(archivePath),
    "-C",
    directory,
    "--no-same-owner",
    "--no-same-permissions",
  ]);
  const manifest = parseManifest(await readFile(join(directory, ARCHIVE_MANIFEST), "utf8"), label);
  const root = join(directory, ARCHIVE_FILES);
  const listed = new Set<string>();
  for (const file of manifest.files) {
    if (!isImmutableAsset(file.path))
      throw new Error(`${label}: ${file.path} is not an immutable content-hashed asset.`);
    if (listed.has(file.path)) throw new Error(`${label}: ${file.path} is listed twice.`);
    listed.add(file.path);
    const path = join(root, file.path);
    if (!(await lstat(path)).isFile()) throw new Error(`${label}: ${file.path} is not a file.`);
    if (digest(await readFile(path)) !== file.sha256)
      throw new Error(`${label}: ${file.path} does not match its digest.`);
  }
  const entries = await readdir(directory, { recursive: true, withFileTypes: true });
  for (const entry of entries) {
    const path = relative(directory, join(entry.parentPath, entry.name)).split(sep).join("/");
    if (entry.isDirectory()) continue;
    if (!entry.isFile()) throw new Error(`${label}: ${path} is not a regular file.`);
    if (path === ARCHIVE_MANIFEST) continue;
    if (!path.startsWith(`${ARCHIVE_FILES}/`) || !listed.has(path.slice(ARCHIVE_FILES.length + 1)))
      throw new Error(`${label}: ${path} is not listed in the archive manifest.`);
  }
  return manifest;
}

interface CarriedRelease {
  ref: string;
  release: string;
  /** Files this release added to the upload. */
  added: number;
  addedBytes: number;
  /** Files already present with identical bytes (unchanged between releases). */
  identical: number;
  /** Same name but different bytes; the newer copy was kept. */
  kept: string[];
}

export interface CarryOverReport {
  releases: CarriedRelease[];
  /** Site paths of every carried file, sorted. */
  carried: string[];
  carriedBytes: number;
}

interface ArchiveIndexEntry {
  name: string;
}

async function archiveNames(directory: string): Promise<string[]> {
  try {
    return (await readdir(directory)).filter(
      (name) => name.startsWith(ASSET_ARCHIVE_PREFIX) && name.endsWith(ASSET_ARCHIVE_EXTENSION),
    );
  } catch (error) {
    if ((error as NodeJS.ErrnoException).code === "ENOENT") return [];
    throw error;
  }
}

/** Position of each archive in the downloaded `index.json` (newest deployment first). */
async function indexOrder(directory: string): Promise<Map<string, number>> {
  try {
    const index = JSON.parse(
      await readFile(join(directory, ASSET_ARCHIVE_INDEX), "utf8"),
    ) as ArchiveIndexEntry[];
    return new Map(index.map(({ name }, position) => [name, position]));
  } catch (error) {
    if ((error as NodeJS.ErrnoException).code === "ENOENT") return new Map();
    throw error;
  }
}

interface ExtractedArchive {
  name: string;
  directory: string;
  manifest: AssetArchiveManifest;
}

/**
 * Copy the immutable files of up to `limit` previous releases into a prepared deployment.
 * Archives are applied newest deployment first (`index.json` order, else archive time). A path
 * that already exists (the new build, or a newer release) is never replaced: identical bytes are
 * counted, different bytes keep the existing copy. Archives of the release being deployed are
 * ignored. With no archives (the first deployment) nothing is carried.
 */
export async function carryOverPreviousAssets(
  deploymentDirectory: string,
  archiveDirectory: string,
  {
    currentRelease,
    currentRef,
    limit = PREVIOUS_RELEASES_KEPT,
  }: { currentRelease: string; currentRef?: string; limit?: number },
): Promise<CarryOverReport> {
  const root = resolve(deploymentDirectory);
  const releases: CarriedRelease[] = [];
  const carried: string[] = [];
  let carriedBytes = 0;
  const scratch = await mkdtemp(join(tmpdir(), "xprite-previous-assets-"));
  try {
    const order = await indexOrder(archiveDirectory);
    const archives: ExtractedArchive[] = [];
    for (const [position, name] of (await archiveNames(archiveDirectory)).entries()) {
      const directory = join(scratch, String(position));
      const manifest = await extractAssetArchive(join(archiveDirectory, name), directory);
      if (manifest.release === currentRelease || manifest.ref === currentRef) continue;
      archives.push({ name, directory, manifest });
    }
    archives.sort(
      (left, right) =>
        (order.get(left.name) ?? Number.MAX_SAFE_INTEGER) -
          (order.get(right.name) ?? Number.MAX_SAFE_INTEGER) ||
        right.manifest.createdAt.localeCompare(left.manifest.createdAt),
    );
    for (const { name, directory, manifest } of archives) {
      if (releases.length >= limit) break;
      if (releases.some(({ release }) => release === manifest.release)) continue;
      const summary: CarriedRelease = {
        ref: manifest.ref,
        release: manifest.release,
        added: 0,
        addedBytes: 0,
        identical: 0,
        kept: [],
      };
      for (const file of manifest.files) {
        const target = resolve(root, file.path);
        if (!target.startsWith(`${root}${sep}`))
          throw new Error(`${name}: ${file.path} escapes the site.`);
        let existing: Buffer | undefined;
        try {
          existing = await readFile(target);
        } catch (error) {
          if ((error as NodeJS.ErrnoException).code !== "ENOENT") throw error;
        }
        if (existing) {
          if (digest(existing) === file.sha256) summary.identical++;
          else summary.kept.push(file.path);
          continue;
        }
        await mkdir(dirname(target), { recursive: true });
        await copyFile(join(directory, ARCHIVE_FILES, file.path), target);
        summary.added++;
        summary.addedBytes += file.size;
        carried.push(file.path);
        carriedBytes += file.size;
      }
      releases.push(summary);
    }
  } finally {
    await rm(scratch, { recursive: true, force: true });
  }
  return { releases, carried: carried.sort(), carriedBytes };
}

interface ReleaseAsset {
  id: number;
  name: string;
  state?: string;
  updated_at: string;
  url: string;
  size: number;
}

export interface Release {
  tag_name: string;
  draft?: boolean;
  assets: ReleaseAsset[];
}

export interface SelectedArchive {
  ref: string;
  name: string;
  uploadedAt: string;
  url: string;
  size: number;
}

/**
 * The asset archives of the most recent previous production deployments. An archive is
 * uploaded only after a verified production deployment, so its upload time orders releases
 * by when they were last live, including redeployments of an older tag.
 */
export function selectPreviousArchives(
  releases: readonly Release[],
  currentRef: string,
  limit = PREVIOUS_RELEASES_KEPT,
): SelectedArchive[] {
  return releases
    .filter((release) => release.tag_name !== currentRef && REF_PATTERN.test(release.tag_name))
    .flatMap((release) => {
      const name = assetArchiveName(release.tag_name);
      const asset = release.assets.find(
        (candidate) => candidate.name === name && (candidate.state ?? "uploaded") === "uploaded",
      );
      return asset
        ? [
            {
              ref: release.tag_name,
              name,
              uploadedAt: asset.updated_at,
              url: asset.url,
              size: asset.size,
            },
          ]
        : [];
    })
    .sort((left, right) => right.uploadedAt.localeCompare(left.uploadedAt))
    .slice(0, limit);
}

/** EdgeOne Makers project limits (https://pages.edgeone.ai/document/limits-and-quotas). */
const EDGEONE_MAX_FILES = 20_000;
const EDGEONE_MAX_FILE_BYTES = 25 * 1024 * 1024;
export const EDGEONE_MAX_EDGE_FUNCTION_BYTES = 5 * 1024 * 1024;

/** Fails before upload when the prepared package breaks a per-project file limit. */
export async function assertEdgeOneUploadLimits(
  directory: string,
): Promise<{ files: number; bytes: number }> {
  const root = resolve(directory);
  const paths = await siteFiles(root);
  if (paths.length > EDGEONE_MAX_FILES)
    throw new Error(
      `The deployment has ${paths.length} files; EdgeOne accepts at most ${EDGEONE_MAX_FILES}.`,
    );
  let bytes = 0;
  for (const path of paths) {
    const { size } = await lstat(join(root, path));
    if (size > EDGEONE_MAX_FILE_BYTES)
      throw new Error(
        `${path} is ${size} bytes; EdgeOne accepts at most ${EDGEONE_MAX_FILE_BYTES}.`,
      );
    bytes += size;
  }
  return { files: paths.length, bytes };
}
