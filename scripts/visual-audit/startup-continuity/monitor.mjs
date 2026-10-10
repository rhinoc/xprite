/** Installed before parsing; geometry is supplied by the shared UI boundary. */
export function installStartupMonitor(config, geometry) {
  const MAXIMUM_EVENTS = 200;
  const regions = config.regions.map((region) => ({ ...region, seen: false }));
  const events = [];
  const failures = [];
  let frames = 0;
  let readyFrames = 0;
  let readyAt;
  let stopped = false;
  let frame;
  let lastState = "";

  const hasContent = (node) =>
    Boolean(node && (node.textContent.trim() || node.querySelector("canvas, img, svg")));
  const visible = (node) => {
    if (!hasContent(node)) return false;
    for (let current = node; current; current = current.parentElement) {
      const style = geometry.computedStyle(current);
      if (
        current.hidden ||
        style.display === "none" ||
        style.visibility === "hidden" ||
        style.visibility === "collapse" ||
        Number(style.opacity) === 0
      )
        return false;
    }
    const rect = geometry.clientRect(node);
    if (rect.width > 0 && rect.height > 0) return true;
    // Theme scopes and island hosts use display:contents; inspect their children.
    return [...node.children].some(visible);
  };
  const fail = (reason) => {
    if (!failures.some((failure) => failure.reason === reason))
      failures.push({ at: performance.now(), reason });
  };
  const sample = (paint) => {
    if (stopped) return;
    const state = regions.map((region) => {
      const nodes = region.selectors.map((selector) => document.querySelector(selector));
      // Mutation checks catch a removed subtree even if it recovers before the next RAF.
      const present = nodes.some(paint ? visible : hasContent);
      if (present) region.seen = true;
      if (region.seen && !present) fail(`${region.name}: content disappeared`);
      return { name: region.name, present, seen: region.seen };
    });
    const encoded = JSON.stringify(state);
    if (encoded !== lastState && events.length < MAXIMUM_EVENTS) {
      events.push({ at: performance.now(), phase: paint ? "frame" : "mutation", state });
      lastState = encoded;
    }
    if (paint) {
      frames++;
      if (document.querySelector(config.ready) && state.every(({ present }) => present)) {
        readyAt ??= performance.now();
        readyFrames++;
      } else {
        readyAt = undefined;
        readyFrames = 0;
      }
    }
  };
  const observer = new MutationObserver(() => sample(false));
  observer.observe(document, { childList: true, subtree: true, attributes: true });
  const error = (event) => fail(`error: ${event.message}`);
  const rejection = (event) => fail(`unhandled rejection: ${String(event.reason)}`);
  window.addEventListener("error", error);
  window.addEventListener("unhandledrejection", rejection);
  const tick = () => {
    sample(true);
    if (!stopped) frame = requestAnimationFrame(tick);
  };
  frame = requestAnimationFrame(tick);
  window.__xpriteStartupMonitor = {
    get initialized() {
      return regions.every(({ seen }) => seen);
    },
    get complete() {
      return (
        readyAt !== undefined &&
        readyFrames >= config.minimumReadyFrames &&
        performance.now() - readyAt >= config.readyObservationMilliseconds &&
        regions.every(({ seen }) => seen) &&
        document.fonts.status === "loaded" &&
        [...document.images].every((image) => image.complete && image.naturalWidth > 0)
      );
    },
    stop() {
      sample(true);
      const complete = this.complete;
      stopped = true;
      cancelAnimationFrame(frame);
      observer.disconnect();
      window.removeEventListener("error", error);
      window.removeEventListener("unhandledrejection", rejection);
      if (document.querySelector("[data-tool-hydration-error]")) fail("Tool hydration failed");
      if (document.querySelector("[data-public-hydration-error]")) fail("Public hydration failed");
      if (!complete) fail("Startup observation did not complete");
      return { complete, frames, readyFrames, events, failures, regions };
    },
  };
}
