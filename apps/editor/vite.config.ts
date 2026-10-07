import {
  appendFile,
  copyFile,
  cp,
  mkdir,
  readFile,
  readdir,
  stat,
  unlink,
  writeFile,
} from "node:fs/promises";
import { dirname, resolve } from "node:path";
import { fileURLToPath } from "node:url";

import react from "@vitejs/plugin-react";
import { defineConfig } from "vite";

import {
  DEVELOPMENT_PORTS,
  DevelopmentApp,
  developmentServerIdentity,
  developmentSiteProxy,
} from "../../infra/dev-site.ts";
import { packageLocalAliases } from "../../infra/package-local-aliases.ts";
import { publicPackageAssets } from "../../infra/public-package-assets.ts";
import { siteHtml, SiteIconStyle } from "../../infra/site-html.ts";
import { editorOffline } from "./build/editor-offline.ts";

const appRoot = dirname(fileURLToPath(import.meta.url));
const repositoryRoot = resolve(appRoot, "../..");
const isItchBuild = process.env.XPRITE_DISTRIBUTION === "itch";
const editorOutput = isItchBuild
  ? resolve(repositoryRoot, ".tmp/itch/editor")
  : resolve(appRoot, "dist");
const bedrockSource = resolve(repositoryRoot, "packages/bedrock");
const editorCoreSource = resolve(repositoryRoot, "packages/editor-core/src");
const uiSource = resolve(repositoryRoot, "packages/ui/src");
const uiStylesheet = resolve(repositoryRoot, "packages/ui/dist/style.css");
const REACT_RUNTIME_CHUNK_NAME = "react-runtime";
const REACT_RUNTIME_MODULE_PATTERN = /[\\/]node_modules[\\/](?:react|react-dom|scheduler)[\\/]/;
const CORE_CHUNK_NAME = "editor-core";
const CORE_MODULE_PATTERN = /[\\/]packages[\\/]editor-core[\\/]/;
const UI_CHUNK_NAME = "ui";
const UI_MODULE_PATTERN = /[\\/]packages[\\/]ui[\\/]/;
const BEDROCK_CHUNK_NAME = "bedrock";
const BEDROCK_MODULE_PATTERN = /[\\/]packages[\\/]bedrock[\\/]/;
const DEBUG_INPUT_ENDPOINT = "/__debug/input";
const DIAGNOSTICS_ENDPOINT = "/__debug/diagnostics";
const DIAGNOSTIC_ARTIFACT_ENDPOINT = "/__debug/diagnostic-artifact";
const DEBUG_INPUT_LOG_PATH = ".tmp/debug-input.ndjson";
const DIAGNOSTICS_LOG_PATH = ".tmp/diagnostics.ndjson";
const DIAGNOSTIC_ARTIFACT_DIRECTORY = ".tmp/diagnostic-artifacts";
const MAX_DEBUG_LOG_BODY_CHARACTERS = 2_000_000;
const MAX_PERSISTED_DIAGNOSTIC_RECORDS = 200;
const MAX_DIAGNOSTIC_ARTIFACT_BYTES = 64 * 1024 * 1024;
const MAX_PERSISTED_DIAGNOSTIC_ARTIFACTS = 3;
const projectMetadata = JSON.parse(await readFile(resolve(repositoryRoot, "package.json"), "utf8"));
const appRelease =
  process.env.POSTHOG_RELEASE?.trim() ||
  process.env.EDGEONE_COMMIT_SHA?.trim() ||
  projectMetadata.version;

async function pruneDiagnosticArtifacts(directory: string): Promise<void> {
  const names = (await readdir(directory)).filter((name) => name.endsWith(".aseprite"));
  if (names.length <= MAX_PERSISTED_DIAGNOSTIC_ARTIFACTS) return;
  const artifacts = await Promise.all(
    names.map(async (name) => ({
      name,
      modifiedAt: (await stat(resolve(directory, name))).mtimeMs,
    })),
  );
  artifacts.sort((left, right) => left.modifiedAt - right.modifiedAt);
  for (const artifact of artifacts.slice(0, -MAX_PERSISTED_DIAGNOSTIC_ARTIFACTS)) {
    const id = artifact.name.slice(0, -".aseprite".length);
    await Promise.all([
      unlink(resolve(directory, artifact.name)).catch(() => {}),
      unlink(resolve(directory, `${id}.json`)).catch(() => {}),
    ]);
  }
}

