const fs = await import("node:fs/promises");
const { pathToFileURL } = await import("node:url");
const { dirname, resolve } = await import("node:path");
const { spawnSync } = await import("node:child_process");
const run = globalThis.xpriteCoverRun;
const firstPlan = run.jobs[0] ? JSON.parse(await fs.readFile(run.jobs[0].plan, "utf8")) : null;
const repositoryRoot =
  run.root ?? (firstPlan ? resolve(dirname(firstPlan.script), "../..") : process.cwd());
const { captureBrowserScreenshot } = await import(
  pathToFileURL(resolve(repositoryRoot, "scripts/base/screenshot.mjs")).href
);
const CAPTURE_DPR = 1;
const task = run.spaceId
  ? await taskSpace(Number(run.spaceId))
  : await taskSpace("Xprite封面原尺寸截图");
console.log({ spaceId: task.spaceId });
const editorPage = task.page("p1");
let previewPage;

async function nativeViewport(page, size, mobile) {
  await page.cdp("Emulation.setDeviceMetricsOverride", {
    width: size[0],
    height: size[1],
    deviceScaleFactor: CAPTURE_DPR,
    mobile,
  });
  await page.cdp("Emulation.setTouchEmulationEnabled", { enabled: mobile, maxTouchPoints: 1 });
}

async function captureEditor(page, plan, captures, name, mobile) {
  const target = plan[name];
  const source = new URL(plan.url);
  if (source.hostname.endsWith(".localhost")) {
    source.hostname = `cover-${plan.language}-${name}-${target.size.join("x")}.localhost`;
  }
  await nativeViewport(page, target.size, mobile);
  await page.goto(source.href);
  const languageChanged = await page.evaluate((locale) => {
    const key = "xse.ui.language.v1";
    if (localStorage.getItem(key) === locale) return false;
    localStorage.setItem(key, locale);
    return true;
  }, plan.locale);
  if (languageChanged) await page.reload();
  await page.waitForSelector('loc=css:[data-slot="editor-window"]', {
    state: "visible",
    timeout: 20000,
  });
  const labels =
    plan.language === "en"
      ? { home: "Home", canvas: "Sprite canvas", zoom: "Zoom" }
      : { home: "主页", canvas: "精灵画布", zoom: "缩放" };
  await page.click(`loc=role:tab[name='${labels.home}']`);
  await page.click("loc=role:button[name='example.aseprite']");
  await page.waitForSelector(`loc=role:application[name='${labels.canvas}']`, {
    state: "visible",
    timeout: 20000,
  });
  await page.fill(`loc=role:textbox[name='${labels.zoom}']`, String(plan.zooms[name]));
  await page.press(`loc=role:textbox[name='${labels.zoom}']`, "Enter");
  await page.mouse.move(0, 0);
  const capture = await captureBrowserScreenshot(page, {
    path: target.path,
    expectedDpr: CAPTURE_DPR,
    metadataPath: target.path.replace(/\.png$/i, ".json"),
  });
  const size = [capture.pixels.width, capture.pixels.height];
  if (size[0] !== target.size[0] || size[1] !== target.size[1])
    throw new Error(`截图尺寸不匹配：${name} ${size}, expected ${target.size}`);
  captures.push({
    name,
    source: source.href,
    size,
    deviceScaleFactor: CAPTURE_DPR,
    locale: plan.locale,
    capturedAt: new Date().toISOString(),
    capture,
  });
}

const results = [];
for (const job of run.jobs) {
  const plan = JSON.parse(await fs.readFile(job.plan, "utf8"));
  const captures = [];
  if (job.capture) {
    await captureEditor(editorPage, plan, captures, "desktop", false);
    if (plan.show_phone) await captureEditor(editorPage, plan, captures, "mobile", true);
    const result = spawnSync(
      "python3",
      [plan.script, "--config", plan.config, "--output", plan.output, "--html-only", "--resolved"],
      { encoding: "utf8" },
    );
    if (result.status !== 0) throw new Error(result.stderr || result.stdout);
    await fs.writeFile(
      new URL("capture-record.json", pathToFileURL(plan.html)),
      JSON.stringify(captures, null, 2),
    );
  }
  previewPage ??= await task.newPage();
  await nativeViewport(previewPage, plan.canvas, false);
  await previewPage.goto(pathToFileURL(plan.html).href);
  await previewPage.waitForFunction(
    () =>
      document.documentElement.dataset.coverReady === "true" &&
      Array.from(document.images).every((image) => image.complete),
    undefined,
    { timeout: 10000 },
  );
  const capture = await captureBrowserScreenshot(previewPage, {
    path: plan.output,
    expectedDpr: CAPTURE_DPR,
    metadataPath: plan.output.replace(/\.png$/i, ".json"),
  });
  const dimensions = [capture.pixels.width, capture.pixels.height];
  if (dimensions[0] !== plan.output_size[0] || dimensions[1] !== plan.output_size[1])
    throw new Error("封面尺寸不匹配");
  const result = {
    output: plan.output,
    dimensions,
    renderSize: plan.canvas,
    language: plan.language,
    screenshotResizing: false,
    finalImageResizing: false,
    capture,
    captures,
  };
  results.push(result);
  console.log(result);
}
await task.finish({ keep: [] });
console.log({ completed: results.length });
