import { spawn } from "node:child_process";
import { appendFile, cp, lstat, mkdir, readFile, readdir, rm, writeFile } from "node:fs/promises";
import { dirname, join, resolve } from "node:path";
import { fileURLToPath } from "node:url";

const repositoryRoot = fileURLToPath(new URL("../../", import.meta.url));
const configuration = JSON.parse(await readFile(join(repositoryRoot, "edgeone.json"), "utf8"));
const outputDirectory = resolve(repositoryRoot, configuration.outputDirectory);
const deploymentDirectory = join(repositoryRoot, ".tmp/deploy/editor");
const resultPath = join(repositoryRoot, ".tmp/deploy/result.json");
const MAX_CAPTURE_CHARACTERS = 64 * 1024;
const REQUEST_TIMEOUT_MS = 10_000;
const VERIFY_ATTEMPTS = 3;
const VERIFY_RETRY_MS = 3_000;
const SUPPORTED_ENVIRONMENTS = new Set(["production", "preview"]);
const SUPPORTED_AREAS = new Set(["global", "overseas"]);
const SUPPORTED_REGIONS = new Set(["US", "EU"]);

function environmentValue(name) {
  return process.env[name]?.trim() ?? "";
}

function deploymentSettings() {
  const environment = environmentValue("EDGEONE_ENV");
  const area = environmentValue("EDGEONE_AREA");
  const name = environmentValue("EDGEONE_PROJECT_NAME") || configuration.name;
  if (!SUPPORTED_ENVIRONMENTS.has(environment))
    throw new Error("Set EDGEONE_ENV to production or preview.");
  if (!SUPPORTED_AREAS.has(area)) throw new Error("Set EDGEONE_AREA to global or overseas.");
  if (typeof name !== "string" || !/^[a-z0-9][a-z0-9-]*$/.test(name))
    throw new Error("EDGEONE_PROJECT_NAME must use lowercase letters, numbers and hyphens.");
  return { environment, area, name };
}

function validateConfiguration() {
  const settings = deploymentSettings();
  if (!environmentValue("EDGEONE_API_TOKEN"))
    throw new Error("Configure the EDGEONE_API_TOKEN GitHub secret before deployment.");
  const token = environmentValue("VITE_POSTHOG_PROJECT_TOKEN");
  const region = environmentValue("VITE_POSTHOG_REGION");
  if (!SUPPORTED_REGIONS.has(region)) throw new Error("Set VITE_POSTHOG_REGION to US or EU.");
  if (settings.environment === "production" && !/^phc_[A-Za-z0-9_-]+$/.test(token))
    throw new Error("Configure the public VITE_POSTHOG_PROJECT_TOKEN for production analytics.");
  if (settings.environment === "preview" && token)
    throw new Error("Preview builds must leave VITE_POSTHOG_PROJECT_TOKEN empty.");
  const apiKey = environmentValue("POSTHOG_CLI_API_KEY");
  const projectId = environmentValue("POSTHOG_CLI_PROJECT_ID");
  if (Boolean(apiKey) !== Boolean(projectId) || (projectId && !/^\d+$/.test(projectId)))
    throw new Error(
      "Source maps require both POSTHOG_CLI_API_KEY and a numeric POSTHOG_CLI_PROJECT_ID.",
    );
  console.log(
    `Deployment configuration ready: ${settings.name}, ${settings.environment}, ${settings.area}.`,
  );
}

async function verifyStaticFiles(directory) {
  for (const entry of await readdir(directory, { withFileTypes: true })) {
    const path = join(directory, entry.name);
    if (entry.isSymbolicLink() || (await lstat(path)).isSymbolicLink())
      throw new Error("Deployment artifacts must not contain symbolic links.");
    if (entry.name.startsWith(".") || entry.name.endsWith(".map") || entry.name === "node_modules")
      throw new Error(`Unexpected private/build file in static output: ${entry.name}`);
    if (entry.isDirectory()) await verifyStaticFiles(path);
  }
}

async function prepareDeployment() {
  const { environment } = deploymentSettings();
  const release = environmentValue("POSTHOG_RELEASE");
  if (!/^[a-f0-9]{40}$/.test(release))
    throw new Error("Set POSTHOG_RELEASE to the actual checked-out commit SHA before building.");
  await readFile(join(outputDirectory, "index.html"), "utf8");
  await verifyStaticFiles(outputDirectory);
  await rm(deploymentDirectory, { recursive: true, force: true });
  await mkdir(dirname(deploymentDirectory), { recursive: true });
  await cp(outputDirectory, deploymentDirectory, { recursive: true });
  // Upload only serving rules; omit build/install commands to keep this package prebuilt.
  const servingConfiguration = {
    $schema: configuration.$schema,
    headers: configuration.headers,
    caches: configuration.caches,
    ...(configuration.rewrites ? { rewrites: configuration.rewrites } : {}),
    ...(configuration.redirects ? { redirects: configuration.redirects } : {}),
  };
  await writeFile(
    join(deploymentDirectory, "edgeone.json"),
    `${JSON.stringify(servingConfiguration, null, 2)}\n`,
  );
  await writeFile(
    join(deploymentDirectory, "release.json"),
    `${JSON.stringify(
      {
        release,
        ref: environmentValue("DEPLOY_REF"),
        environment,
      },
      null,
      2,
    )}\n`,
  );
  console.log("Static deployment prepared in .tmp/deploy/editor (no functions or env files).");
}

