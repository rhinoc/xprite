import { spawn } from "node:child_process";
import { connect } from "node:net";
import { networkInterfaces } from "node:os";
import { setTimeout as delay } from "node:timers/promises";
import { fileURLToPath } from "node:url";

import configuration from "../../infra/dev-site.json" with { type: "json" };

const repositoryRoot = fileURLToPath(new URL("../../", import.meta.url)).replace(/\/$/, "");
const SERVER_START_TIMEOUT_MS = 30_000;
const REQUEST_TIMEOUT_MS = 2_000;
const START_POLL_INTERVAL_MS = 250;
const IS_WINDOWS = process.platform === "win32";
const children = new Set();
let stopping = false;

function stop(exitCode) {
  if (stopping) return;
  stopping = true;
  process.exitCode = exitCode;
  for (const child of children) {
    if (IS_WINDOWS) child.kill("SIGTERM");
    else {
      try {
        process.kill(-child.pid, "SIGTERM");
      } catch (error) {
        if (error.code !== "ESRCH") console.error(error.message);
      }
    }
  }
}

process.once("SIGINT", () => stop(0));
process.once("SIGTERM", () => stop(0));

function isListening(port) {
  return new Promise((resolveListening, reject) => {
    const socket = connect({ host: "127.0.0.1", port });
    socket.setTimeout(REQUEST_TIMEOUT_MS);
    socket.once("connect", () => {
      socket.destroy();
      resolveListening(true);
    });
    socket.once("error", (error) => {
      if (error.code === "ECONNREFUSED") resolveListening(false);
      else reject(error);
    });
    socket.once("timeout", () => {
      socket.destroy();
      reject(new Error(`Port ${port} did not respond.`));
    });
  });
}

async function assertServer(app) {
  const port = configuration.ports[app];
  const response = await fetch(`http://127.0.0.1:${port}${configuration.identityPath}`, {
    signal: AbortSignal.timeout(REQUEST_TIMEOUT_MS),
  });
  const identity = await response.json();
  if (!response.ok || identity.app !== app || identity.root !== repositoryRoot)
    throw new Error(
      `Port ${port} is occupied by a different server; it cannot be reused for ${app}.`,
    );
}

async function start(app) {
  const port = configuration.ports[app];
  if (await isListening(port)) {
    try {
      await assertServer(app);
    } catch (error) {
      throw new Error(`Cannot reuse port ${port} for ${app}: ${error.message}`);
    }
    console.log(`Reusing ${app} on port ${port}.`);
    return;
  }
  if (stopping) return;
  // Execute Vite directly through the workspace command: development does not run builds.
  const child = spawn("pnpm", ["--filter", `@xprite/${app}-app`, "exec", "vite"], {
    cwd: repositoryRoot,
    stdio: "inherit",
    detached: !IS_WINDOWS,
  });
  children.add(child);
  child.once("error", (error) => {
    console.error(error.message);
    stop(1);
  });
  child.once("exit", (code) => {
    children.delete(child);
    if (!stopping) {
      console.error(`${app} stopped (exit ${code}).`);
      stop(1);
    }
  });
  const deadline = Date.now() + SERVER_START_TIMEOUT_MS;
  while (!stopping && Date.now() < deadline) {
    try {
      await assertServer(app);
      return;
    } catch {
      await delay(START_POLL_INTERVAL_MS);
    }
  }
  if (!stopping) throw new Error(`${app} did not start on port ${port}.`);
}

try {
  await Promise.all(Object.keys(configuration.ports).map(start));
  if (!stopping) {
    const hosts = new Set([
      "127.0.0.1",
      ...Object.values(networkInterfaces())
        .flat()
        .filter((address) => address?.family === "IPv4" && !address.internal)
        .map((address) => address.address),
    ]);
    console.log("Unified development entry points:");
    for (const host of hosts) {
      const origin = `http://${host}:${configuration.ports.editor}`;
      console.log(`  ${origin}/editor`);
      console.log(`  ${origin}/showcase/en/`);
      console.log(`  ${origin}/learn/`);
      console.log(`  ${origin}/compare/`);
      console.log(`  ${origin}/help/zh-CN/`);
      console.log(`  ${origin}/tools/`);
      console.log(`  ${origin}/gallery/`);
    }
  }
} catch (error) {
  console.error(error.message);
  stop(1);
}
