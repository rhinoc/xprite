import { PwaScriptProbeOutcome } from "$/managers/ports/diagnostics";

const SCRIPT_PROBE_TIMEOUT_MS = 3_000;

export interface WorkerScriptDiagnostic {
  script_probe_outcome: PwaScriptProbeOutcome;
  script_probe_status: number | null;
}

/** One ordinary GET: no query/cache buster, redirects, cookies, body inspection or cache writes.
 * This is NOT the browser's update request and cannot establish why that request failed. */
export function diagnoseWorkerScript(
  baseUrl: string,
  signal: AbortSignal,
): Promise<WorkerScriptDiagnostic> {
  const result = (outcome: PwaScriptProbeOutcome, status: number | null = null) => ({
    script_probe_outcome: outcome,
    script_probe_status: status,
  });
  let url: URL;
  try {
    url = new URL(`${baseUrl}sw.js`, window.location.origin);
    if (
      url.origin !== window.location.origin ||
      url.search ||
      url.hash ||
      url.username ||
      url.password
    )
      return Promise.resolve(result(PwaScriptProbeOutcome.Unavailable));
  } catch {
    return Promise.resolve(result(PwaScriptProbeOutcome.Unavailable));
  }
  if (signal.aborted) return Promise.resolve(result(PwaScriptProbeOutcome.Cancelled));
  if (!navigator.onLine) return Promise.resolve(result(PwaScriptProbeOutcome.Offline));
  if (typeof fetch !== "function")
    return Promise.resolve(result(PwaScriptProbeOutcome.Unavailable));
  return new Promise((resolve) => {
    const controller = new AbortController();
    let settled = false;
    const finish = (value: WorkerScriptDiagnostic) => {
      if (settled) return;
      settled = true;
      clearTimeout(timeout);
      signal.removeEventListener("abort", cancel);
      resolve(value);
    };
    const cancel = () => {
      finish(result(PwaScriptProbeOutcome.Cancelled));
      controller.abort();
    };
    const timeout = setTimeout(() => {
      finish(result(PwaScriptProbeOutcome.Timeout));
      controller.abort();
    }, SCRIPT_PROBE_TIMEOUT_MS);
    signal.addEventListener("abort", cancel, { once: true });
    void Promise.resolve()
      .then(() =>
        fetch(url.href, {
          method: "GET",
          mode: "same-origin",
          credentials: "omit",
          cache: "no-store",
          redirect: "manual",
          signal: controller.signal,
        }),
      )
      .then(
        (response) => {
          // Release the body without recording its contents, URL, headers or error text.
          void response.body?.cancel().catch(() => {});
          finish(
            result(
              response.type === "opaqueredirect"
                ? PwaScriptProbeOutcome.Redirect
                : PwaScriptProbeOutcome.Http,
              response.status,
            ),
          );
        },
        () => finish(result(PwaScriptProbeOutcome.Network)),
      );
  });
}
