/**
 * EdgeOne Makers ignores every `edgeone.json` rule after the documented per-list limits
 * (https://pages.edgeone.ai/document/limits-and-quotas). Deployment staging generates exact
 * rules for every page and component route, so it compacts repeated shapes into `:name`
 * placeholder rules and fails before upload when a list still exceeds its limit.
 */
const EDGEONE_RULE_LIMITS = { redirects: 100, rewrites: 100, headers: 30 } as const;

interface RedirectRule {
  source: string;
  destination: string;
  statusCode: number;
}

interface RewriteRule {
  source: string;
  destination: string;
}

interface ServingRules {
  redirects?: readonly RedirectRule[];
  rewrites?: readonly RewriteRule[];
  headers?: readonly unknown[];
}

const INDEX_SUFFIX = "/index.html";
const MIN_GROUP_SIZE = 3;
const SEGMENT_PATTERN = /^[^/:*]+$/;

function segments(path: string) {
  return path.split("/").filter(Boolean);
}

function placeholderPath(depth: number) {
  return Array.from({ length: depth }, (_, index) => `/:p${index + 1}`).join("");
}

/** `/a/b/index.html` → `/a/b/` redirects become one `/:p1/:p2/index.html` rule per depth. */
function compactIndexRedirects(rules: readonly RedirectRule[]) {
  const generic = (rule: RedirectRule) =>
    rule.source.endsWith(INDEX_SUFFIX) &&
    rule.source !== INDEX_SUFFIX &&
    rule.destination === rule.source.slice(0, -"index.html".length) &&
    segments(rule.destination).every((segment) => SEGMENT_PATTERN.test(segment));
  const keyOf = (rule: RedirectRule) => `${segments(rule.destination).length}:${rule.statusCode}`;
  const counts = new Map<string, number>();
  for (const rule of rules.filter(generic))
    counts.set(keyOf(rule), (counts.get(keyOf(rule)) ?? 0) + 1);
  const collapsible = new Set(
    [...counts].filter(([, count]) => count >= MIN_GROUP_SIZE).map(([key]) => key),
  );
  const kept = rules.filter((rule) => !generic(rule) || !collapsible.has(keyOf(rule)));
  const placeholders = [...collapsible].map((key) => {
    const [depth, statusCode] = key.split(":").map(Number);
    const path = placeholderPath(depth);
    return { source: `${path}${INDEX_SUFFIX}`, destination: `${path}/`, statusCode };
  });
  return [...kept, ...placeholders];
}

/** `/old/x` and `/old/x/` → `/new/x` for many `x` become `/old/:name(/)` → `/new/:name`. */
function compactPrefixRedirects(
  rules: readonly RedirectRule[],
  publishedFiles: readonly string[] = [],
) {
  const fileFolders = new Set(
    publishedFiles
      .filter((file) => !file.endsWith(INDEX_SUFFIX))
      .map((file) => file.slice(0, file.lastIndexOf("/") + 1)),
  );
  const shape = (rule: RedirectRule) => {
    const source = /^(\/(?:[^/:*]+\/)+)([^/:*]+)(\/?)$/.exec(rule.source);
    if (!source || rule.destination.includes("#") || rule.destination.includes("?")) return null;
    const destination = /^(\/(?:[^/:*]+\/)*)([^/:*]+)(\/?)$/.exec(rule.destination);
    if (!destination || destination[2] !== source[2]) return null;
    // A trailing-slash destination (`/a/x` → `/a/x/`) only collapses the slashless source.
    if (destination[3] && source[3]) return null;
    return {
      key: `${source[1]}\n${destination[1]}\n${rule.statusCode}\n${destination[3]}`,
      name: source[2],
    };
  };
  const names = new Map<string, Set<string>>();
  for (const rule of rules) {
    const match = shape(rule);
    if (match) names.set(match.key, (names.get(match.key) ?? new Set()).add(match.name));
  }
  // A placeholder over a folder that also holds published files would redirect those files.
  const collapsible = new Set(
    [...names]
      .filter(
        ([key, members]) => members.size >= MIN_GROUP_SIZE && !fileFolders.has(key.split("\n")[0]),
      )
      .map(([key]) => key),
  );
  const kept = rules.filter((rule) => {
    const match = shape(rule);
    return !match || !collapsible.has(match.key);
  });
  const placeholders = [...collapsible].flatMap((key) => {
    const [sourcePrefix, destinationPrefix, statusCode, trailing] = key.split("\n");
    return (trailing ? [""] : ["", "/"]).map((slash) => ({
      source: `${sourcePrefix}:name${slash}`,
      destination: `${destinationPrefix}:name${trailing}`,
      statusCode: Number(statusCode),
    }));
  });
  return [...kept, ...placeholders];
}

