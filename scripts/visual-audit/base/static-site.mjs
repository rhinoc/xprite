// Serves the assembled deployment (.tmp/site from `pnpm run build:site`) the way EdgeOne does:
// edgeone.json redirects, exact rewrites, wildcard headers and the 404 page. Visual audits run
// against this production build instead of a Vite dev server, so pages load as a few hashed
// bundles rather than hundreds of on-demand module transforms.
import fs from "node:fs";
import http from "node:http";
import path from "node:path";

const types = {
  ".html": "text/html; charset=utf-8",
  ".js": "text/javascript; charset=utf-8",
  ".mjs": "text/javascript; charset=utf-8",
  ".css": "text/css; charset=utf-8",
  ".json": "application/json; charset=utf-8",
  ".webmanifest": "application/manifest+json",
  ".svg": "image/svg+xml",
  ".png": "image/png",
  ".webp": "image/webp",
  ".gif": "image/gif",
  ".ico": "image/x-icon",
  ".jpg": "image/jpeg",
  ".woff": "font/woff",
  ".woff2": "font/woff2",
  ".ttf": "font/ttf",
  ".txt": "text/plain; charset=utf-8",
  ".md": "text/plain; charset=utf-8",
  ".xml": "application/xml",
  ".wasm": "application/wasm",
  ".ase": "application/octet-stream",
  ".aseprite": "application/octet-stream",
};

const matches = (pattern, pathname) =>
  pattern.endsWith("/*")
    ? pathname === pattern.slice(0, -2) || pathname.startsWith(pattern.slice(0, -1))
    : pattern === pathname;

export function startStaticSite({ siteRoot, port, identity }) {
  const config = JSON.parse(fs.readFileSync(path.join(siteRoot, "edgeone.json"), "utf8"));
  const rewrites = new Map(config.rewrites.map((rule) => [rule.source, rule.destination]));
  const redirects = new Map(
    config.redirects
      .filter((rule) => rule.source.startsWith("/"))
      .map((rule) => [rule.source, rule]),
  );
  const resolveFile = (pathname) => {
    const target = path.join(siteRoot, decodeURIComponent(pathname));
    if (!target.startsWith(siteRoot)) return null;
    try {
      const stat = fs.statSync(target);
      if (stat.isFile()) return target;
      if (stat.isDirectory()) {
        const index = path.join(target, "index.html");
        if (fs.existsSync(index)) return index;
      }
    } catch {
      /* missing */
    }
    return null;
  };
  const server = http.createServer((request, response) => {
    const url = new URL(request.url, "http://localhost");
    const pathname = url.pathname;
    if (identity && pathname === identity.path) {
      response.writeHead(200, { "content-type": "application/json" });
      response.end(JSON.stringify(identity.body));
      return;
    }
    const redirect = redirects.get(pathname);
    if (redirect) {
      response.writeHead(redirect.statusCode ?? 301, {
        location: redirect.destination + url.search,
      });
      response.end();
      return;
    }
    const headers = {};
    for (const rule of config.headers)
      if (matches(rule.source, pathname))
        for (const { key, value } of rule.headers) headers[key.toLowerCase()] = value;
    let file = resolveFile(rewrites.get(pathname) ?? pathname);
    let status = 200;
    if (!file) {
      file = path.join(siteRoot, "404.html");
      status = 404;
    }
    headers["content-type"] = types[path.extname(file).toLowerCase()] ?? "application/octet-stream";
    response.writeHead(status, headers);
    if (request.method === "HEAD") response.end();
    else fs.createReadStream(file).pipe(response);
  });
  return new Promise((resolve, reject) => {
    server.once("error", reject);
    server.listen(port, "127.0.0.1", () => resolve(server));
  });
}
