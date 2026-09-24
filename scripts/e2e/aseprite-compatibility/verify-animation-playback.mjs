import assert from "node:assert/strict";
import fs from "node:fs";

import { build } from "esbuild";

import { resolveAsepriteSource } from "../../base/reference-paths.mjs";
const asepriteSource = resolveAsepriteSource();
const source = fs.readFileSync(`${asepriteSource}/src/doc/playback_tests.cpp`, "utf8");
const { outputFiles } = await build({
  entryPoints: ["packages/editor-core/src/timeline/playback.ts"],
  bundle: true,
  platform: "node",
  format: "esm",
  write: false,
});
const { AnimationPlayback } = await import(
  `data:text/javascript;base64,${Buffer.from(outputFiles[0].contents).toString("base64")}`
);
const directions = {
  FORWARD: "forward",
  REVERSE: "reverse",
  PING_PONG: "ping-pong",
  PING_PONG_REVERSE: "ping-pong-reverse",
};
const modes = {
  PlayAll: "all",
  PlayOnce: "once",
  PlayInLoop: "loop",
  PlayWithoutTagsInLoop: "without-tags",
};
let cases = 0,
  frames = 0;
const skipped = [];
for (const match of source.matchAll(/TEST\(Playback,\s*(\w+)\)([\s\S]*?)(?=\nTEST\(|$)/g)) {
  const name = match[1],
    body = match[2].replace(/\/\/[^\n]*/g, "");
  const sprite = body.match(/make_sprite\((\d+)(?:,\s*\{([^}]+)\})?\)/);
  if (!sprite || /for\s*\(/.test(body) || body.includes("GTEST_SKIP")) {
    skipped.push(name);
    continue;
  }
  const tags = new Map();
  for (const tag of body.matchAll(
    /Tag\*\s+(\w+)\s*=\s*make_tag\("([^"\n]+)",\s*(\d+),\s*(\d+),\s*AniDir::(\w+)(?:,\s*(\d+))?\)/g,
  ))
    tags.set(tag[1], {
      name: tag[2],
      from: +tag[3],
      to: +tag[4],
      direction: directions[tag[5]],
      repeat: +(tag[6] ?? 0),
      color: [0, 0, 0],
    });
  const tagList = (sprite[2] ?? "")
    .split(",")
    .map((v) => v.trim())
    .filter(Boolean)
    .map((v) => tags.get(v));
  if (tagList.some((v) => !v)) {
    skipped.push(name);
    continue;
  }
  let player,
    checked = 0;
  const token =
    /Playback(?:\s+\w+)?\(sprite\.get\(\),\s*(-?\d+),\s*Playback::Mode::(\w+)(?:,\s*(\w+)(?:,\s*(-?\d+))?)?\)|([\w]+)->setAniDir\(AniDir::(\w+)\)|([\w]+)->setRepeat\((\d+)\)|expect_frames\(\w+,\s*\{([\d,\s-]+)\}(?:,\s*(?:frame_t\()?([+-]?\d+)\)?)?\)/g;
  for (const x of body.matchAll(token)) {
    if (x[2]) {
      const current =
        [...body.slice(0, x.index).matchAll(/make_sprite\((\d+)(?:,\s*\{([^}]+)\})?\)/g)].at(-1) ??
        sprite;
      const list = (current[2] ?? "")
        .split(",")
        .map((v) => v.trim())
        .filter(Boolean)
        .map((v) => tags.get(v));
      player = new AnimationPlayback(
        +current[1] - 1,
        list,
        +x[1],
        modes[x[2]],
        tags.get(x[3]),
        +(x[4] ?? 1),
      );
    } else if (x[5]) tags.get(x[5]).direction = directions[x[6]];
    else if (x[7]) tags.get(x[7]).repeat = +x[8];
    else if (x[9] && player) {
      const expected = x[9]
          .split(",")
          .map((v) => v.trim())
          .filter(Boolean)
          .map(Number),
        actual = [player.frame];
      for (let i = 1; i < expected.length; i++) actual.push(player.next(+(x[10] ?? 1)));
      assert.deepEqual(actual, expected, `Aseprite Playback.${name}`);
      checked++;
      frames += expected.length;
    }
  }
  if (checked) cases += checked;
  else skipped.push(name);
}
assert.ok(cases >= 25, `Insufficient Aseprite playback oracle cases: ${cases}`);
console.log(
  JSON.stringify({ passed: true, asepriteCases: cases, framesCompared: frames, skipped }, null, 2),
);
