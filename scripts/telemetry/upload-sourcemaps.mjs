import { spawnSync } from "node:child_process";
import { readFile } from "node:fs/promises";
import { resolve } from "node:path";
import { fileURLToPath } from "node:url";

const repositoryRoot = fileURLToPath(new URL("../../", import.meta.url));
const projectMetadata = JSON.parse(await readFile(resolve(repositoryRoot, "package.json"), "utf8"));
const outputDirectory = resolve(repositoryRoot, "apps/editor/dist/assets");
const apiKey = process.env.POSTHOG_CLI_API_KEY;
const projectId = process.env.POSTHOG_CLI_PROJECT_ID;

if (!apiKey && !projectId) {
  process.stdout.write("PostHog source map upload is disabled (no deployment credentials).\n");
  process.exit(0);
}
if (!apiKey || !projectId)
  throw new Error(
    "Configure both POSTHOG_CLI_API_KEY and POSTHOG_CLI_PROJECT_ID for source map uploads.",
  );

const region = process.env.VITE_POSTHOG_REGION === "EU" ? "eu" : "us";
const releaseVersion =
  process.env.POSTHOG_RELEASE?.trim() ||
  process.env.EDGEONE_COMMIT_SHA?.trim() ||
  projectMetadata.version;
const command = process.platform === "win32" ? "pnpm.cmd" : "pnpm";
const args = ["exec", "posthog-cli", "--host", `https://${region}.posthog.com`, "sourcemap"];
const releaseArgs = [
  "--directory",
  outputDirectory,
  "--release-name",
  projectMetadata.name,
  "--release-version",
  releaseVersion,
];

for (const step of ["inject", "upload"]) {
  const result = spawnSync(
    command,
    [...args, step, ...releaseArgs, ...(step === "upload" ? ["--delete-after"] : [])],
    {
      cwd: repositoryRoot,
      env: process.env,
      stdio: "inherit",
    },
  );
  if (result.error) throw result.error;
  if (result.status !== 0) process.exit(result.status ?? 1);
}
