import { globSync, readFileSync, unwatchFile, watchFile } from "node:fs";
import { relative, resolve } from "node:path";

import type { ViteDevServer } from "vite";

const DEPENDENCY_POLL_INTERVAL_MS = 1_000;
const DEPENDENCY_SETTLE_DELAY_MS = 750;
const PACKAGE_MANIFEST_GLOBS = [
  "package.json",
  "apps/*/package.json",
  "apps/*/*/package.json",
  "packages/*/package.json",
  "services/*/package.json",
];
const DEPENDENCY_CONTROL_FILES = [
  "pnpm-lock.yaml",
  "pnpm-workspace.yaml",
  ".npmrc",
  ".pnpmfile.cjs",
  "node_modules/.modules.yaml",
  "node_modules/.pnpm-workspace-state-v1.json",
];
const PACKAGE_MANIFEST_PATTERN = /^(?:apps|packages|services)\/[^/]+\/(?:[^/]+\/)?package\.json$/;

function dependencyContents(path: string): string {
  try {
    const contents = readFileSync(path, "utf8");
    // Formatting a manifest should not restart the application.
    return path.endsWith("/package.json") ? JSON.stringify(JSON.parse(contents)) : contents;
  } catch (error) {
    if ((error as NodeJS.ErrnoException).code === "ENOENT") return "";
    throw error;
  }
}

/** Package links and exports can change without a source HMR event, including during pnpm install. */
export function watchDevelopmentDependencies(server: ViteDevServer, root: string): () => void {
  const snapshots = new Map<string, string>();
  const watchedFiles = new Set<string>();
  let timer: ReturnType<typeof setTimeout> | undefined;
  let stopped = false;
  let restarting = false;

  function dependencyFiles(): string[] {
    return [...globSync(PACKAGE_MANIFEST_GLOBS, { cwd: root }), ...DEPENDENCY_CONTROL_FILES].map(
      (path) => resolve(root, path),
    );
  }

  function watchDependencies(paths: readonly string[]): void {
    for (const path of paths) {
      if (watchedFiles.has(path)) continue;
      watchedFiles.add(path);
      // Native polling also sees pnpm records under node_modules, which Vite ignores.
      watchFile(
        path,
        { interval: DEPENDENCY_POLL_INTERVAL_MS, persistent: false },
        scheduleRestart,
      );
    }
  }

  async function restartIfChanged(): Promise<void> {
    timer = undefined;
    if (stopped || restarting) return;
    const paths = dependencyFiles();
    const current = new Map<string, string>();
    try {
      for (const path of paths) current.set(path, dependencyContents(path));
    } catch {
      // An editor or package manager may still be writing a manifest.
      scheduleRestart();
      return;
    }
    watchDependencies(paths);
    const changed = new Set([...snapshots.keys(), ...current.keys()]);
    const changedFiles = [...changed].filter((path) => snapshots.get(path) !== current.get(path));
    if (changedFiles.length === 0) return;

    restarting = true;
    server.config.logger.info(
      `Workspace dependencies changed (${changedFiles.map((path) => relative(root, path)).join(", ")}); reinitializing ${relative(root, server.config.root)}.`,
      { timestamp: true },
    );
    try {
      // Recreate resolver caches and dependency bundles, retaining the configured port.
      await server.restart(true);
    } catch (error) {
      server.config.logger.error(`Dependency restart failed: ${String(error)}`, {
        timestamp: true,
      });
    } finally {
      restarting = false;
    }
  }

  function scheduleRestart(): void {
    if (stopped || restarting) return;
    if (timer) clearTimeout(timer);
    timer = setTimeout(() => void restartIfChanged(), DEPENDENCY_SETTLE_DELAY_MS);
    timer.unref();
  }

  function onFileEvent(_event: string, path: string): void {
    const localPath = relative(root, path).replaceAll("\\", "/");
    if (localPath === "package.json" || PACKAGE_MANIFEST_PATTERN.test(localPath)) scheduleRestart();
  }

  const paths = dependencyFiles();
  for (const path of paths) snapshots.set(path, dependencyContents(path));
  watchDependencies(paths);
  server.watcher.on("all", onFileEvent);

  return () => {
    stopped = true;
    if (timer) clearTimeout(timer);
    server.watcher.off("all", onFileEvent);
    for (const path of watchedFiles) unwatchFile(path, scheduleRestart);
  };
}
