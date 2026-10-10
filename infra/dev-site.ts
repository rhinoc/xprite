import type { Plugin, ProxyOptions } from "vite";

import { watchDevelopmentDependencies } from "./dev-dependencies.ts";
import configuration from "./dev-site.json" with { type: "json" };

export enum DevelopmentApp {
  Editor = "editor",
  Gallery = "gallery",
  Growth = "growth",
  Tools = "tools",
}

export const DEVELOPMENT_PORTS: Readonly<Record<DevelopmentApp, number>> = configuration.ports;
export const GROWTH_DEVELOPMENT_BASE = configuration.growthBase;
export const GALLERY_DEVELOPMENT_BASE = configuration.galleryBase;
const DEVELOPMENT_IDENTITY_PATH = configuration.identityPath;
const TEMPORARY_REDIRECT_STATUS = 307;

// Put shared artwork before the tools runtime: these files belong to growth's public package.
const GROWTH_ROUTES =
  "^/(?:__growth(?:/|$)|(?:showcase|about|help|learn|compare|privacy|zh-CN)(?:/|\\?|$)|theme(?:/|$)|fusion-pixel/|tools/animal-crossing/|(?:menu-icon\\.svg|social-preview\\.png|robots\\.txt|sitemap\\.xml|llms\\.txt|404\\.html)(?:\\?|$))";
const GALLERY_ROUTES = "^/components(?:/|\\?|$)";
const TOOLS_ROUTES = "^/tools(?:/(?!animal-crossing/)|\\?|$)";
const EDITOR_ROUTES =
  "^/(?:$|\\?|editor(?:/|\\?|$)|src/|@|node_modules/|assets/|__debug/|(?:index\\.html|favicon[^/]*|icon[^/]*|startup[^/]*|manifest\\.webmanifest|sw\\.js)(?:\\?|$))";

/** Each app keeps its own Vite runtime; public navigation stays on the requesting origin. */
export function developmentSiteProxy(app: DevelopmentApp): Record<string, ProxyOptions> {
  const routes: [DevelopmentApp, string][] = [
    [DevelopmentApp.Growth, GROWTH_ROUTES],
    [DevelopmentApp.Gallery, GALLERY_ROUTES],
    [DevelopmentApp.Tools, TOOLS_ROUTES],
    [DevelopmentApp.Editor, EDITOR_ROUTES],
  ];
  return Object.fromEntries(
    routes
      .filter(([owner]) => owner !== app)
      .map(([owner, pattern]) => [
        pattern,
        { target: `http://127.0.0.1:${DEVELOPMENT_PORTS[owner]}`, ws: true },
      ]),
  );
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
          app === DevelopmentApp.Gallery &&
          url.pathname === GALLERY_DEVELOPMENT_BASE.slice(0, -1)
        ) {
          response.writeHead(TEMPORARY_REDIRECT_STATUS, {
            Location: `${GALLERY_DEVELOPMENT_BASE}${url.search}`,
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
