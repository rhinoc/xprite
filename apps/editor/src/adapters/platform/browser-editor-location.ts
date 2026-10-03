import { EditorPageRoute, type EditorLocationPort } from "$/managers/ports/platform";

const HASH_ROUTE_PREFIX = "#";
const HOME_PAGE_PATH = "/";

/** Hash routes keep an embedded build inside its CDN directory and entry file. */
export function createBrowserEditorLocation(): EditorLocationPort {
  return {
    read: () =>
      __XPRITE_ITCH__
        ? window.location.hash.slice(HASH_ROUTE_PREFIX.length)
        : window.location.pathname,
    write: (route, appendHistory) => {
      const pagePath = !__XPRITE_ITCH__ && route === EditorPageRoute.Home ? HOME_PAGE_PATH : route;
      const target = __XPRITE_ITCH__
        ? `${window.location.pathname}${window.location.search}${HASH_ROUTE_PREFIX}${pagePath}`
        : `${pagePath}${window.location.search}${window.location.hash}`;
      if (appendHistory) window.history.pushState(window.history.state, "", target);
      else window.history.replaceState(window.history.state, "", target);
    },
    subscribe: (onChange) => {
      window.addEventListener("popstate", onChange);
      if (__XPRITE_ITCH__) window.addEventListener("hashchange", onChange);
      return () => {
        window.removeEventListener("popstate", onChange);
        if (__XPRITE_ITCH__) window.removeEventListener("hashchange", onChange);
      };
    },
  };
}
