import { spawn } from "node:child_process";

const SSR_LAYOUT_EFFECT_WARNING = "Warning: useLayoutEffect does nothing on the server";
const packageManager = process.platform === "win32" ? "pnpm.cmd" : "pnpm";
const build = spawn(packageManager, ["run", "build:growth"], {
  stdio: ["inherit", "pipe", "pipe"],
  windowsHide: true,
});

let warningFound = false;
let spawnFailed = false;

function forward(source, destination) {
  let overlap = "";
  source.setEncoding("utf8");
  source.on("data", (chunk) => {
    destination.write(chunk);
    const output = overlap + chunk;
    if (output.includes(SSR_LAYOUT_EFFECT_WARNING)) warningFound = true;
    overlap = output.slice(-SSR_LAYOUT_EFFECT_WARNING.length);
  });
}

forward(build.stdout, process.stdout);
forward(build.stderr, process.stderr);

build.on("error", (error) => {
  spawnFailed = true;
  console.error(`Unable to start Growth SSG build: ${error.message}`);
});

build.on("close", (code) => {
  if (spawnFailed) {
    process.exitCode = 1;
    return;
  }
  if (code !== 0) {
    process.exitCode = code ?? 1;
    return;
  }
  if (warningFound) {
    console.error(
      "Growth SSG emitted React's useLayoutEffect server-render warning; pre-push is blocked.",
    );
    process.exitCode = 1;
  }
});
