import { readBoundedBody, readMetadata } from "$/sharing/adapters/http/body";
import type { HttpConfiguration } from "$/sharing/adapters/runtime/configuration";
import type { CleanupService } from "$/sharing/application/cleanup-service";
import type { SharingService } from "$/sharing/application/sharing-service";
import { ShareError, ShareErrorCode } from "$/sharing/domain/errors";
import { ShareState, type PublicShare, type ShareRecord } from "$/sharing/domain/model";
import {
  MANAGEMENT_KEY_PATTERN,
  MAX_FILE_BYTES,
  MAX_IP_BYTES,
  RESERVATION_LIFETIME_MS,
  SHARE_ID_PATTERN,
  SHARE_LIFETIME_MS,
  UPLOAD_RATE_WINDOW_MS,
} from "$/sharing/domain/policy";
import type { ClientIpIdentifier } from "$/sharing/ports/runtime";

const API_PREFIX = "/v1/";
const SHARE_ROUTE = /^\/v1\/shares\/([A-Za-z0-9_-]+)(?:\/(file|upload|manage))?$/u;
const CLIENT_IP_HEADER = "CF-Connecting-IP";
const FILE_CONTENT_TYPE = "application/octet-stream";
const CORS_METHODS = "GET, POST, PUT, DELETE, OPTIONS";
const CORS_HEADERS = "Authorization, Content-Type";
const MILLISECONDS_PER_SECOND = 1_000;
enum Method {
  Get = "GET",
  Post = "POST",
  Put = "PUT",
  Delete = "DELETE",
  Options = "OPTIONS",
}
enum Status {
  Ok = 200,
  Created = 201,
  NoContent = 204,
  BadRequest = 400,
  Unauthorized = 401,
  Forbidden = 403,
  NotFound = 404,
  MethodNotAllowed = 405,
  Conflict = 409,
  Gone = 410,
  TooLarge = 413,
  RateLimited = 429,
  Unavailable = 503,
}

const ERROR_STATUS: Record<ShareErrorCode, Status> = {
  [ShareErrorCode.InvalidRequest]: Status.BadRequest,
  [ShareErrorCode.InvalidFile]: Status.BadRequest,
  [ShareErrorCode.FileTooLarge]: Status.TooLarge,
  [ShareErrorCode.Unauthorized]: Status.Unauthorized,
  [ShareErrorCode.NotFound]: Status.NotFound,
  [ShareErrorCode.Gone]: Status.Gone,
  [ShareErrorCode.Conflict]: Status.Conflict,
  [ShareErrorCode.IpCapacityExceeded]: Status.TooLarge,
  [ShareErrorCode.StorageCapacityExceeded]: Status.Unavailable,
  [ShareErrorCode.RateLimited]: Status.RateLimited,
  [ShareErrorCode.Unavailable]: Status.Unavailable,
};

export class ShareHttpHandler {
  constructor(
    private readonly service: SharingService,
    private readonly cleanup: CleanupService,
    private readonly ips: ClientIpIdentifier,
    private readonly configuration: HttpConfiguration,
  ) {}

  async fetch(request: Request, context: ExecutionContext): Promise<Response> {
    const origin = request.headers.get("Origin");
    if (origin !== null && !this.configuration.allowedOrigins.has(origin))
      return this.finish(
        Response.json({ error: "origin_not_allowed" }, { status: Status.Forbidden }),
        null,
      );
    try {
      const url = new URL(request.url);
      let response: Response;
      if (request.method === Method.Options) {
        if (!url.pathname.startsWith(API_PREFIX))
          throw new ShareError(ShareErrorCode.NotFound, "Endpoint not found.");
        response = new Response(null, { status: Status.NoContent });
      } else response = await this.route(request, url.pathname, context);
      return this.finish(response, origin);
    } catch (error) {
      const failure =
        error instanceof ShareError
          ? error
          : new ShareError(
              ShareErrorCode.Unavailable,
              "The sharing service is temporarily unavailable.",
            );
      if (!(error instanceof ShareError))
        console.error({ event: "share_request_failed", code: failure.code });
      const headers = new Headers();
      if (failure.code === ShareErrorCode.RateLimited)
        headers.set("Retry-After", String(UPLOAD_RATE_WINDOW_MS / MILLISECONDS_PER_SECOND));
      return this.finish(
        Response.json(
          { error: failure.code, message: failure.message },
          { status: ERROR_STATUS[failure.code], headers },
        ),
        origin,
      );
    }
  }