/**
 * `/app/x/` → `/app/index.html` for many `x` becomes `/app/:name/`. Paths without a trailing
 * slash stay exact so a placeholder never shadows a published file such as `/app/LICENSE`.
 */
function compactDirectoryRewrites(rules: readonly RewriteRule[]) {
  const shape = (rule: RewriteRule) => {
    const source = /^(\/(?:[^/:*]+\/)+)[^/:*]+\/$/.exec(rule.source);
    return source ? `${source[1]}\n${rule.destination}` : null;
  };
  const counts = new Map<string, number>();
  for (const rule of rules) {
    const key = shape(rule);
    if (key) counts.set(key, (counts.get(key) ?? 0) + 1);
  }
  const collapsible = new Set(
    [...counts].filter(([, count]) => count >= MIN_GROUP_SIZE).map(([key]) => key),
  );
  const kept = rules.filter((rule) => !collapsible.has(shape(rule) ?? ""));
  const placeholders = [...collapsible].map((key) => {
    const [prefix, destination] = key.split("\n");
    return { source: `${prefix}:name/`, destination };
  });
  return [...kept, ...placeholders];
}

/** `/a/x/` → `/a/x/index.html` for many `x` becomes `/a/:name/` → `/a/:name/index.html`. */
function compactIndexRewrites(rules: readonly RewriteRule[]) {
  const shape = (rule: RewriteRule) => {
    const source = /^(\/(?:[^/:*]+\/)+)[^/:*]+\/$/.exec(rule.source);
    return source && rule.destination === `${rule.source}index.html` ? source[1] : null;
  };
  const counts = new Map<string, number>();
  for (const rule of rules) {
    const key = shape(rule);
    if (key) counts.set(key, (counts.get(key) ?? 0) + 1);
  }
  const collapsible = new Set(
    [...counts].filter(([, count]) => count >= MIN_GROUP_SIZE).map(([key]) => key),
  );
  const kept = rules.filter((rule) => !collapsible.has(shape(rule) ?? ""));
  const placeholders = [...collapsible].map((prefix) => ({
    source: `${prefix}:name/`,
    destination: `${prefix}:name/index.html`,
  }));
  return [...kept, ...placeholders];
}

/** Return the same serving behavior with the fewest rules EdgeOne needs to read. */
export function compactServingRules<T extends ServingRules>(
  configuration: T,
  publishedFiles: readonly string[] = [],
): T {
  const compacted = {
    ...configuration,
    redirects: compactPrefixRedirects(
      compactIndexRedirects(configuration.redirects ?? []),
      publishedFiles,
    ),
    rewrites: compactIndexRewrites(compactDirectoryRewrites(configuration.rewrites ?? [])),
  };
  for (const list of ["redirects", "rewrites"] as const) {
    for (const rule of configuration[list] ?? []) {
      if (!rule.source.startsWith("/") || rule.source.includes(":")) continue;
      const resolved = resolveRule(compacted[list], rule.source)?.destination;
      if (resolved !== rule.destination)
        throw new Error(
          `Compacted ${list} changed ${rule.source}: ${rule.destination} became ${resolved}.`,
        );
    }
  }
  for (const list of ["redirects", "rewrites"] as const) {
    // `index.html` copies are meant to redirect to their folder, so only other files must keep serving.
    for (const file of publishedFiles.filter((path) => !path.endsWith(INDEX_SUFFIX))) {
      const before = resolveRule(configuration[list] ?? [], file)?.destination;
      const after = resolveRule(compacted[list], file)?.destination;
      if (before !== after)
        throw new Error(
          `Compacted ${list} changed published file ${file}: ${before} became ${after}.`,
        );
    }
  }
  return compacted;
}

