import { parse } from "acorn";
import type { Plugin } from "vite";

/**
 * What the container cannot run: no Workers or WebAssembly, no network, no runtime code
 * evaluation, and no syntax newer than ES2017 in a classic script.
 */
const FORBIDDEN: readonly [string, RegExp][] = [
  ["Worker", /\bnew Worker\b|\bWorker\(/],
  ["WebAssembly", /\bWebAssembly\b/],
  ["importScripts", /\bimportScripts\b/],
  ["fetch", /\bfetch\(/],
  ["XMLHttpRequest", /\bXMLHttpRequest\b/],
  ["eval", /\beval\(/],
  ["new Function", /\bnew Function\b/],
  ["dynamic import", /\bimport\(/],
  ["import.meta", /\bimport\.meta\b/],
];

/** Fails the build when the package would not run in the Xiaohongshu container. */
export function xhsAudit(): Plugin {
  return {
    name: "xprite-minitool-audit",
    apply: "build",
    enforce: "post",
    generateBundle(_, bundle) {
      const problems: string[] = [];
      for (const output of Object.values(bundle)) {
        if (output.type === "asset") {
          if (output.fileName.endsWith(".html") && /type="module"/.test(String(output.source)))
            problems.push(`${output.fileName}: module script`);
          continue;
        }
        for (const [name, pattern] of FORBIDDEN)
          if (pattern.test(output.code)) problems.push(`${output.fileName}: ${name}`);
        try {
          parse(output.code, { ecmaVersion: 2017, sourceType: "script" });
        } catch (error) {
          problems.push(`${output.fileName}: not ES2017 (${(error as Error).message})`);
        }
      }
      if (problems.length) this.error(`Xiaohongshu audit failed:\n${problems.join("\n")}`);
      this.info?.("Xiaohongshu audit: ES2017 classic script, no Worker, fetch or eval.");
    },
  };
}
