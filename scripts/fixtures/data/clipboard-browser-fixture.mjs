/** Deterministic external clipboard fixture; does not open or control a browser.
 * `node scripts/fixtures/data/clipboard-browser-fixture.mjs` writes the PNG + manifest.
 * Root browser QA can use manifest.eventScript to exercise the real DOM paste
 * adapter, and manifest.systemClipboardScript for OS exchange when permitted. */
import fs from "node:fs";

import { PNG } from "pngjs";
const width = 3,
  height = 2;
const rgba = [
  255, 0, 0, 255, 0, 255, 0, 255, 0, 0, 0, 0, 0, 0, 255, 255, 255, 255, 0, 128, 255, 0, 255, 255,
];
const png = new PNG({ width, height });
png.data.set(rgba);
const encoded = PNG.sync.write(png);
const dataUrl = `data:image/png;base64,${encoded.toString("base64")}`;
const decode = `const blob=await (await fetch(${JSON.stringify(dataUrl)})).blob();`;
const manifest = {
  width,
  height,
  rgba,
  png: "fixtures/clipboard/external-3x2.png",
  dataUrl,
  eventScript: `(async()=>{${decode}const transfer=new DataTransfer();transfer.items.add(new File([blob],"clipboard-fixture.png",{type:"image/png"}));const event=new ClipboardEvent("paste",{clipboardData:transfer,bubbles:true,cancelable:true});document.body.dispatchEvent(event);return {handled:event.defaultPrevented,width:3,height:2};})()`,
  systemClipboardScript: `(async()=>{${decode}await navigator.clipboard.write([new ClipboardItem({"image/png":blob})]);return "OS clipboard fixture ready";})()`,
  expected:
    "External image uses full 3×2 rectangular mask, centered at visible sprite intersection; transparent pixel remains transparent and yellow alpha is 128. Escape cancels without dirty/history change; Enter commits, Undo restores.",
  warning:
    "The synthetic ClipboardEvent validates the actual event adapter, not operating-system permission behavior. Run OS test independently when clipboard access is available.",
};
fs.mkdirSync("fixtures/clipboard", { recursive: true });
fs.writeFileSync(manifest.png, encoded);
fs.writeFileSync("fixtures/clipboard/external-3x2.json", JSON.stringify(manifest, null, 2) + "\n");
console.log(
  "Wrote fixtures/clipboard/external-3x2.png and .json; no browser was opened or modified.",
);
