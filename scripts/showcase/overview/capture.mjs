import { createHash } from "node:crypto";
import { mkdir, readFile, writeFile } from "node:fs/promises";
import { dirname, resolve } from "node:path";
import { fileURLToPath } from "node:url";

const REPOSITORY = fileURLToPath(new URL("../../../", import.meta.url));
const SCENE_MODULE = "/__growth/src/adapters/showcase/three-showcase-scene.ts";
const CONTENT_MODULE = "/__growth/src/managers/showcase/hello-project.ts";
const STORY_MODULE = "/__growth/src/managers/showcase/ipad-story.ts";
const LANGUAGE = "zh-CN";
const CAPTURE_STATE_KEY = "__xpriteOverviewCapture";
const CAPTURE_TIMEOUT_MS = 60_000;

/** Capture the resting, unselected device scene, without reproducing its geometry or lighting. */
export async function captureShowcaseOverview(page, { name, width, height, viewport }) {
  await page.cdp("Emulation.setDeviceMetricsOverride", {
    ...viewport,
    deviceScaleFactor: 1,
    mobile: viewport.width < viewport.height,
  });
  await page.cdp("Emulation.setEmulatedMedia", {
    features: [{ name: "prefers-reduced-motion", value: "reduce" }],
  });
  await page.evaluate(
    (options) => {
      const job = {};
      window[options.stateKey] = job;
      void (async () => {
        const root = document.createElement("section");
        root.setAttribute("data-showcase-hero", "");
        root.style.cssText = `position:fixed;left:0;top:0;width:${options.width}px;height:${options.height}px;pointer-events:none`;
        const host = document.createElement("div");
        host.style.cssText = "position:absolute;inset:0";
        root.append(host);
        document.body.append(root);
        let scene;
        try {
          const [{ mountScene }, { HELLO_ARTWORK_BOUNDS }, { FILM_START }] = await Promise.all([
            import(options.sceneModule),
            import(options.contentModule),
            import(options.storyModule),
          ]);
          scene = await mountScene(
            host,
            { artworkBounds: HELLO_ARTWORK_BOUNDS },
            options.language,
            new AbortController().signal,
          );
          await scene.setLanguage(options.language);
          scene.render(FILM_START);
          const canvas = host.querySelector("canvas");
          if (!canvas) throw new Error("The showcase scene did not render a canvas.");
          return {
            png: canvas.toDataURL("image/png"),
            width: canvas.width,
            height: canvas.height,
            filmTime: FILM_START,
          };
        } finally {
          scene?.dispose();
          root.remove();
        }
      })().then(
        (result) => {
          job.result = result;
        },
        (error) => {
          job.error = String(error);
        },
      );
    },
    {
      width,
      height,
      language: LANGUAGE,
      sceneModule: SCENE_MODULE,
      contentModule: CONTENT_MODULE,
      storyModule: STORY_MODULE,
      stateKey: CAPTURE_STATE_KEY,
    },
  );
  await page.waitForFunction(
    (key) => Boolean(window[key]?.result || window[key]?.error),
    CAPTURE_STATE_KEY,
    { timeout: CAPTURE_TIMEOUT_MS },
  );
  const result = await page.evaluate((key) => {
    const job = window[key];
    delete window[key];
    if (job.error) throw new Error(job.error);
    return job.result;
  }, CAPTURE_STATE_KEY);
  if (Math.abs(result.width / result.height - width / height) > 0.001)
    throw new Error("Overview capture has the wrong aspect ratio.");
  const path = resolve(REPOSITORY, `apps/growth/public/showcase/overview/${name}.png`);
  const bytes = Buffer.from(result.png.split(",")[1], "base64");
  const manifest = JSON.parse(
    await readFile(
      resolve(REPOSITORY, "apps/growth/src/adapters/showcase/model-manifest.json"),
      "utf8",
    ),
  );
  await mkdir(dirname(path), { recursive: true });
  await writeFile(path, bytes);
  const record = {
    source: "apps/growth/src/adapters/showcase/three-showcase-scene.ts",
    modelRevision: manifest.revision,
    filmTime: result.filmTime,
    selection: null,
    viewport,
    width: result.width,
    height: result.height,
    transparent: true,
    sha256: createHash("sha256").update(bytes).digest("hex"),
  };
  await writeFile(path.replace(/\.png$/, ".capture.json"), `${JSON.stringify(record, null, 2)}\n`);
  return record;
}
