import { readFile } from "node:fs/promises";
import { fileURLToPath } from "node:url";

import typescript from "typescript-compiler-api";

const configurationPath = fileURLToPath(
  new URL("../../services/share/wrangler.jsonc", import.meta.url),
);
const source = await readFile(configurationPath, "utf8");
const parsed = typescript.parseConfigFileTextToJson(configurationPath, source);
if (parsed.error) throw new Error("Invalid share service deployment configuration.");
const configuration = parsed.config;
const production = configuration.env?.production;
const database = production?.d1_databases?.find((binding) => binding.binding === "SHARE_DATABASE");
const bucket = production?.r2_buckets?.find((binding) => binding.binding === "SHARE_FILES");
const databaseIdPattern = /^[a-f\d]{8}-[a-f\d]{4}-[a-f\d]{4}-[a-f\d]{4}-[a-f\d]{12}$/iu;
const placeholderId = "00000000-0000-0000-0000-000000000000";
if (
  !database ||
  !databaseIdPattern.test(database.database_id) ||
  database.database_id === placeholderId
) {
  throw new Error(
    "Provision the production D1 database and set its real database_id before deployment.",
  );
}
if (
  !bucket?.bucket_name ||
  bucket.bucket_name === configuration.r2_buckets?.[0]?.bucket_name ||
  production.name === configuration.name
) {
  throw new Error("Production Worker and R2 bucket must be separate from development resources.");
}
if (!production.triggers?.crons?.length)
  throw new Error("Configure the production expiry cleanup schedule.");
const viewer = new URL(production.vars?.PUBLIC_VIEWER_URL);
const origins = production.vars?.ALLOWED_ORIGINS?.split(",").map((value) => value.trim()) ?? [];
if (
  viewer.protocol !== "https:" ||
  viewer.username ||
  viewer.password ||
  viewer.search ||
  viewer.hash ||
  !origins.length ||
  origins.some((origin) => {
    const url = new URL(origin);
    return url.protocol !== "https:" || url.origin !== origin;
  })
)
  throw new Error("Production share URLs and allowed origins must use HTTPS.");
console.log(
  "Share deployment configuration validated. Provision IP_HASH_SECRET and initialize D1 before publishing.",
);
