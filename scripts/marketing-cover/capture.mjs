const fs = await import("node:fs/promises");
const { pathToFileURL } = await import("node:url");
const { spawnSync } = await import("node:child_process");
const run = globalThis.xpriteCoverRun;
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
    deviceScaleFactor: 1,
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
  await page.waitForSelector('loc=css:[aria-label="Pixel editor"]', {
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
  await page.evaluate(
    () => new Promise((resolve) => requestAnimationFrame(() => requestAnimationFrame(resolve))),
  );
  await page.screenshot({ path: target.path });
  const png = await fs.readFile(target.path);
  const size = [png.readUInt32BE(16), png.readUInt32BE(20)];
  if (size[0] !== target.size[0] || size[1] !== target.size[1])
    throw new Error(`截图尺寸不匹配：${name} ${size}, expected ${target.size}`);
  captures.push({
    name,
    source: source.href,
    size,
    deviceScaleFactor: 1,
    locale: plan.locale,
    capturedAt: new Date().toISOString(),
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
  await previewPage.evaluate(() => document.fonts.ready);
  await previewPage.waitForFunction(
    () =>
      document.documentElement.dataset.coverReady === "true" &&
      Array.from(document.images).every((image) => image.complete),
    undefined,
    { timeout: 10000 },
  );
  await previewPage.screenshot({ path: plan.render_output });
  if (plan.output_size[0] !== plan.canvas[0] || plan.output_size[1] !== plan.canvas[1]) {
    const resized = spawnSync(
      "sips",
      [
        "--resampleHeightWidth",
        String(plan.output_size[1]),
        String(plan.output_size[0]),
        plan.render_output,
        "--out",
        plan.output,
      ],
      { encoding: "utf8" },
    );
    if (resized.status !== 0) throw new Error(resized.stderr || resized.stdout);
  }
  const exported = await fs.readFile(plan.output);
  const dimensions = [exported.readUInt32BE(16), exported.readUInt32BE(20)];
  if (dimensions[0] !== plan.output_size[0] || dimensions[1] !== plan.output_size[1])
    throw new Error("封面尺寸不匹配");
  const result = {
    output: plan.output,
    dimensions,
    renderSize: plan.canvas,
    language: plan.language,
    screenshotResizing: false,
    finalImageResizing: plan.output !== plan.render_output,
    captures,
  };
  results.push(result);
  console.log(result);
}
await task.finish({ keep: [] });
console.log({ completed: results.length });