  private async route(
    request: Request,
    path: string,
    context: ExecutionContext,
  ): Promise<Response> {
    if (path === "/v1/policy") {
      if (request.method !== Method.Get) return this.methodNotAllowed(Method.Get);
      return Response.json({
        maxFileBytes: MAX_FILE_BYTES,
        maxIpBytes: MAX_IP_BYTES,
        shareLifetimeMs: SHARE_LIFETIME_MS,
        reservationLifetimeMs: RESERVATION_LIFETIME_MS,
      });
    }
    if (path === "/v1/quota") {
      if (request.method !== Method.Get) return this.methodNotAllowed(Method.Get);
      const capacity = await this.service.capacity(await this.ipKey(request));
      return Response.json({
        ...capacity,
        limitBytes: MAX_IP_BYTES,
        availableBytes: Math.max(0, MAX_IP_BYTES - capacity.usedBytes - capacity.reservedBytes),
      });
    }
    if (path === "/v1/shares") {
      if (request.method !== Method.Post) return this.methodNotAllowed(Method.Post);
      const key = managementKey(request);
      const record = await this.service.reserve(
        await readMetadata(request),
        key,
        await this.ipKey(request),
      );
      return Response.json(this.managedResponse(record), {
        status: record.state === ShareState.Active ? Status.Ok : Status.Created,
      });
    }
    const match = SHARE_ROUTE.exec(path);
    const id = match?.[1];
    if (!id || !SHARE_ID_PATTERN.test(id))
      throw new ShareError(ShareErrorCode.NotFound, "Endpoint not found.");
    const action = match?.[2];
    if (action === "upload") {
      if (request.method !== Method.Put) return this.methodNotAllowed(Method.Put);
      const key = managementKey(request);
      const record = await this.service.managed(id, key);
      if (request.headers.get("Content-Type") !== FILE_CONTENT_TYPE)
        throw new ShareError(ShareErrorCode.InvalidRequest, "Expected application/octet-stream.");
      const bytes = await readBoundedBody(request, record.sizeBytes);
      const share = await this.service.upload(id, key, bytes);
      return Response.json({ ...share, shareUrl: this.shareUrl(share.id) });
    }
    if (action === "manage") {
      if (request.method !== Method.Get) return this.methodNotAllowed(Method.Get);
      return Response.json(
        this.managedResponse(await this.service.managed(id, managementKey(request))),
      );
    }
    if (action === "file") {
      if (request.method !== Method.Get) return this.methodNotAllowed(Method.Get);
      const { share, bytes } = await this.service.download(id);
      return new Response(new Uint8Array(bytes).buffer, {
        headers: {
          "Content-Type": FILE_CONTENT_TYPE,
          "Content-Length": String(bytes.byteLength),
          "Content-Disposition": contentDisposition(share.fileName),
        },
      });
    }
    if (request.method === Method.Delete) {
      await this.service.revoke(id, managementKey(request));
      context.waitUntil(
        this.cleanup.run().catch(() => {
          console.error({ event: "share_cleanup_failed" });
        }),
      );
      return new Response(null, { status: Status.NoContent });
    }
    if (request.method !== Method.Get)
      return this.methodNotAllowed(`${Method.Get}, ${Method.Delete}`);
    const share = await this.service.metadata(id);
    return Response.json({ ...share, shareUrl: this.shareUrl(share.id) });
  }

  private async ipKey(request: Request): Promise<string> {
    const ip = request.headers.get(CLIENT_IP_HEADER);
    if (!ip)
      throw new ShareError(
        ShareErrorCode.Unavailable,
        "Trusted client IP information is unavailable.",
      );
    return this.ips.identify(ip);
  }

  private managedResponse(record: ShareRecord) {
    return {
      id: record.id,
      state: record.state,
      fileName: record.fileName,
      sizeBytes: record.sizeBytes,
      sha256: record.sha256,
      reservationUntil: record.reservationUntil,
      expiresAt: record.expiresAt,
      shareUrl: record.state === ShareState.Active ? this.shareUrl(record.id) : null,
    };
  }

  private shareUrl(id: PublicShare["id"]): string {
    const url = new URL(this.configuration.viewerUrl);
    url.searchParams.set("share", id);
    return url.href;
  }

  private methodNotAllowed(allow: string): Response {
    return Response.json(
      { error: "method_not_allowed" },
      { status: Status.MethodNotAllowed, headers: { Allow: allow } },
    );
  }

  private finish(response: Response, origin: string | null): Response {
    response.headers.set("Cache-Control", "no-store");
    response.headers.set("X-Content-Type-Options", "nosniff");
    response.headers.set("Referrer-Policy", "no-referrer");
    response.headers.set("Content-Security-Policy", "default-src 'none'; frame-ancestors 'none'");
    response.headers.set("Vary", "Origin");
    if (origin !== null) {
      response.headers.set("Access-Control-Allow-Origin", origin);
      response.headers.set("Access-Control-Allow-Methods", CORS_METHODS);
      response.headers.set("Access-Control-Allow-Headers", CORS_HEADERS);
      response.headers.set("Access-Control-Expose-Headers", "Retry-After, Content-Disposition");
    }
    return response;
  }
}

function managementKey(request: Request): string {
  const authorization = request.headers.get("Authorization");
  const key = authorization?.startsWith("Bearer ") ? authorization.slice("Bearer ".length) : "";
  if (!MANAGEMENT_KEY_PATTERN.test(key))
    throw new ShareError(ShareErrorCode.Unauthorized, "A valid management key is required.");
  return key;
}

function contentDisposition(name: string): string {
  const encoded = encodeURIComponent(name).replace(
    /[!'()*]/gu,
    (character) => `%${character.charCodeAt(0).toString(16).toUpperCase()}`,
  );
  return `attachment; filename="sprite.aseprite"; filename*=UTF-8''${encoded}`;
}
