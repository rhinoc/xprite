import { appendFile, mkdir, writeFile } from "node:fs/promises";
import { dirname } from "node:path";

// These are the production API endpoints used by the installed EdgeOne CLI.
const API_ENDPOINTS = ["https://pages-api.cloud.tencent.com/v1", "https://pages-api.edgeone.ai/v1"];
const REQUEST_TIMEOUT_MS = 15_000;
const RESULT_PATH = ".tmp/canary/preview-access.json";
const ACCESS_LINK_HOURS = 3;
const input = new URL(process.env.CANARY_URL ?? "");
const expectedRelease = process.env.CANARY_RELEASE ?? "";
const token = process.env.EDGEONE_API_TOKEN;
if (
  input.protocol !== "https:" ||
  input.username ||
  input.password ||
  input.port ||
  !/^[a-z0-9-]+\.edgeone\.(?:dev|app|site)$/.test(input.hostname) ||
  !/^[a-f0-9]{40}$/.test(expectedRelease) ||
  !token
)
  throw new Error("Provide a Canary deployment URL, exact commit and EdgeOne API token.");

async function verifyRelease(url) {
  const endpoint = new URL(url);
  endpoint.pathname = "/release.json";
  const response = await fetch(endpoint, { signal: AbortSignal.timeout(REQUEST_TIMEOUT_MS) });
  if (!response.ok) throw new Error(`Canary release metadata returned HTTP ${response.status}.`);
  const release = await response.json();
  if (release.environment !== "preview" || release.release !== expectedRelease)
    throw new Error("The URL must serve the exact requested preview release.");
}

// Refresh access to the existing deployment; the website is not redeployed.
const deploymentUrl = new URL("/", input.origin);
await verifyRelease(deploymentUrl);
let access;
for (const endpoint of API_ENDPOINTS) {
  try {
    const response = await fetch(endpoint, {
      method: "POST",
      headers: { "Content-Type": "application/json", Authorization: `Bearer ${token}` },
      body: JSON.stringify({ Action: "DescribePagesEncipherToken", Text: input.hostname }),
      signal: AbortSignal.timeout(REQUEST_TIMEOUT_MS),
    });
    if (!response.ok) continue;
    const result = await response.json();
    const signed = result.Data?.Response;
    if (
      result.Code !== 0 ||
      typeof signed?.Token !== "string" ||
      !signed.Token ||
      !["string", "number"].includes(typeof signed.Timestamp)
    )
      continue;
    access = new URL(deploymentUrl);
    access.searchParams.set("eo_token", signed.Token);
    access.searchParams.set("eo_time", String(signed.Timestamp));
    break;
  } catch {
    // API tokens belong to either the China or international site.
  }
}
if (!access) throw new Error("EdgeOne could not issue a preview access link with this API token.");
await verifyRelease(access);
await mkdir(dirname(RESULT_PATH), { recursive: true });
await writeFile(
  RESULT_PATH,
  `${JSON.stringify(
    {
      url: access.href,
      deploymentUrl: deploymentUrl.href,
      release: expectedRelease,
      environment: "preview",
      refreshedAt: new Date().toISOString(),
      validForHours: ACCESS_LINK_HOURS,
      verified: true,
    },
    null,
    2,
  )}\n`,
);
if (process.env.GITHUB_STEP_SUMMARY)
  await appendFile(
    process.env.GITHUB_STEP_SUMMARY,
    `Canary access refreshed for commit \`${expectedRelease}\`.\n\n[Open Canary](${access.href})\n\nThe temporary access link is valid for ${ACCESS_LINK_HOURS} hours.\n`,
  );
console.log("Canary access link refreshed and its release metadata verified.");
