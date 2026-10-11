import type { Plugin, ProxyOptions } from "vite";

import componentRoutes from "../apps/components/build/generated-routes.json" with { type: "json" };
import { TOOL_PATHS } from "../apps/growth/content/tools/index.ts";
import { watchDevelopmentDependencies } from "./dev-dependencies.ts";
import configuration from "./dev-site.json" with { type: "json" };

export enum DevelopmentApp {
  Editor = "editor",
  Components = "components",
  Growth = "growth",
  Tools = "tools",
}

const DEVELOPMENT_APP_ORDER = [
  DevelopmentApp.Editor,
  DevelopmentApp.Components,
  DevelopmentApp.Growth,
  DevelopmentApp.Tools,
] as const;
const PORT_BASE_ENVIRONMENT_VARIABLE = "XPRITE_DEV_PORT_BASE";

function developmentPorts(): Readonly<Record<DevelopmentApp, number>> {
  const configuredBase = process.env[PORT_BASE_ENVIRONMENT_VARIABLE];
  if (configuredBase === undefined) return configuration.ports;
  const base = Number(configuredBase);
  if (!Number.isInteger(base) || base < 1024 || base + DEVELOPMENT_APP_ORDER.length - 1 > 65535)
    throw new Error(
      `${PORT_BASE_ENVIRONMENT_VARIABLE} must be an available base port from 1024 to 65532.`,
    );
  return Object.freeze(
    Object.fromEntries(DEVELOPMENT_APP_ORDER.map((app, index) => [app, base + index])) as Record<
      DevelopmentApp,
      number
    >,
  );
}

export const DEVELOPMENT_PORTS = developmentPorts();
export const GROWTH_DEVELOPMENT_BASE = configuration.growthBase;
export const COMPONENTS_DEVELOPMENT_BASE = configuration.componentsBase;
const DEVELOPMENT_IDENTITY_PATH = configuration.identityPath;
const TEMPORARY_REDIRECT_STATUS = 307;

// Put shared artwork before the tools runtime: these files belong to growth's public package.
const GROWTH_ROUTES =
  "^/(?:__growth(?:/|$)|(?:showcase|about|features|help|learn|compare|privacy|zh-CN)(?:/|\\?|$)|theme(?:/|$)|(?:fusion-pixel|pixel-code)/|tools/animal-crossing/|(?:menu-icon\\.svg|social-preview\\.png|robots\\.txt|sitemap\\.xml|llms\\.txt|404\\.html)(?:\\?|$))";
const escapeRoute = (path: string) => path.replace(/[.*+?^${}()|[\]\\]/g, "\\$&");
const COMPONENTS_ROUTES = `^(?:${componentRoutes.map((path) => `${escapeRoute(path.replace(/\/$/, ""))}/?`).join("|")}|/components/index\\.html)(?:\\?|$)|^/components/(?:src/|@|node_modules/|assets/|menu-icon\\.svg(?:\\?|$))`;
const TOOLS_ROUTES = `^(?:/tools(?:/index\\.html)?/?|${TOOL_PATHS.map((path) => `${escapeRoute(path.replace(/\/$/, ""))}(?:/index\\.html|/)?`).join("|")})(?:\\?|$)|^/tools/(?:src/|@|node_modules/|assets/|ssg-assets/)`;
const EDITOR_ROUTES =
  "^/(?:$|\\?|editor/?(?:\\?|$)|src/|@|node_modules/|assets/|agent/|__debug/|(?:index\\.html|favicon[^/]*|icon[^/]*|startup[^/]*|manifest\\.webmanifest|sw\\.js)(?:\\?|$))";

/** Each app keeps its own Vite runtime; public navigation stays on the requesting origin. */
export function developmentSiteProxy(app: DevelopmentApp): Record<string, ProxyOptions> {
  const routes: [DevelopmentApp, string][] = [
    [DevelopmentApp.Growth, GROWTH_ROUTES],
    [DevelopmentApp.Components, COMPONENTS_ROUTES],
    [DevelopmentApp.Tools, TOOLS_ROUTES],
    [DevelopmentApp.Editor, EDITOR_ROUTES],
  ];
  const proxies: Record<string, ProxyOptions> = Object.fromEntries(
    routes
      .filter(([owner]) => owner !== app)
      .map(([owner, pattern]) => [
        pattern,
        { target: `http://127.0.0.1:${DEVELOPMENT_PORTS[owner]}`, ws: true },
      ]),
  );
  if (app !== DevelopmentApp.Growth) {
    const knownRoutes = routes.map(([, pattern]) => pattern.slice(1)).join("|");
    proxies[`^(?!${knownRoutes})/`] = {
      target: `http://127.0.0.1:${DEVELOPMENT_PORTS[DevelopmentApp.Growth]}`,
    };
  }
  return proxies;
}

/** Let the launcher distinguish this workspace's servers from unrelated occupied ports. */
export function developmentServerIdentity(app: DevelopmentApp, root: string): Plugin {
  let stopWatchingDependencies: (() => void) | undefined;
  return {
    name: "xprite-development-server-identity",
    apply: "serve",
    configureServer(server) {
      stopWatchingDependencies = watchDevelopmentDependencies(server, root);
      server.middlewares.use((request, response, next) => {
        const url = new URL(request.url ?? "/", "http://localhost");
        if (
          app === DevelopmentApp.Components &&
          url.pathname === COMPONENTS_DEVELOPMENT_BASE.slice(0, -1)
        ) {
          response.writeHead(TEMPORARY_REDIRECT_STATUS, {
            Location: `${COMPONENTS_DEVELOPMENT_BASE}${url.search}`,
          });
          response.end();
          return;
        }
        if (request.url?.split("?", 1)[0] !== DEVELOPMENT_IDENTITY_PATH) return next();
        response.setHeader("Content-Type", "application/json");
        response.setHeader("Cache-Control", "no-store");
        response.end(JSON.stringify({ app, root }));
      });
    },
    closeBundle() {
      stopWatchingDependencies?.();
    },
  };
}