function debugInputMiddleware() {
  let diagnosticWriteQueue: Promise<void> = Promise.resolve();
  return {
    name: "xprite-dev-log-writer",
    configureServer(server: {
      middlewares: { use: (handler: (req: any, res: any, next: () => void) => void) => void };
    }) {
      server.middlewares.use(async (req, res, next) => {
        const endpoint = req.url?.split("?", 1)[0];
        if (req.method === "POST" && endpoint === DIAGNOSTIC_ARTIFACT_ENDPOINT) {
          const id = String(req.headers["x-diagnostic-id"] ?? "");
          const encodedFileName = String(req.headers["x-diagnostic-file-name"] ?? "");
          if (!/^[a-z0-9-]{1,80}$/i.test(id)) {
            res.statusCode = 400;
            res.end("invalid diagnostic artifact id");
            return;
          }
          const chunks: Buffer[] = [];
          let byteLength = 0;
          let oversized = false;
          req.on("data", (chunk: Buffer | Uint8Array | string) => {
            const data = Buffer.isBuffer(chunk) ? chunk : Buffer.from(chunk);
            if (byteLength + data.byteLength > MAX_DIAGNOSTIC_ARTIFACT_BYTES) {
              oversized = true;
              chunks.length = 0;
              return;
            }
            chunks.push(data);
            byteLength += data.byteLength;
          });
          req.on("end", async () => {
            if (oversized) {
              res.statusCode = 413;
              res.end("diagnostic artifact too large");
              return;
            }
            try {
              const originalName = encodedFileName
                ? decodeURIComponent(encodedFileName).slice(0, 255)
                : "unnamed.aseprite";
              const artifactName = `${id}.aseprite`;
              const artifactPath = `${DIAGNOSTIC_ARTIFACT_DIRECTORY}/${artifactName}`;
              const artifactDirectory = resolve(repositoryRoot, DIAGNOSTIC_ARTIFACT_DIRECTORY);
              await mkdir(artifactDirectory, { recursive: true });
              await writeFile(resolve(artifactDirectory, artifactName), Buffer.concat(chunks));
              await writeFile(
                resolve(artifactDirectory, `${id}.json`),
                `${JSON.stringify(
                  { id, receivedAt: Date.now(), originalName, byteLength, artifactPath },
                  null,
                  2,
                )}\n`,
              );
              await pruneDiagnosticArtifacts(artifactDirectory).catch(() => {});
              res.statusCode = 201;
              res.setHeader("content-type", "application/json");
              res.end(JSON.stringify({ id, path: artifactPath, byteLength }));
            } catch {
              res.statusCode = 500;
              res.end("unable to write diagnostic artifact");
            }
          });
          return;
        }
        if (
          req.method !== "POST" ||
          (endpoint !== DEBUG_INPUT_ENDPOINT && endpoint !== DIAGNOSTICS_ENDPOINT)
        ) {
          next();
          return;
        }
        let body = "";
        let oversized = false;
        req.setEncoding("utf8");
        req.on("data", (chunk: string) => {
          if (body.length + chunk.length > MAX_DEBUG_LOG_BODY_CHARACTERS) {
            oversized = true;
            return;
          }
          body += chunk;
        });
        req.on("end", async () => {
          if (oversized) {
            res.statusCode = 413;
            res.end("debug payload too large");
            return;
          }

          let parsed: unknown;
          try {
            parsed = JSON.parse(body);
          } catch {
            res.statusCode = 400;
            res.end("invalid debug payload");
            return;
          }
          if (!parsed || typeof parsed !== "object" || Array.isArray(parsed)) {
            res.statusCode = 400;
            res.end("invalid debug payload");
            return;
          }
          const payload = parsed as Record<string, unknown>;
          const candidates =
            endpoint === DIAGNOSTICS_ENDPOINT
              ? Array.isArray(payload.records)
                ? payload.records
                : [payload]
              : [];
          if (
            endpoint === DIAGNOSTICS_ENDPOINT &&
            (!candidates.length ||
              candidates.some(
                (candidate) =>
                  !candidate ||
                  typeof candidate !== "object" ||
                  Array.isArray(candidate) ||
                  typeof (candidate as Record<string, unknown>).id !== "string" ||
                  typeof (candidate as Record<string, unknown>).timestamp !== "number" ||
                  !Number.isFinite((candidate as Record<string, unknown>).timestamp),
              ))
          ) {
            res.statusCode = 400;
            res.end("invalid diagnostic records");
            return;
          }

          try {
            await mkdir(resolve(repositoryRoot, ".tmp"), { recursive: true });
            const logPath = resolve(
              repositoryRoot,
              endpoint === DEBUG_INPUT_ENDPOINT ? DEBUG_INPUT_LOG_PATH : DIAGNOSTICS_LOG_PATH,
            );
            const entry = `${JSON.stringify({ receivedAt: Date.now(), ...payload })}\n`;
            if (endpoint === DEBUG_INPUT_ENDPOINT) {
              await appendFile(logPath, entry);
            } else {
              const write = diagnosticWriteQueue.then(async () => {
                let existing = "";
                try {
                  existing = await readFile(logPath, "utf8");
                } catch (error) {
                  if ((error as NodeJS.ErrnoException).code !== "ENOENT") throw error;
                }
                const recordsById = new Map<string, { timestamp: number; serialized: string }>();
                for (const line of existing.split("\n").filter(Boolean)) {
                  try {
                    const record = JSON.parse(line) as Record<string, unknown>;
                    if (typeof record.id === "string" && typeof record.timestamp === "number")
                      recordsById.set(record.id, { timestamp: record.timestamp, serialized: line });
                  } catch {
                    // Ignore malformed old lines while retaining valid diagnostics.
                  }
                }
                for (const candidate of candidates as Record<string, unknown>[]) {
                  const recordLine = JSON.stringify({ receivedAt: Date.now(), ...candidate });
                  recordsById.set(candidate.id as string, {
                    timestamp: candidate.timestamp as number,
                    serialized: recordLine,
                  });
                }
                const records = [...recordsById.values()]
                  .sort((left, right) => left.timestamp - right.timestamp)
                  .slice(-MAX_PERSISTED_DIAGNOSTIC_RECORDS)
                  .map(({ serialized }) => serialized);
                await writeFile(
                  logPath,
                  `${records.slice(-MAX_PERSISTED_DIAGNOSTIC_RECORDS).join("\n")}\n`,
                );
              });
              diagnosticWriteQueue = write.catch(() => {});
              await write;
            }
            res.statusCode = 204;
            res.end();
          } catch {
            res.statusCode = 500;
            res.end("unable to write debug log");
          }
        });
      });
    },
  };
}

