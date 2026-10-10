import { readFileSync } from "node:fs";

const metadata = JSON.parse(readFileSync(new URL("../package.json", import.meta.url), "utf8")) as {
  version: string;
};

export function siteTelemetryDefines(): Record<string, string> {
  return {
    __XPRITE_VERSION__: JSON.stringify(metadata.version),
    __XPRITE_RELEASE__: JSON.stringify(
      process.env.POSTHOG_RELEASE?.trim() ||
        process.env.EDGEONE_COMMIT_SHA?.trim() ||
        metadata.version,
    ),
  };
}