/** Throw when EdgeOne would silently drop rules beyond its documented limits. */
export function assertEdgeOneRuleLimits(configuration: ServingRules) {
  const problems = Object.entries(EDGEONE_RULE_LIMITS).flatMap(([list, limit]) => {
    const count = configuration[list as keyof ServingRules]?.length ?? 0;
    return count > limit ? [`${list}: ${count} rules (EdgeOne reads at most ${limit})`] : [];
  });
  if (problems.length)
    throw new Error(
      `EdgeOne would ignore serving rules beyond its limits: ${problems.join("; ")}.`,
    );
}

function matchPattern(pattern: string, path: string) {
  if (!pattern.includes(":")) return pattern === path ? {} : null;
  const names: string[] = [];
  const expression = pattern
    .split(/(:[A-Za-z0-9]+)/)
    .map((part) => {
      if (!part.startsWith(":")) return part.replace(/[.*+?^${}()|[\]\\]/g, "\\$&");
      names.push(part.slice(1));
      return "([^/]+)";
    })
    .join("");
  const match = new RegExp(`^${expression}$`).exec(path);
  if (!match) return null;
  return Object.fromEntries(names.map((name, index) => [name, match[index + 1]]));
}

/**
 * Resolve a path the way EdgeOne documents rule matching: exact paths and single-segment
 * `:name` placeholders, with exact rules taking precedence and otherwise the first match.
 */
export function resolveRule<T extends RewriteRule>(rules: readonly T[], path: string) {
  const ordered = [
    ...rules.filter((rule) => !rule.source.includes(":")),
    ...rules.filter((rule) => rule.source.includes(":")),
  ];
  for (const rule of ordered) {
    const parameters = matchPattern(rule.source, path);
    if (!parameters) continue;
    const destination = rule.destination.replace(
      /:([A-Za-z0-9]+)/g,
      (placeholder, name: string) => parameters[name] ?? placeholder,
    );
    return { rule, destination };
  }
  return null;
}

export interface HeaderRule {
  source: string;
  headers: readonly { key: string; value: string }[];
}

/** Documented `source` forms: exact paths, `:name` segments and one `*` (optionally `/x/*.ext`). */
function headerSourcePattern(source: string) {
  const expression = source
    .split(/(:[A-Za-z0-9]+|\*)/)
    .map((part) => {
      if (part === "*") return ".*";
      if (/^:[A-Za-z0-9]+$/.test(part)) return "[^/]+";
      return part.replace(/[.*+?^${}()|[\]\\]/g, "\\$&");
    })
    .join("");
  return new RegExp(`^${expression}$`);
}

/**
 * Response headers that `headers` rules add to a request path. Every matching rule applies in
 * list order, so a later, more specific rule replaces a broader rule's value for the same key,
 * as in EdgeOne's `/*` then `/assets/*` Cache-Control example. Keys are lower-cased.
 */
export function responseHeaders(rules: readonly HeaderRule[], path: string) {
  const headers: Record<string, string> = {};
  for (const rule of rules)
    if (headerSourcePattern(rule.source).test(path))
      for (const { key, value } of rule.headers) headers[key.toLowerCase()] = value;
  return headers;
}

/** Every rule matching `path` that sets `key`, in list order. */
export function matchingHeaderValues(rules: readonly HeaderRule[], path: string, key: string) {
  return rules
    .filter((rule) => headerSourcePattern(rule.source).test(path))
    .flatMap((rule) =>
      rule.headers.filter((header) => header.key.toLowerCase() === key.toLowerCase()),
    )
    .map((header) => header.value);
}