function bundleLicenseNotices() {
  return {
    name: "bundle-license-notices",
    async closeBundle() {
      await Promise.all([
        copyFile(resolve(repositoryRoot, "LICENSE"), resolve(editorOutput, "LICENSE")),
        copyFile(
          resolve(repositoryRoot, "ATTRIBUTION.md"),
          resolve(editorOutput, "ATTRIBUTION.md"),
        ),
        cp(resolve(repositoryRoot, "LICENSES"), resolve(editorOutput, "LICENSES"), {
          recursive: true,
        }),
      ]);
    },
  };
}

function itchDistribution() {
  return {
    name: "xprite-itch-distribution",
    transformIndexHtml(html: string) {
      return html
        .replace(/\s*<link\b[^>]*rel="canonical"[^>]*>/g, "")
        .replace(/\s*<link\b[^>]*rel="manifest"[^>]*>/g, "")
        .replace(/\s*<meta\b[^>]*name="(?:apple-)?mobile-web-app-capable"[^>]*>/g, "");
    },
    async closeBundle() {
      await Promise.all([
        unlink(resolve(editorOutput, "sw.js")),
        unlink(resolve(editorOutput, "manifest.webmanifest")),
        writeFile(
          resolve(editorOutput, "release.json"),
          `${JSON.stringify(
            { distribution: "itch", version: projectMetadata.version, release: appRelease },
            null,
            2,
          )}\n`,
        ),
      ]);
    },
  };
}

