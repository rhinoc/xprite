import assert from "node:assert/strict";

import { build } from "esbuild";
import { describe, it } from "vitest";

describe("animation-features [feature-7-12]", () => {
  it("animation-features behavior", async () => {
    const { outputFiles } = await build({
      stdin: {
        contents: `export * from './packages/editor-core/src/timeline/animation-options.ts';export * from './packages/editor-core/src/timeline/onion-skin.ts';export {RasterEditor} from './packages/editor-core/src/editor/RasterEditor.ts';`,
        resolveDir: process.cwd(),
      },
      bundle: true,
      platform: "node",
      format: "esm",
      write: false,
    });
    const api = await import(
      `data:text/javascript;base64,${Buffer.from(outputFiles[0].contents).toString("base64")}`
    );
    const image = (color) => ({ width: 1, height: 1, data: new Uint8ClampedArray(color) });
    const cel = (x, color) => ({ pixels: image(color), x, y: 0, opacity: 255, zIndex: 0 });
    const timeline = () => ({
      layers: [{ id: "one", name: "Sprite", flags: 3, visible: true, locked: false, opacity: 255 }],
      frames: [
        { duration: 100, cels: [cel(0, [255, 0, 0, 255])] },
        { duration: 200, cels: [cel(1, [0, 255, 0, 255])] },
        { duration: 300, cels: [cel(2, [0, 0, 255, 255])] },
      ],
      activeFrame: 1,
      activeLayer: 0,
    });
    const view = { x: 0, y: 0, width: 3, height: 1, zoom: 1 },
      settings = { ...api.defaultOnionSkinSettings, active: true };
    const pixel = (p, x) => Array.from(p.data.slice(x * 4, x * 4 + 4));
    {
      const t = timeline(),
        before = structuredClone(t),
        render = api.renderOnionSkinViewport(t, view, settings);
      assert.deepEqual(pixel(render, 0), [255, 0, 0, 68]);
      assert.deepEqual(pixel(render, 1), [0, 255, 0, 255]);
      assert.deepEqual(pixel(render, 2), [0, 0, 255, 68]);
      assert.deepEqual(t, before);
      assert.deepEqual(
        pixel(api.renderOnionSkinViewport(t, view, { ...settings, active: false }), 0),
        [0, 0, 0, 0],
      );
      assert.deepEqual(
        pixel(api.renderOnionSkinViewport(t, view, { ...settings, type: "red-blue" }), 0),
        [154, 27, 27, 68],
      );
      assert.deepEqual(
        pixel(api.renderOnionSkinViewport(t, view, { ...settings, type: "red-blue" }), 2),
        [9, 9, 136, 68],
      );
      assert.deepEqual(
        api.onionSkinFrames(t, { ...settings, previousFrames: 3, nextFrames: 3 }, 1),
        [
          { frame: 0, offset: -1, opacity: 68 },
          { frame: 2, offset: 1, opacity: 68 },
        ],
      );
      t.tags = [
        { name: "Loop", from: 0, to: 2, direction: "forward", repeat: 0, color: [0, 0, 0] },
      ];
      assert.deepEqual(
        api.onionSkinFrames(t, { ...settings, previousFrames: 2, nextFrames: 0 }, 0),
        [
          { frame: 1, offset: -2, opacity: 40 },
          { frame: 2, offset: -1, opacity: 68 },
        ],
      );
    }
    {
      const t = timeline();
      t.layers.unshift({
        id: "background",
        name: "Background",
        flags: 15,
        visible: true,
        locked: false,
        opacity: 255,
      });
      t.activeLayer = 1;
      t.frames = t.frames.map((f) => ({ ...f, cels: [cel(0, [40, 40, 40, 255]), ...f.cels] }));
      const result = api.renderOnionSkinViewport(t, view, settings);
      assert.equal(
        pixel(result, 0)[3],
        255,
        "behind ghosts draw over current background, not beneath it",
      );
      assert.ok(pixel(result, 0)[0] > 40);
      t.layers.push({
        id: "other",
        name: "Other",
        flags: 3,
        visible: true,
        locked: false,
        opacity: 255,
      });
      t.frames.forEach((f, i) => f.cels.push(i === 0 ? cel(2, [255, 255, 0, 255]) : null));
      const selected = api.renderOnionSkinViewport(t, view, {
        ...settings,
        currentLayer: true,
        nextFrames: 0,
      });
      assert.equal(
        pixel(selected, 2)[3],
        0,
        "current layer suppresses ghost pixels from other layers",
      );
    }
    {
      const t = timeline(),
        tag = { name: "Tag", from: 0, to: 2, direction: "reverse", repeat: 2, color: [0, 0, 0] };
      t.tags = [tag];
      const reversed = api.reverseAnimationFrames(t, {
        kind: "frames",
        frames: [0, 2],
        layers: [0],
      });
      assert.deepEqual(
        reversed.frames.map((f) => f.duration),
        [300, 200, 100],
      );
      assert.equal(reversed.frames[0].cels[0], t.frames[2].cels[0]);
      assert.equal(reversed.tags, t.tags);
      const cels = api.reverseAnimationFrames(t, { kind: "cels", frames: [0, 2], layers: [0] });
      assert.deepEqual(
        cels.frames.map((f) => f.duration),
        [100, 200, 300],
      );
      assert.equal(cels.frames[0].cels[0], t.frames[2].cels[0]);
      assert.equal(api.reverseAnimationFrames(t), t);
    }
    {
      const t = timeline(),
        player = new api.AnimationPreviewPlayer(),
        opts = { ...api.defaultPlaybackSettings, playAll: true, speed: 2 };
      player.play(t, opts);
      assert.equal(player.frame, 1);
      player.advance(t, 100, opts);
      assert.equal(player.frame, 2);
      assert.equal(t.activeFrame, 1, "preview never moves editor cursor");
      player.stop({ ...opts, rewindOnStop: true });
      assert.equal(player.frame, 1);
      player.play(t, { ...opts, playOnce: true });
      assert.equal(player.frame, 0, "Play Once starts at beginning");
      player.advance(t, 300, { ...opts, playOnce: true });
      assert.equal(player.playing, false);
      assert.equal(player.frame, 1, "Aseprite Play Once restores its reference frame");
    }
    {
      const core = new api.RasterEditor();
      core.document.loadTimeline(timeline(), 3, 1, "Animation");
      core.timeline.selectFrame(1);
      const before = core.getSnapshot().persistenceRevision;
      core.timeline.setOnionSkin({ active: true });
      assert.equal(core.getSnapshot().persistenceRevision, before);
      assert.deepEqual(
        pixel(core.canvas.exportComposite(), 0),
        [0, 0, 0, 0],
        "export excludes onion skin",
      );
      core.timeline.setPlaybackOptions({ playOnce: true, speed: 1 });
      core.timeline.setPlaying(true);
      assert.equal(
        core.getSnapshot().document.timeline.activeFrame,
        0,
        "editor displays Play Once initial frame immediately",
      );
      core.timeline.advancePlayback(600);
      assert.equal(core.getSnapshot().playing, false);
      assert.equal(core.getSnapshot().document.timeline.activeFrame, 1);
    }
    console.log(
      "Animation features: Aseprite defaults/tint/opacity/tag loops/background/current-layer, non-destructive rendering, reverse frame/cel identity, independent speed/once/rewind and core adapters pass.",
    );
  }, 60_000);
});
