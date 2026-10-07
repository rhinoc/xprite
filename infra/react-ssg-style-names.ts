import { createHash } from "node:crypto";
import { relative } from "node:path";
import { fileURLToPath } from "node:url";

const REPOSITORY_ROOT = fileURLToPath(new URL("../", import.meta.url));
const HASH_LENGTH = 10;

/** Server and browser compile CSS Modules with the exact same class names. */
export function ssgScopedName(name: string, filename: string) {
  const source = relative(REPOSITORY_ROOT, filename.split("?", 1)[0]).replaceAll("\\", "/");
  return `xprite_${createHash("sha256").update(source).digest("hex").slice(0, HASH_LENGTH)}_${name}`;
}
