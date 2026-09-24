import fs from "node:fs";

import jpeg from "jpeg-js";
import { PNG } from "pngjs";
// Deterministic input fixtures; generated files are private QA data, not user artwork.
const image = new PNG({ width: 128, height: 96 });
for (let y = 0; y < image.height; y++)
  for (let x = 0; x < image.width; x++) {
    const at = (y * image.width + x) * 4;
    image.data.set([x * 2, Math.round((y * 255) / 95), (x * 7 + y * 13) % 256, 255], at);
  }
fs.mkdirSync("/tmp/aseprite-session-qa", { recursive: true });
fs.mkdirSync("/tmp/aseprite-view-qa", { recursive: true });
fs.writeFileSync("/tmp/aseprite-session-qa/photo.png", PNG.sync.write(image));
fs.writeFileSync(
  "/tmp/aseprite-session-qa/photo.jpg",
  jpeg.encode({ width: image.width, height: image.height, data: image.data }, 90).data,
);
fs.copyFileSync(".tmp/qa-fixtures/pixel.png", "/tmp/aseprite-view-qa/pixel.png");
console.log("Session QA photo and pixel fixtures prepared.");