function preserveEditorStyleEffects() {
  return {
    name: "preserve-editor-style-effects",
    enforce: "post" as const,
    transform(code: string, id: string) {
      // Bare CSS Module imports still apply global editor layout selectors.
      if (id.startsWith(appRoot) && /\.css(?:\?|$)/.test(id))
        return { code, moduleSideEffects: "no-treeshake" as const };
      return null;
    },
  };
}

export default defineConfig({
  optimizeDeps: { exclude: ["@bokuweb/zstd-wasm"] },
  base: isItchBuild ? "./" : "/",
  define: {
    __XPRITE_ITCH__: JSON.stringify(isItchBuild),
    __XPRITE_VERSION__: JSON.stringify(projectMetadata.version),
    __XPRITE_RELEASE__: JSON.stringify(appRelease),
  },
  root: appRoot,
  publicDir: resolve(appRoot, "assets/public"),
  plugins: [
    developmentServerIdentity(DevelopmentApp.Editor, repositoryRoot),
    packageLocalAliases(),
    siteHtml(SiteIconStyle.Editor),
    publicPackageAssets(import.meta.url, "@xprite/site-assets", [
      "icon.svg",
      "favicon.ico",
      "favicon-32.png",
    ]),
    react(),
    debugInputMiddleware(),
    bundleLicenseNotices(),
    preserveEditorStyleEffects(),
    ...(!isItchBuild ? [editorOffline(editorOutput)] : []),
    ...(isItchBuild ? [itchDistribution()] : []),
  ],
  resolve: {
    alias: [
      {
        find: "@xprite/ui/pattern-data",
        replacement: resolve(repositoryRoot, "packages/ui/assets/patterns/macintosh/catalog.json"),
      },
      {
        find: /^@xprite\/editor-ui$/,
        replacement: resolve(repositoryRoot, "packages/editor-ui/src/index.ts"),
      },
      {
        find: "@xprite/editor-ui/",
        replacement: `${resolve(repositoryRoot, "packages/editor-ui/src")}/`,
      },
      {
        find: "@xprite/bedrock/",
        replacement: `${bedrockSource}/`,
      },
      {
        find: /^@xprite\/editor-core$/,
        replacement: `${editorCoreSource}/index.ts`,
      },
      {
        find: "@xprite/editor-core/",
        replacement: `${editorCoreSource}/`,
      },
      {
        find: /^@xprite\/ui\/style\.css$/,
        replacement: uiStylesheet,
      },
      {
        find: /^@xprite\/ui$/,
        replacement: `${uiSource}/index.ts`,
      },
      {
        find: "@xprite/ui/",
        replacement: `${uiSource}/`,
      },
    ],
  },
  server: {
    host: "0.0.0.0",
    port: DEVELOPMENT_PORTS[DevelopmentApp.Editor],
    strictPort: true,
    fs: { allow: [repositoryRoot] },
    proxy: developmentSiteProxy(DevelopmentApp.Editor),
  },
  preview: { host: "0.0.0.0" },
  build: {
    outDir: editorOutput,
    emptyOutDir: true,
    rolldownOptions: {
      output: {
        // Preserve package dependency direction so shared initializers do not form chunk cycles.
        codeSplitting: {
          groups: [
            { name: REACT_RUNTIME_CHUNK_NAME, test: REACT_RUNTIME_MODULE_PATTERN },
            { name: CORE_CHUNK_NAME, test: CORE_MODULE_PATTERN },
            { name: UI_CHUNK_NAME, test: UI_MODULE_PATTERN },
            { name: BEDROCK_CHUNK_NAME, test: BEDROCK_MODULE_PATTERN },
          ],
        },
      },
    },
    sourcemap:
      process.env.POSTHOG_CLI_API_KEY && process.env.POSTHOG_CLI_PROJECT_ID ? "hidden" : false,
  },
});
