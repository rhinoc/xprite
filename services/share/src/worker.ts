import { D1ShareRepository } from "$/sharing/adapters/cloudflare/d1-repository";
import { R2ShareObjectStore } from "$/sharing/adapters/cloudflare/r2-object-store";
import { ShareHttpHandler } from "$/sharing/adapters/http/handler";
import { httpConfiguration, type ShareEnvironment } from "$/sharing/adapters/runtime/configuration";
import { IpIdentifier, WebCryptoShareRuntime } from "$/sharing/adapters/runtime/web-crypto";
import { CleanupService } from "$/sharing/application/cleanup-service";
import { SharingService } from "$/sharing/application/sharing-service";

const SERVICE_UNAVAILABLE_STATUS = 503;

function compose(env: ShareEnvironment) {
  const runtime = new WebCryptoShareRuntime();
  const repository = new D1ShareRepository(env.SHARE_DATABASE);
  const objects = new R2ShareObjectStore(env.SHARE_FILES);
  const sharing = new SharingService(repository, objects, runtime);
  const cleanup = new CleanupService(repository, objects, runtime);
  return { sharing, cleanup };
}

export default {
  async fetch(request, env, context) {
    try {
      const configuration = httpConfiguration(env);
      const { sharing, cleanup } = compose(env);
      return await new ShareHttpHandler(
        sharing,
        cleanup,
        new IpIdentifier(env.IP_HASH_SECRET),
        configuration,
      ).fetch(request, context);
    } catch {
      console.error({ event: "share_configuration_failed" });
      return Response.json(
        { error: "unavailable", message: "The sharing service is not configured." },
        {
          status: SERVICE_UNAVAILABLE_STATUS,
          headers: { "Cache-Control": "no-store", "X-Content-Type-Options": "nosniff" },
        },
      );
    }
  },
  async scheduled(_controller, env, _context) {
    const result = await compose(env).cleanup.run();
    if (result.failed) console.error({ event: "share_cleanup_incomplete", ...result });
  },
} satisfies ExportedHandler<ShareEnvironment>;
