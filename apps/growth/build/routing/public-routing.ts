const CANONICAL_HOST = "xprite.cc";
const WWW_HOST = "www.xprite.cc";
const REDIRECT_STATUS = 301;
const NOT_FOUND_STATUS = 404;
const ERROR_PAGE_PATH = "/404.html";
const HEAD_METHOD = "HEAD";

interface PublicRoutingOptions {
  paths: readonly string[];
  redirects: Readonly<Record<string, string>>;
  notFoundHtml: string;
}

interface MiddlewareContext {
  request: Request;
  next: () => Response;
}

/** Only published files and explicit application entry points may reach the SPA host. */
export function createPublicMiddleware(options: PublicRoutingOptions) {
  const paths = new Set(options.paths);
  return ({ request, next }: MiddlewareContext): Response => {
    const url = new URL(request.url);
    if (url.hostname === WWW_HOST) {
      url.hostname = CANONICAL_HOST;
      return new Response(null, { status: REDIRECT_STATUS, headers: { Location: url.href } });
    }
    let pathname: string;
    try {
      pathname = decodeURIComponent(url.pathname);
    } catch {
      pathname = ERROR_PAGE_PATH;
    }
    const destination = options.redirects[pathname];
    if (destination) {
      return new Response(null, {
        status: REDIRECT_STATUS,
        headers: { Location: `${destination}${url.search}` },
      });
    }
    if (pathname === ERROR_PAGE_PATH || !paths.has(pathname)) {
      return new Response(request.method === HEAD_METHOD ? null : options.notFoundHtml, {
        status: NOT_FOUND_STATUS,
        headers: {
          "Content-Type": "text/html; charset=utf-8",
          "Cache-Control": "no-store",
          "X-Robots-Tag": "noindex, follow",
        },
      });
    }
    return next();
  };
}
