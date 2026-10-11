import { describe, expect, it } from "vitest";

import { assertEdgeOneRuleLimits, compactServingRules, resolveRule } from "./edgeone-serving-rules";

const components = Array.from({ length: 60 }, (_, index) => `/components/item-${index}`);
const pages = ["/about/", "/help/", "/features/a/", "/features/b/", "/zh-CN/about/how-it-works/"];
const expanded = {
  redirects: [
    { source: "$wwwhost", destination: "$host", statusCode: 301 },
    { source: "/index.html", destination: "/", statusCode: 301 },
    { source: "/tools/index.html", destination: "/features/", statusCode: 301 },
    { source: "/learn/a/index.html", destination: "/tools/viewer/#a", statusCode: 301 },
    ...pages.flatMap((path) => [
      { source: path.slice(0, -1), destination: path, statusCode: 301 },
      { source: `${path}index.html`, destination: path, statusCode: 301 },
    ]),
    ...components.flatMap((path) => {
      const legacy = path.replace("/components/", "/gallery/components/");
      return [legacy, `${legacy}/`].map((source) => ({
        source,
        destination: path,
        statusCode: 301,
      }));
    }),
  ],
  rewrites: [
    { source: "/editor", destination: "/index.html" },
    ...pages.map((path) => ({ source: path, destination: `${path}index.html` })),
    ...components.flatMap((path) => [
      { source: path, destination: "/components/index.html" },
      { source: `${path}/`, destination: "/components/index.html" },
    ]),
  ],
  headers: [],
};

describe("EdgeOne serving rules", () => {
  it("keeps every generated route's behavior while fitting EdgeOne limits", () => {
    expect(() => assertEdgeOneRuleLimits(expanded)).toThrow(/redirects: 134 rules/);
    const compacted = compactServingRules(expanded);
    expect(() => assertEdgeOneRuleLimits(compacted)).not.toThrow();
    for (const list of ["redirects", "rewrites"] as const) {
      for (const rule of expanded[list].filter((rule) => rule.source.startsWith("/"))) {
        expect(resolveRule(compacted[list], rule.source)?.destination, rule.source).toBe(
          rule.destination,
        );
      }
    }
  });

  it("keeps exact rules for published file paths and special destinations", () => {
    const compacted = compactServingRules(expanded);
    expect(compacted.rewrites).toContainEqual({
      source: "/components/item-0",
      destination: "/components/index.html",
    });
    expect(compacted.rewrites).toContainEqual({
      source: "/components/:name/",
      destination: "/components/index.html",
    });
    expect(resolveRule(compacted.rewrites, "/components/LICENSE")).toBeNull();
    expect(resolveRule(compacted.redirects, "/tools/index.html")?.destination).toBe("/features/");
    expect(resolveRule(compacted.redirects, "/gallery/components/item-3/")?.destination).toBe(
      "/components/item-3",
    );
    expect(compacted.redirects[0]).toEqual(expanded.redirects[0]);
  });
});
