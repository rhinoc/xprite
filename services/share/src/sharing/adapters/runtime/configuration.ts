const MIN_SECRET_BYTES = 32;

export interface ShareEnvironment {
  SHARE_DATABASE: D1Database;
  SHARE_FILES: R2Bucket;
  IP_HASH_SECRET: string;
  ALLOWED_ORIGINS: string;
  PUBLIC_VIEWER_URL: string;
}

export interface HttpConfiguration {
  allowedOrigins: ReadonlySet<string>;
  viewerUrl: string;
}

export function httpConfiguration(env: ShareEnvironment): HttpConfiguration {
  if (
    !env.IP_HASH_SECRET ||
    new TextEncoder().encode(env.IP_HASH_SECRET).byteLength < MIN_SECRET_BYTES
  )
    throw new Error("Configure IP_HASH_SECRET with at least 32 random bytes");
  if (!env.ALLOWED_ORIGINS || !env.PUBLIC_VIEWER_URL)
    throw new Error("Configure allowed origins and the viewer URL");
  const allowedOrigins = new Set(
    env.ALLOWED_ORIGINS.split(",").map((origin) => {
      const value = origin.trim();
      const url = new URL(value);
      if (!isAllowedUrl(url) || url.origin !== value) throw new Error("Invalid allowed origin");
      return value;
    }),
  );
  const viewerUrl = new URL(env.PUBLIC_VIEWER_URL);
  if (!isAllowedUrl(viewerUrl) || viewerUrl.search || viewerUrl.hash)
    throw new Error("Invalid public viewer URL");
  return { allowedOrigins, viewerUrl: viewerUrl.href };
}

function isAllowedUrl(url: URL): boolean {
  return (
    !url.username &&
    !url.password &&
    (url.protocol === "https:" ||
      (url.protocol === "http:" && (url.hostname === "localhost" || url.hostname === "127.0.0.1")))
  );
}
