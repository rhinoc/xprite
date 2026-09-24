import { spawn } from "node:child_process";
import fs from "node:fs";
const spaceId = Number(process.argv[2]);
if (!Number.isInteger(spaceId) || spaceId <= 0)
  throw Error(
    "Usage: node scripts/e2e/browser/qa-responsive-dialogs.mjs EXISTING_SPACE_ID [SIZES_JSON | --extra]",
  );
const extra = process.argv[3] === "--extra";
const sizes = process.argv[3] && !extra ? JSON.parse(process.argv[3]) : undefined;
let fixture;
if (extra) {
  fs.mkdirSync(`${process.cwd()}/.tmp`, { recursive: true });
  const { PNG } = await import("pngjs");
  const png = new PNG({ width: 256, height: 256 });
  for (let y = 0; y < 256; y++)
    for (let x = 0; x < 256; x++) {
      const i = (y * 256 + x) * 4;
      png.data.set([x, y, (x + y) % 256, 255], i);
    }
  fixture = `${process.cwd()}/.tmp/responsive-dialog-gradient.png`;
  fs.writeFileSync(fixture, PNG.sync.write(png));
}
const child = spawn("ego-browser", ["nodejs"], { stdio: ["pipe", "inherit", "inherit"] });
child.stdin.end(
  `const captureConfig=${JSON.stringify({ spaceId, sizes, fixture, root: process.cwd() })};\n` +
    fs.readFileSync(
      extra
        ? "scripts/e2e/browser/qa-responsive-dialogs-extra-ego.mjs"
        : "scripts/e2e/browser/qa-responsive-dialogs-ego.mjs",
      "utf8",
    ),
);
child.on("error", (error) => {
  throw error;
});
child.on("exit", (code) => {
  process.exitCode = code ?? 1;
});
