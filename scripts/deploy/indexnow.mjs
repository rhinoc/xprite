// IndexNow for production deployments. `plan` runs before publishing: it compares each
// sitemap page in the prepared artifact with the page the live site serves now, ignoring
// hashed build assets, and records the pages whose content differs. `submit` runs after the verified publish and sends that list to
// IndexNow so Bing and the other participating engines recrawl it. The key is public
// (infra/indexnow.ts); no secret is involved. Preview deployments are noindex and skipped.
// Set INDEXNOW_DRY_RUN=1 to print the request instead of sending it, and INDEXNOW_ALL=1 to
// submit every sitemap page, for example for the first production deployment.
import { createHash } from "node:crypto";
import { mkdir, readFile, writeFile } from "node:fs/promises";
import { dirname, join } from "node:path";
import { fileURLToPath } from "node:url";

import {
  INDEXNOW_ENDPOINT,
  INDEXNOW_HOST,
  INDEXNOW_KEY,
  INDEXNOW_KEY_FILE,
  INDEXNOW_KEY_LOCATION,
  contentSignature,
  indexNowPayloads,
  publishedFilePath,
  sitemapUrls,
} from "../../infra/indexnow.ts";

const repositoryRoot = fileURLToPath(new URL("../../", import.meta.url));
const deploymentDirectory = join(repositoryRoot, ".tmp/deploy/editor");
const plannedUrlsPath = join(repositoryRoot, ".tmp/deploy/indexnow-urls.json");
const REQUEST_TIMEOUT_MS = 15_000;
const FETCH_CONCURRENCY = 8;

const digest = (data) => createHash("sha256").update(data).digest("hex");

async function liveDigest(url) {
  try {
    const response = await fetch(url, {
      redirect: "manual",
      signal: AbortSignal.timeout(REQUEST_TIMEOUT_MS),
    });
    return response.status === 200 ? digest(contentSignature(await response.text())) : undefined;
  } catch {
    return undefined;
  }
}

async function plan() {
  if (process.env.EDGEONE_ENV !== "production") {
    console.log("IndexNow: skipped, only production deployments are submitted.");
    return;
  }
  const keyFile = (await readFile(join(deploymentDirectory, INDEXNOW_KEY_FILE), "utf8")).trim();
  if (keyFile !== INDEXNOW_KEY)
    throw new Error(`${INDEXNOW_KEY_FILE} must contain exactly the IndexNow key.`);
  const urls = sitemapUrls(await readFile(join(deploymentDirectory, "sitemap.xml"), "utf8"));
  const changed = [];
  let next = 0;
  await Promise.all(
    Array.from({ length: FETCH_CONCURRENCY }, async () => {
      while (next < urls.length) {
        const url = urls[next++];
        const built = digest(
          contentSignature(
            await readFile(join(deploymentDirectory, publishedFilePath(url)), "utf8"),
          ),
        );
        // A page the live site does not serve yet counts as changed.
        if (process.env.INDEXNOW_ALL === "1" || (await liveDigest(url)) !== built)
          changed.push(url);
      }
    }),
  );
  changed.sort((a, b) => urls.indexOf(a) - urls.indexOf(b));
  await mkdir(dirname(plannedUrlsPath), { recursive: true });
  await writeFile(plannedUrlsPath, `${JSON.stringify(changed, null, 2)}\n`);
  console.log(`IndexNow: ${changed.length} of ${urls.length} sitemap pages changed.`);
}

async function submit() {
  if (process.env.EDGEONE_ENV !== "production") {
    console.log("IndexNow: skipped, only production deployments are submitted.");
    return;
  }
  const urls = JSON.parse(await readFile(plannedUrlsPath, "utf8"));
  if (!urls.length) {
    console.log("IndexNow: no changed pages to submit.");
    return;
  }
  const keyResponse = await fetch(INDEXNOW_KEY_LOCATION, {
    signal: AbortSignal.timeout(REQUEST_TIMEOUT_MS),
  });
  if (!keyResponse.ok || (await keyResponse.text()).trim() !== INDEXNOW_KEY)
    throw new Error(`The IndexNow key is not served at ${INDEXNOW_KEY_LOCATION}.`);
  for (const payload of indexNowPayloads(urls)) {
    if (process.env.INDEXNOW_DRY_RUN === "1") {
      console.log(
        `IndexNow dry run: POST ${INDEXNOW_ENDPOINT}\n${JSON.stringify(payload, null, 2)}`,
      );
      continue;
    }
    const response = await fetch(INDEXNOW_ENDPOINT, {
      method: "POST",
      headers: { "Content-Type": "application/json; charset=utf-8" },
      body: JSON.stringify(payload),
      signal: AbortSignal.timeout(REQUEST_TIMEOUT_MS),
    });
    // 200 and 202 mean accepted; 202 means the key is still being validated.
    if (response.status !== 200 && response.status !== 202)
      throw new Error(
        `IndexNow rejected the submission for ${INDEXNOW_HOST}: HTTP ${response.status}.`,
      );
    console.log(`IndexNow: submitted ${payload.urlList.length} URLs (HTTP ${response.status}).`);
  }
}

try {
  switch (process.argv[2]) {
    case "plan":
      await plan();
      break;
    case "submit":
      await submit();
      break;
    default:
      throw new Error("Use plan or submit.");
  }
} catch (error) {
  console.error(error instanceof Error ? error.message : String(error));
  process.exitCode = 1;
}
