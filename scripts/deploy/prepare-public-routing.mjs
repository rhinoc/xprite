import { readFile, readdir, writeFile } from "node:fs/promises";
import { dirname, join } from "node:path";
import { fileURLToPath } from "node:url";

import { build } from "esbuild";

const ROUTING_SOURCE = fileURLToPath(
  new URL("../../apps/growth/build/routing/public-routing.ts", import.meta.url),
);
const MIDDLEWARE_FILENAME = "middleware.js";
const PRIVATE_FILES = new Set(["edgeone.json", MIDDLEWARE_FILENAME]);
const ENTRY_PATHS = ["/", "/editor", "/editor/", "/tools/viewer/", "/showcase", "/showcase/"];
const INDEX_FILENAME = "index.html";

async function publishedFiles(directory, prefix = "") {
  const paths = [];
  for (const entry of await readdir(directory, { withFileTypes: true })) {
    const filename = `${prefix}${entry.name}`;
    if (entry.isDirectory())
      paths.push(...(await publishedFiles(join(directory, entry.name), `${filename}/`)));
    else if (entry.isFile() && !PRIVATE_FILES.has(filename)) {
      paths.push(`/${filename}`);
      if (entry.name === INDEX_FILENAME) paths.push(`/${prefix}`);
    }
  }
  return paths;
}

/** Bundle a stateless path guard with this package's exact public resource inventory. */
export async function preparePublicRouting(directory, configuration) {
  const paths = [
    ...new Set([
      ...ENTRY_PATHS,
      ...(configuration.rewrites ?? []).map(({ source }) => source),
      ...(await publishedFiles(directory)),
    ]),
  ];
  const redirects = Object.fromEntries(
    (configuration.redirects ?? [])
      .filter(({ source }) => source.startsWith("/"))
      .map(({ source, destination }) => [source, destination]),
  );
  const notFoundHtml = await readFile(join(directory, "404.html"), "utf8");
  const options = JSON.stringify({ paths, redirects, notFoundHtml });
  const result = await build({
    stdin: {
      contents: `import { createPublicMiddleware } from ${JSON.stringify(ROUTING_SOURCE)};
export const middleware = createPublicMiddleware(${options});
export const config = { matcher: ["/:path*"] };`,
      loader: "ts",
      sourcefile: "editor-middleware.ts",
      resolveDir: dirname(ROUTING_SOURCE),
    },
    bundle: true,
    format: "esm",
    platform: "neutral",
    target: "es2022",
    write: false,
  });
  await writeFile(join(directory, MIDDLEWARE_FILENAME), result.outputFiles[0].text);
}
