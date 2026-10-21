/**
 * Merges independently built app outputs into one site directory.
 *
 * The editor and growth apps both publish at the site root, so their `assets/` folders share
 * one URL space. A file both apps emit is fine when the bytes match (shared fonts, licences,
 * icons). Different bytes at one path mean the later app silently replaces the earlier one:
 * the served file no longer matches the build that referenced it (for example the editor's
 * service worker SRI hashes or its PostHog source-map debug IDs). Assembly refuses that.
 */
import { cp, readdir, readFile } from "node:fs/promises";
import { join, relative, resolve, sep } from "node:path";

export interface SiteOutput {
  /** App name used in error messages. */
  label: string;
  /** Built output directory of the app. */
  directory: string;
  /** Site-relative directory the output is copied into ("" for the site root). */
  prefix?: string;
}

export interface OutputConflict {
  /** Site-relative path written by more than one app with different bytes. */
  path: string;
  labels: [string, string];
}

async function filesOf(directory: string): Promise<string[]> {
  const entries = await readdir(directory, { recursive: true, withFileTypes: true });
  return entries
    .filter((entry) => !entry.isDirectory())
    .map((entry) => relative(directory, join(entry.parentPath, entry.name)).split(sep).join("/"));
}

/** Site paths that two outputs would fill with different bytes. Identical copies are allowed. */
export async function findOutputConflicts(outputs: SiteOutput[]): Promise<OutputConflict[]> {
  const owners = new Map<string, { label: string; file: string }>();
  const conflicts: OutputConflict[] = [];
  for (const { label, directory, prefix = "" } of outputs) {
    for (const name of await filesOf(directory)) {
      const path = prefix ? `${prefix.replace(/\/+$/, "")}/${name}` : name;
      const file = resolve(directory, name);
      const owner = owners.get(path);
      if (owner) {
        const [previous, current] = await Promise.all([readFile(owner.file), readFile(file)]);
        if (!previous.equals(current)) conflicts.push({ path, labels: [owner.label, label] });
      }
      owners.set(path, { label, file });
    }
  }
  return conflicts.sort((left, right) => left.path.localeCompare(right.path));
}

/** Copy every output into `siteDirectory` in order, after proving no copy overwrites another. */
export async function mergeSiteOutputs(
  siteDirectory: string,
  outputs: SiteOutput[],
): Promise<void> {
  const conflicts = await findOutputConflicts(outputs);
  if (conflicts.length) {
    const sample = conflicts
      .slice(0, 10)
      .map(({ path, labels }) => `  ${path} (${labels.join(" vs ")})`)
      .join("\n");
    throw new Error(
      `${conflicts.length} site path(s) are written by more than one app with different bytes:\n` +
        `${sample}\nThe later copy would replace the earlier one in the deployed site. ` +
        "Give one app's output a distinct file name instead of merging over it.",
    );
  }
  for (const { directory, prefix = "" } of outputs)
    await cp(directory, resolve(siteDirectory, prefix), { recursive: true });
}
