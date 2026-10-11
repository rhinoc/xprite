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
function compactPrefixRedirects(rules: readonly RedirectRule[]) {
  const shape = (rule: RedirectRule) => {
    const source = /^(\/(?:[^/:*]+\/)+)([^/:*]+)(\/?)$/.exec(rule.source);
    if (!source || rule.destination.includes("#") || rule.destination.includes("?")) return null;
    const destination = /^(\/(?:[^/:*]+\/)*)([^/:*]+)$/.exec(rule.destination);
    if (!destination || destination[2] !== source[2]) return null;
    return { key: `${source[1]}\n${destination[1]}\n${rule.statusCode}`, name: source[2] };
  };
  const names = new Map<string, Set<string>>();
  for (const rule of rules) {
    const match = shape(rule);
    if (match) names.set(match.key, (names.get(match.key) ?? new Set()).add(match.name));
  }
  const collapsible = new Set(
    [...names].filter(([, members]) => members.size >= MIN_GROUP_SIZE).map(([key]) => key),
  );
  const kept = rules.filter((rule) => {
    const match = shape(rule);
    return !match || !collapsible.has(match.key);
  });
  const placeholders = [...collapsible].flatMap((key) => {
    const [sourcePrefix, destinationPrefix, statusCode] = key.split("\n");
    return ["", "/"].map((slash) => ({
      source: `${sourcePrefix}:name${slash}`,
      destination: `${destinationPrefix}:name`,
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

/** Return the same serving behavior with the fewest rules EdgeOne needs to read. */
export function compactServingRules<T extends ServingRules>(configuration: T): T {
  const compacted = {
    ...configuration,
    redirects: compactPrefixRedirects(compactIndexRedirects(configuration.redirects ?? [])),
    rewrites: compactDirectoryRewrites(configuration.rewrites ?? []),
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
