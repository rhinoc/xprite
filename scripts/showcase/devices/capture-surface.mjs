import { writeFile } from "node:fs/promises";
import { resolve } from "node:path";
import { fileURLToPath } from "node:url";

import { captureBrowserPng, saveScreenshot } from "../../base/screenshot.mjs";

const REPOSITORY = fileURLToPath(new URL("../../../", import.meta.url));
const GEOMETRY_MODULE = `/@fs${resolve(REPOSITORY, "packages/ui/src/utils.ts")}`;
const VIEWPORTS = {
  computer: { width: 1440, height: 840 },
  phone: { width: 430, height: 846 },
};
const CAPTURE_DPR = 1;

/** Capture a task-owned editor tab after arranging it with the real editor controls. */
export async function captureDeviceSurface(page, { directory, name, device }) {
  const size = VIEWPORTS[device];
  if (!size) throw new Error(`Unknown capture device: ${device}`);
  const phone = device === "phone";
  await page.cdp("Emulation.setTouchEmulationEnabled", {
    enabled: phone,
    maxTouchPoints: phone ? 5 : 1,
  });
  await page.cdp("Emulation.setDeviceMetricsOverride", {
    ...size,
    deviceScaleFactor: CAPTURE_DPR,
    mobile: phone,
  });
  await page.evaluate(async () => {
    await document.fonts.ready;
    await new Promise((resolve) => requestAnimationFrame(() => requestAnimationFrame(resolve)));
  });
  const geometry = await page.evaluate(async (module) => {
    const { clientRect } = await import(module);
    const rect = (element) => {
      const bounds = clientRect(element);
      return { x: bounds.x, y: bounds.y, width: bounds.width, height: bounds.height };
    };
    const plane = document.querySelector('[data-slot="frame-artwork-plane"]');
    return {
      source: location.origin + location.pathname,
      language: document.documentElement.lang,
      canvasViewport: plane ? rect(plane) : null,
      controls: [...document.querySelectorAll("button[aria-label], input[aria-label]")].map(
        (element) => ({
          label: element.getAttribute("aria-label"),
          rect: rect(element),
          value: element.value,
          pressed: element.getAttribute("aria-pressed"),
        }),
      ),
    };
  }, GEOMETRY_MODULE);
  const capture = await captureBrowserPng(page, { expectedDpr: CAPTURE_DPR });
  await saveScreenshot(capture.bytes, {
    path: `${directory}/${name}.png`,
    viewport: capture.metadata.viewport,
    expectedDpr: CAPTURE_DPR,
    method: capture.metadata.method,
  });
  await writeFile(`${directory}/${name}.geometry.json`, `${JSON.stringify(geometry, null, 2)}\n`);
  return geometry;
}
