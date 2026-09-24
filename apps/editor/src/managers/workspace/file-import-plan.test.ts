import assert from "node:assert/strict";

import { describe, it } from "vitest";

import {
  DEFAULT_SEQUENCE_FRAME_DURATION_MS,
  FileImportKind,
  fileImportPlan,
  numberedPngGroups,
} from "$/managers/workspace/file-import-plan";

const selected = (...names: string[]) =>
  names.map((name, index) => ({ source: String(index), name }));

describe("selected PNG sequence imports", () => {
  it("orders numeric suffixes rather than lexical names, including unpadded frames", () => {
    const groups = numberedPngGroups(selected("walk10.png", "walk2.png", "walk001.png"));
    assert.equal(groups[0].name, "walk.aseprite");
    assert.deepEqual(
      groups[0].sources.map((source) => source.name),
      ["walk001.png", "walk2.png", "walk10.png"],
    );
  });

  it("keeps unrelated prefixes, formats and selected standalone files independent", () => {
    const sources = selected(
      "walk2.png",
      "portrait.png",
      "jump2.png",
      "walk1.png",
      "jump1.png",
      "walk3.webp",
    );
    const groups = numberedPngGroups(sources);
    const plan = fileImportPlan(sources, groups, 120);
    assert.deepEqual(
      plan.map((item) => item.kind),
      [
        FileImportKind.PngSequence,
        FileImportKind.Document,
        FileImportKind.PngSequence,
        FileImportKind.Document,
      ],
    );
    assert.equal(plan[0].kind === FileImportKind.PngSequence && plan[0].durationMs, 120);
    assert.equal(plan[2].kind === FileImportKind.PngSequence && plan[2].name, "jump.aseprite");
  });

  it("opens all files separately unless sequence grouping is explicitly supplied", () => {
    const sources = selected("frame2.png", "frame1.png");
    assert.deepEqual(
      fileImportPlan(sources),
      sources.map((source) => ({ kind: FileImportKind.Document, source })),
    );
    const plan = fileImportPlan(sources, numberedPngGroups(sources));
    assert.equal(
      plan[0].kind === FileImportKind.PngSequence && plan[0].durationMs,
      DEFAULT_SEQUENCE_FRAME_DURATION_MS,
    );
  });

  it("does not guess an order for duplicate numeric suffixes", () => {
    const sources = selected("frame1.png", "frame01.png", "frame2.png");
    assert.deepEqual(numberedPngGroups(sources), []);
    assert.equal(fileImportPlan(sources).length, sources.length);
  });

  it("includes only selected numbers, preserving gaps without fabricating frames", () => {
    const sources = selected("2.PNG", "10.png");
    const groups = numberedPngGroups(sources);
    assert.equal(groups[0].name, "Animation.aseprite");
    assert.deepEqual(groups[0].sources, sources);
    assert.deepEqual(numberedPngGroups(selected("2.png")), []);
  });

  it("compares long numeric suffixes without losing integer precision", () => {
    const sources = selected("f9007199254740993.png", "f9007199254740992.png");
    assert.deepEqual(numberedPngGroups(sources)[0].sources, [sources[1], sources[0]]);
  });
});
