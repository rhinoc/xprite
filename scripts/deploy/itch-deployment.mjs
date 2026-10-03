import { spawn } from "node:child_process";
import { lstat, mkdir, readFile, readdir, rename, rm } from "node:fs/promises";
import { join } from "node:path";
import { fileURLToPath } from "node:url";

const repositoryRoot = fileURLToPath(new URL("../../", import.meta.url));
const artifactDirectory = join(repositoryRoot, ".tmp/itch");
const outputDirectory = join(artifactDirectory, "editor");
const archivePath = join(artifactDirectory, "xprite-itch.zip");
const temporaryArchivePath = `${archivePath}.tmp`;
const MAX_FILES = 1_000;
const MAX_PATH_CHARACTERS = 240;
const MAX_FILE_BYTES = 200_000_000;
const MAX_TOTAL_BYTES = 500_000_000;
const FORBIDDEN_FILES = new Set(["node_modules", "sw.js", "manifest.webmanifest"]);

function runCommand(command, args, env = process.env) {
  return new Promise((resolve, reject) => {
    const child = spawn(command, args, { cwd: repositoryRoot, env, stdio: "inherit" });
    child.on("error", reject);
    child.on("close", (code) => {
      if (code === 0) resolve();
      else reject(new Error(`${command} exited with status ${code}.`));
    });
  });
}

async function buildEditor() {
  await runCommand(process.platform === "win32" ? "pnpm.cmd" : "pnpm", ["run", "build:editor"], {
    ...process.env,
    XPRITE_DISTRIBUTION: "itch",
  });
  await validateArtifact();
  console.log("itch.io editor built in .tmp/itch/editor.");
}

async function validateArtifact() {
  const root = await lstat(outputDirectory);
  if (!root.isDirectory() || root.isSymbolicLink())
    throw new Error("The itch.io artifact must be a regular directory.");
  let files = 0;
  let totalBytes = 0;
  async function visit(directory, prefix = "") {
    for (const entry of await readdir(directory, { withFileTypes: true })) {
      const path = join(directory, entry.name);
      const archiveName = `${prefix}${entry.name}`;
      const info = await lstat(path);
      if (
        entry.name.startsWith(".") ||
        entry.name.endsWith(".map") ||
        FORBIDDEN_FILES.has(entry.name) ||
        info.isSymbolicLink()
      )
        throw new Error(`Unexpected private/build file in itch.io output: ${archiveName}`);
      if ([...archiveName].length > MAX_PATH_CHARACTERS)
        throw new Error(`itch.io path exceeds ${MAX_PATH_CHARACTERS} characters: ${archiveName}`);
      if (info.isDirectory()) {
        await visit(path, `${archiveName}/`);
      } else if (info.isFile()) {
        files++;
        totalBytes += info.size;
        if (info.size > MAX_FILE_BYTES)
          throw new Error(`itch.io file exceeds ${MAX_FILE_BYTES} bytes: ${archiveName}`);
        if (files > MAX_FILES || totalBytes > MAX_TOTAL_BYTES)
          throw new Error(`itch.io output exceeds ${MAX_FILES} files or ${MAX_TOTAL_BYTES} bytes.`);
      } else {
        throw new Error(`Unsupported artifact entry: ${archiveName}`);
      }
    }
  }
  await visit(outputDirectory);
  const html = await readFile(join(outputDirectory, "index.html"), "utf8");
  if (/<(?:script|link|img)\b[^>]*\b(?:src|href)\s*=\s*["']\//i.test(html))
    throw new Error("itch.io HTML must use relative asset paths. Run pnpm run build:itch.");
  const metadata = JSON.parse(await readFile(join(outputDirectory, "release.json"), "utf8"));
  if (
    metadata.distribution !== "itch" ||
    typeof metadata.version !== "string" ||
    !metadata.version.trim() ||
    typeof metadata.release !== "string"
  )
    throw new Error("Missing itch.io build metadata. Run pnpm run build:itch.");
  return metadata;
}

async function packEditor() {
  await validateArtifact();
  await mkdir(artifactDirectory, { recursive: true });
  await rm(temporaryArchivePath, { force: true });
  try {
    // Match the existing mini-tool packer's Python ZIP workflow without new npm dependencies.
    await runCommand("python3", [
      "-c",
      `import pathlib, sys, zipfile
root = pathlib.Path(sys.argv[1])
with zipfile.ZipFile(sys.argv[2], "w", zipfile.ZIP_DEFLATED, compresslevel=9) as archive:
    for path in sorted(root.rglob("*")):
        if path.is_file():
            archive.write(path, path.relative_to(root).as_posix())
`,
      outputDirectory,
      temporaryArchivePath,
    ]);
    await rename(temporaryArchivePath, archivePath);
  } finally {
    await rm(temporaryArchivePath, { force: true });
  }
  console.log("Upload .tmp/itch/xprite-itch.zip to itch.io as an HTML project.");
}

async function publishEditor() {
  const target = process.argv[3];
  if (!target || !/^[a-z0-9][a-z0-9-]*\/[a-z0-9][a-z0-9-]*$/.test(target))
    throw new Error("Use pnpm run deploy:itch username/project (without a URL or channel).");
  const metadata = await validateArtifact();
  await runCommand("butler", [
    "push",
    outputDirectory,
    `${target}:html`,
    "--userversion",
    metadata.version,
  ]);
  console.log(
    "Uploaded the html channel. Mark it as playable in browser on the itch.io edit page.",
  );
}

try {
  switch (process.argv[2]) {
    case "build":
      await buildEditor();
      break;
    case "pack":
      await packEditor();
      break;
    case "publish":
      await publishEditor();
      break;
    default:
      throw new Error("Use build, pack or publish.");
  }
} catch (error) {
  console.error(error instanceof Error ? error.message : String(error));
  process.exitCode = 1;
}
