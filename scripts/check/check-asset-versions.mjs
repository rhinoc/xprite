// Fails when a built page, stylesheet or script loads a stable-name local asset without
// a content version. Usage: node --experimental-transform-types scripts/check/check-asset-versions.mjs [output]
import { resolve } from "node:path";
import { fileURLToPath } from "node:url";

import { findUnversionedReferences } from "../../infra/content-versions.ts";

const repositoryRoot = fileURLToPath(new URL("../../", import.meta.url));
const MAX_REPORTED = 40;

export async function checkAssetVersions(output = resolve(repositoryRoot, ".tmp/site")) {
  const found = await findUnversionedReferences(output);
  if (!found.length) return;
  const lines = found
    .slice(0, MAX_REPORTED)
    .map(({ file, reference }) => `  ${file}: ${reference}`);
  if (found.length > MAX_REPORTED) lines.push(`  … ${found.length - MAX_REPORTED} more`);
  throw new Error(
    `${found.length} stable-name asset reference(s) have no content version (?v=<hash>).\n` +
      `Run the app build so versionOutputDirectory() can version them:\n${lines.join("\n")}`,
  );
}

if (process.argv[1] && resolve(process.argv[1]) === fileURLToPath(import.meta.url)) {
  const output = process.argv[2] ? resolve(process.argv[2]) : undefined;
  await checkAssetVersions(output);
  console.log("Asset versions: every stable-name asset reference carries a content version.");
}
