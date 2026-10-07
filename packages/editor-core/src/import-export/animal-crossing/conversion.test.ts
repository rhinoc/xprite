import assert from "node:assert/strict";

import { describe, it } from "vitest";

import {
  defaultAnimalCrossingSettings,
  readAnimalCrossingPattern,
} from "$/import-export/animal-crossing/codec";
import { AnimalCrossingConversion } from "$/import-export/animal-crossing/conversion";

const source = () => ({
  width: 2,
  height: 1,
  data: new Uint8ClampedArray([255, 0, 0, 255, 0, 0, 255, 255]),
});

describe("Animal Crossing conversion state", () => {
  it("invalidates selected output when settings or a source frame changes", () => {
    const pixels = source();
    const settings = { ...defaultAnimalCrossingSettings(pixels), cellWidth: 1 };
    const conversion = new AnimalCrossingConversion(settings, pixels);
    conversion.generate();
    conversion.select(1);
    assert.equal(conversion.getSnapshot().selected, 1);
    assert.ok(conversion.getSnapshot().qr);
    conversion.changeSettings({ creator: "New creator" });
    assert.equal(conversion.getSnapshot().result, null);
    assert.equal(conversion.getSnapshot().qr, null);
    assert.equal(conversion.getSnapshot().selected, 0);
    conversion.generate();
    conversion.setSource(source());
    assert.equal(conversion.getSnapshot().settings.creator, "New creator");
    assert.equal(conversion.getSnapshot().result, null);
    assert.equal(conversion.getSnapshot().qr, null);
    assert.equal(settings.creator, "Xprite");
  });

  it("retains an imported payload exactly and refuses settings or regeneration", () => {
    const pixels = source();
    const conversion = new AnimalCrossingConversion(defaultAnimalCrossingSettings(pixels), pixels);
    conversion.generate();
    const bytes = conversion.getSnapshot().result!.patterns[0].bytes.slice();
    bytes[0x57] = 123;
    const pattern = readAnimalCrossingPattern(bytes);
    conversion.setSource(pattern.pixels, defaultAnimalCrossingSettings(pattern.pixels), pattern);
    const imported = conversion.getSnapshot();
    conversion.changeSettings({ title: "Replacement", cellWidth: 1 });
    conversion.generate();
    assert.equal(conversion.getSnapshot(), imported);
    assert.equal(imported.importedQr, true);
    assert.deepEqual(imported.result!.patterns[0].bytes, bytes);
    assert.ok(imported.qr);
  });

  it("clears obsolete outputs after invalid geometry and recovers with a valid draft", () => {
    const pixels = source();
    const conversion = new AnimalCrossingConversion(defaultAnimalCrossingSettings(pixels), pixels);
    conversion.generate();
    const generated = conversion.getSnapshot();
    conversion.select(-1);
    conversion.select(0.5);
    conversion.select(10);
    assert.equal(conversion.getSnapshot(), generated);
    conversion.changeSettings({ cellWidth: 0 });
    conversion.generate();
    assert.equal(conversion.getSnapshot().result, null);
    assert.equal(conversion.getSnapshot().qr, null);
    assert.ok(conversion.getSnapshot().error);
    conversion.changeSettings({ cellWidth: 1 });
    conversion.generate();
    assert.equal(conversion.getSnapshot().error, null);
    assert.equal(conversion.getSnapshot().result!.patterns.length, 2);
  });
});
