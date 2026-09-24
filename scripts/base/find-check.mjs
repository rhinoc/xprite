import fs from "node:fs";
import path from "node:path";

const unitTestMap = JSON.parse(
  fs.readFileSync(new URL("./unit-test-map.json", import.meta.url), "utf8"),
);

function findFiles(directory, wanted) {
  const matches = [];
  const visit = (current) => {
    for (const entry of fs.readdirSync(current, { withFileTypes: true })) {
      const candidate = path.join(current, entry.name);
      if (entry.isDirectory()) visit(candidate);
      else if (entry.name === wanted) matches.push(candidate);
    }
  };
  visit(directory);
  return matches;
}

export function findCheck(name) {
  if (!/^[a-z0-9-]+$/.test(name)) throw new Error("Invalid check name: " + name);
  const test = Object.hasOwn(unitTestMap, name) ? unitTestMap[name] : undefined;
  if (test) {
    const testPath = path.resolve(test);
    if (!fs.existsSync(testPath)) throw new Error("Missing source test for " + name + ": " + test);
    return { kind: "vitest", path: test };
  }
  const scriptsFound = findFiles(path.resolve("scripts"), name + ".mjs");
  if (scriptsFound.length !== 1)
    throw new Error("Expected one check for " + name + "; found " + scriptsFound.length);
  return { kind: "script", path: path.relative(process.cwd(), scriptsFound[0]) };
}