async function runCli(args) {
  const command = process.platform === "win32" ? "pnpm.cmd" : "pnpm";
  return new Promise((resolveResult, reject) => {
    const child = spawn(command, ["exec", "edgeone", ...args], {
      cwd: repositoryRoot,
      env: process.env,
      stdio: ["ignore", "pipe", "inherit"],
    });
    let output = "";
    child.stdout.on("data", (chunk) => {
      process.stdout.write(chunk);
      output = (output + chunk.toString()).slice(-MAX_CAPTURE_CHARACTERS);
    });
    child.on("error", reject);
    child.on("close", (code) => {
      if (code !== 0) return reject(new Error(`EdgeOne CLI exited with status ${code}.`));
      for (const line of output.trim().split("\n").reverse()) {
        try {
          const result = JSON.parse(line);
          if (result.status === "success") return resolveResult(result);
          if (result.status === "error") return reject(new Error("EdgeOne deployment failed."));
        } catch {
          // The CLI also emits progress lines before its final JSON result.
        }
      }
      reject(new Error("EdgeOne did not return a successful deployment result."));
    });
  });
}

async function verifyDeployment(result, expected) {
  const url = new URL(result.url);
  if (url.protocol !== "https:") throw new Error("EdgeOne must return an HTTPS deployment URL.");
  const releaseUrl = new URL(url);
  releaseUrl.pathname = "/release.json";
  releaseUrl.searchParams.set("release", expected.release);
  let lastError;
  for (let attempt = 0; attempt < VERIFY_ATTEMPTS; attempt++) {
    try {
      const response = await fetch(releaseUrl, { signal: AbortSignal.timeout(REQUEST_TIMEOUT_MS) });
      if (!response.ok) throw new Error(`Release verification returned HTTP ${response.status}.`);
      const actual = await response.json();
      if (actual.release !== expected.release || actual.environment !== expected.environment)
        throw new Error("The deployed release does not match the uploaded artifact.");
      const page = await fetch(url, { signal: AbortSignal.timeout(REQUEST_TIMEOUT_MS) });
      if (!page.ok) throw new Error(`Editor returned HTTP ${page.status}.`);
      const html = await page.text();
      const script = html.match(/<script\b[^>]*\bsrc=["']([^"']+)["'][^>]*>/i)?.[1];
      if (!script) throw new Error("Editor HTML has no JavaScript entry.");
      const assetUrl = new URL(script, url);
      if (assetUrl.origin !== url.origin)
        throw new Error("Editor entry must be hosted with the deployment.");
      // Preserve the signed preview URL parameters when fetching another path.
      for (const [key, value] of url.searchParams) assetUrl.searchParams.set(key, value);
      const asset = await fetch(assetUrl, { signal: AbortSignal.timeout(REQUEST_TIMEOUT_MS) });
      if (!asset.ok || !(asset.headers.get("content-type") ?? "").includes("javascript"))
        throw new Error(`Editor entry asset is unavailable (HTTP ${asset.status}).`);
      await asset.body?.cancel();
      return;
    } catch (error) {
      lastError = error;
      if (attempt + 1 < VERIFY_ATTEMPTS)
        await new Promise((done) => setTimeout(done, VERIFY_RETRY_MS));
    }
  }
  throw lastError;
}

async function publishDeployment() {
  const settings = deploymentSettings();
  const token = environmentValue("EDGEONE_API_TOKEN");
  if (!token) throw new Error("Set EDGEONE_API_TOKEN before publishing.");
  const expected = JSON.parse(await readFile(join(deploymentDirectory, "release.json"), "utf8"));
  if (
    expected.environment !== settings.environment ||
    expected.release !== environmentValue("POSTHOG_RELEASE")
  )
    throw new Error("Prepare a matching artifact before publishing.");
  const result = await runCli([
    "makers",
    "deploy",
    deploymentDirectory,
    "--name",
    settings.name,
    "--token",
    token,
    "--env",
    settings.environment,
    "--area",
    settings.area,
    "--skip-ai-gateway-sync",
    "--json",
  ]);
  await writeFile(
    resultPath,
    `${JSON.stringify({ ...result, ...expected, verified: false }, null, 2)}\n`,
  );
  await verifyDeployment(result, expected);
  await writeFile(
    resultPath,
    `${JSON.stringify({ ...result, ...expected, verified: true }, null, 2)}\n`,
  );
  if (process.env.GITHUB_OUTPUT)
    await appendFile(process.env.GITHUB_OUTPUT, `url=${new URL(result.url).href}\n`);
  if (process.env.GITHUB_STEP_SUMMARY) {
    const url = new URL(result.url).href.replaceAll("(", "%28").replaceAll(")", "%29");
    await appendFile(
      process.env.GITHUB_STEP_SUMMARY,
      `Deployed **${settings.name}** (${settings.environment}).\n\nCommit: \`${expected.release}\`.\n\n[Open deployment](${url})\n\nRelease metadata, HTML and entry JavaScript verified. PostHog ingestion still requires browser/network verification.\n`,
    );
  }
  console.log("Deployed release, editor HTML and entry JavaScript verified.");
}

try {
  switch (process.argv[2]) {
    case "validate":
      validateConfiguration();
      break;
    case "prepare":
      await prepareDeployment();
      break;
    case "publish":
      await publishDeployment();
      break;
    default:
      throw new Error("Use validate, prepare or publish.");
  }
} catch (error) {
  console.error(error instanceof Error ? error.message : String(error));
  process.exitCode = 1;
}
