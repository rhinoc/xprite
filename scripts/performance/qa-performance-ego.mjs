// Ego payload: run `ego-browser nodejs < scripts/performance/qa-performance-ego.mjs`.
// Existing task space only. Measures a production build through public events.
const task = await taskSpace(2);
if (task.ownership !== "agent") throw new Error("Task space 2 is not agent-owned");
const page = task.page("p1");
const dpr = Number(process.env.ASEPRITE_QA_DPR || 1);
await page.cdp("Emulation.setDeviceMetricsOverride", {
  width: 1405,
  height: 768,
  deviceScaleFactor: dpr,
  mobile: false,
});
await page.cdp("Network.setCacheDisabled", { cacheDisabled: true });
try {
  await page.goto("http://127.0.0.1:4173/editor", { waitUntil: "domcontentloaded" });
  await page.waitForFunction(
    () =>
      performance.getEntriesByType("navigation")[0]?.loadEventEnd > 0 &&
      document.querySelector('[role="tab"][aria-label="Untitled.png"]') &&
      document.fonts.status === "loaded" &&
      [...document.images].every((i) => i.complete) &&
      document.querySelector('canvas[aria-label="Sprite canvas"]')?.width > 0,
  );
  const startup = await page.evaluate(() => {
    const n = performance.getEntriesByType("navigation")[0];
    const resources = performance.getEntriesByType("resource");
    return {
      readyObservedMs: performance.now(),
      domContentLoadedMs: n.domContentLoadedEventEnd,
      loadMs: n.loadEventEnd,
      resources: resources.length,
      transferBytes: resources.reduce((n, r) => n + r.transferSize, 0),
      viewport: { width: innerWidth, height: innerHeight, dpr: devicePixelRatio },
    };
  });
  await page.evaluate(() => {
    const samples = [],
      longTasks = [];
    const canvas = document.querySelector('canvas[aria-label="Sprite canvas"]');
    const onMove = (event) => {
      if (!event.buttons) return;
      const start = performance.now();
      requestAnimationFrame(() =>
        requestAnimationFrame(() => samples.push(performance.now() - start)),
      );
    };
    canvas.addEventListener("pointermove", onMove, { capture: true });
    const observer = new PerformanceObserver((list) =>
      longTasks.push(
        ...list.getEntries().map((e) => ({ start: e.startTime, duration: e.duration })),
      ),
    );
    observer.observe({ type: "longtask" });
    window.__asepritePerformanceQa = {
      samples,
      longTasks,
      stop() {
        observer.disconnect();
        canvas.removeEventListener("pointermove", onMove, { capture: true });
      },
    };
  });
  await page.focus('canvas[aria-label="Sprite canvas"]');
  await page.keyboard.press("b");
  await page.mouse.move(450, 240, { label: "start performance stroke" });
  await page.mouse.down();
  for (let i = 0; i < 24; i++)
    await page.mouse.move(450 + i * 8, 240 + (i % 6) * 3, { label: "measure drawing response" });
  await page.mouse.up();
  await page.mouse.move(600, 12);
  const interaction = await page.evaluate(async () => {
    await new Promise((r) => requestAnimationFrame(() => requestAnimationFrame(r)));
    const q = window.__asepritePerformanceQa;
    q.stop();
    const result = { samples: q.samples, longTasks: q.longTasks };
    delete window.__asepritePerformanceQa;
    return result;
  });
  await page.keyboard.press("ControlOrMeta+z");
  const sorted = interaction.samples.toSorted((a, b) => a - b);
  const report = {
    capturedAt: new Date().toISOString(),
    url: await page.url(),
    method:
      "Uncached local production navigation; capture-phase pointer event to second RAF. Includes render work, not compositor presentation timing.",
    startup,
    interaction: {
      ...interaction,
      medianMs: sorted[Math.floor(sorted.length / 2)],
      p95Ms: sorted[Math.min(sorted.length - 1, Math.ceil(sorted.length * 0.95) - 1)],
    },
  };
  const fs = await import("node:fs/promises");
  await fs.mkdir(`${process.cwd()}/.tmp`, { recursive: true });
  await fs.writeFile(
    `${process.cwd()}/.tmp/browser-production-performance-dpr${dpr}.json`,
    JSON.stringify(report, null, 2),
  );
  console.log(report);
} finally {
  await page.cdp("Network.setCacheDisabled", { cacheDisabled: false });
}
