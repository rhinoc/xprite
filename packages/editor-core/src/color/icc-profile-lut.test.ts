import assert from "node:assert/strict";
import { execFileSync } from "node:child_process";
import { existsSync, mkdtempSync, readFileSync, rmSync, writeFileSync } from "node:fs";
import { tmpdir } from "node:os";
import { join, resolve } from "node:path";
import { fileURLToPath } from "node:url";

import { describe, it } from "vitest";

import type { Rgba } from "$/base/primitives";
import {
  assertSupportedColorProfile,
  colorProfileToSrgb,
  convertPixelsBetweenProfiles,
  convertPixelsToSrgb,
  parseIccProfile,
  workingColorProfile,
} from "$/color/icc-profile";
import { RasterEditor } from "$/editor/RasterEditor";
import { decodeAsepriteSync } from "$/import-export/aseprite/decode";
import { encodeAsepriteSync } from "$/import-export/aseprite/encode";
import type { AsepriteColorProfile } from "$/import-export/aseprite/model";
import { prepareImageClipboardForDocument } from "$/import-export/aseprite/profile-clipboard";
import {
  asepriteFromProject,
  projectFromAseprite,
  projectFromDocument,
} from "$/import-export/aseprite/project";
import { renderExport } from "$/import-export/image/export-plan";

const fixture = fileURLToPath(
  new URL("./icc/fixtures/sRGB_v4_ICC_preference.icc", import.meta.url),
);
const skia = resolve(".refs/skia-arm64");
const skcms = join(skia, "out/Release-arm64/libskcms.a");
const fixedScale = 65536;
const xyzScale = 65535 / 32768;
const matrix = [0x6fa2, 0x6299, 0x24a0, 0x38f5, 0xb785, 0x0f84, 0x0390, 0x18da, 0xb6cf].map(
  (value) => value / fixedScale,
);

function signature(bytes: Uint8Array, offset: number, value: string): void {
  bytes.set(
    [...value].map((char) => char.charCodeAt(0)),
    offset,
  );
}

function fixed(view: DataView, offset: number, value: number): void {
  view.setInt32(offset, Math.round(value * fixedScale), false);
}

function profile(
  pcs: "XYZ " | "Lab ",
  tags: readonly (readonly [string, Uint8Array])[],
): Uint8Array {
  let size = 132 + tags.length * 12;
  const offsets = tags.map(([, bytes]) => {
    const offset = size;
    size += Math.ceil(bytes.length / 4) * 4;
    return offset;
  });
  const bytes = new Uint8Array(size),
    view = new DataView(bytes.buffer);
  view.setUint32(0, size, false);
  bytes[8] = 4;
  signature(bytes, 12, "mntr");
  signature(bytes, 16, "RGB ");
  signature(bytes, 20, pcs);
  signature(bytes, 36, "acsp");
  view.setUint32(128, tags.length, false);
  tags.forEach(([name, tag], index) => {
    const offset = 132 + index * 12;
    signature(bytes, offset, name);
    view.setUint32(offset + 4, offsets[index], false);
    view.setUint32(offset + 8, tag.length, false);
    bytes.set(tag, offsets[index]);
  });
  return bytes;
}

function gamma(value = 1): Uint8Array {
  const bytes = new Uint8Array(16),
    view = new DataView(bytes.buffer);
  signature(bytes, 0, "para");
  fixed(view, 12, value);
  return bytes;
}

function curves(value = 1): Uint8Array {
  const bytes = new Uint8Array(48);
  for (let channel = 0; channel < 3; channel++) bytes.set(gamma(value), channel * 16);
  return bytes;
}

function clut(precision: 1 | 2, swap = false): Uint8Array {
  const bytes = new Uint8Array(20 + 8 * 3 * precision),
    view = new DataView(bytes.buffer);
  bytes.set([2, 2, 2]);
  bytes[16] = precision;
  let offset = 20;
  for (let r = 0; r < 2; r++)
    for (let g = 0; g < 2; g++)
      for (let b = 0; b < 2; b++)
        for (const value of swap ? [b, g, r] : [r, g, b]) {
          if (precision === 1) bytes[offset] = value * 255;
          else view.setUint16(offset, value * 65535, false);
          offset += precision;
        }
  return bytes;
}

function staged(reverse: boolean, nonlinear: boolean, precision: 1 | 2 = 2): Uint8Array {
  const b = curves(nonlinear ? (reverse ? 0.5 : 2) : 1);
  if (!nonlinear) {
    const bytes = new Uint8Array(32 + b.length),
      view = new DataView(bytes.buffer);
    signature(bytes, 0, reverse ? "mBA " : "mAB ");
    bytes.set([3, 3], 8);
    view.setUint32(12, 32, false);
    bytes.set(b, 32);
    return bytes;
  }
  const affine = new Uint8Array(48),
    matrixView = new DataView(affine.buffer);
  for (let row = 0; row < 3; row++) {
    fixed(matrixView, (row * 3 + row) * 4, reverse ? 2 : 0.5);
    fixed(matrixView, 36 + row * 4, reverse ? -0.5 : 0.25);
  }
  const blocks = [b, affine, curves(), clut(precision, true), curves(reverse ? 0.5 : 2)];
  const bytes = new Uint8Array(32 + blocks.reduce((size, block) => size + block.length, 0)),
    view = new DataView(bytes.buffer);
  signature(bytes, 0, reverse ? "mBA " : "mAB ");
  bytes.set([3, 3], 8);
  let offset = 32;
  blocks.forEach((block, index) => {
    view.setUint32(12 + index * 4, offset, false);
    bytes.set(block, offset);
    offset += block.length;
  });
  return bytes;
}

function legacy(precision: 1 | 2): Uint8Array {
  const entries = precision === 1 ? 256 : 2,
    header = precision === 1 ? 48 : 52;
  const bytes = new Uint8Array(header + (entries * 6 + 8 * 3) * precision),
    view = new DataView(bytes.buffer);
  signature(bytes, 0, precision === 1 ? "mft1" : "mft2");
  bytes.set([3, 3, 2], 8);
  for (let i = 0; i < 3; i++) fixed(view, 12 + (i * 3 + i) * 4, 1);
  if (precision === 2) {
    view.setUint16(48, entries, false);
    view.setUint16(50, entries, false);
  }
  const table = (offset: number) => {
    for (let channel = 0; channel < 3; channel++)
      for (let i = 0; i < entries; i++) {
        const at = offset + (channel * entries + i) * precision;
        if (precision === 1) bytes[at] = i;
        else view.setUint16(at, i * 65535, false);
      }
  };
  table(header);
  const gridOffset = header + 3 * entries * precision;
  bytes.set(clut(precision).subarray(20), gridOffset);
  table(gridOffset + 8 * 3 * precision);
  return bytes;
}

function matrixTags(): [string, Uint8Array][] {
  const tags: [string, Uint8Array][] = [];
  for (const [index, channel] of ["r", "g", "b"].entries()) {
    const xyz = new Uint8Array(20),
      view = new DataView(xyz.buffer);
    signature(xyz, 0, "XYZ ");
    for (let row = 0; row < 3; row++) fixed(view, 8 + row * 4, matrix[row * 3 + index]);
    tags.push([`${channel}XYZ`, xyz], [`${channel}TRC`, gamma()]);
  }
  return tags;
}

function cicp(transfer = 13, matrix = 0, range = 1): Uint8Array {
  const bytes = new Uint8Array(12);
  signature(bytes, 0, "cicp");
  bytes.set([1, transfer, matrix, range], 8);
  return bytes;
}

const icc = (data: Uint8Array): AsepriteColorProfile => ({ type: "icc", data });
const image = (colors: readonly Rgba[]) => ({
  width: colors.length,
  height: 1,
  data: new Uint8ClampedArray(colors.flat()),
});
const close = (actual: readonly number[], expected: readonly number[], tolerance = 1e-5) => {
  actual.forEach((value, index) =>
    assert.ok(
      Math.abs(value - expected[index]) <= tolerance,
      `${index}: ${value} vs ${expected[index]}`,
    ),
  );
};

describe("ICC RGB LUT, Lab PCS and SDR CICP", () => {
  for (const precision of [1, 2] as const)
    it(`honors mAB/mBA stage order with ${precision}-byte CLUT samples`, () => {
      const parsed = parseIccProfile(
        profile("XYZ ", [
          ["A2B0", staged(false, true, precision)],
          ["B2A0", staged(true, true, precision)],
        ]),
      );
      assert.equal(parsed.kind, "lut");
      if (parsed.kind !== "lut") throw new Error("Expected LUT");
      const input = [0.2, 0.4, 0.7] as const;
      const expected = [input[2], input[1], input[0]].map(
        (value) => (value ** 2 * 0.5 + 0.25) ** 2 * xyzScale,
      );
      close(parsed.toPcs(input), expected);
      close(parsed.fromPcs(parsed.toPcs(input)), input, 0.0001);
    });

  for (const precision of [1, 2] as const)
    it(`decodes the ${precision === 1 ? "8-bit" : "legacy 16-bit"} Lab PCS encoding`, () => {
      const parsed = parseIccProfile(
        profile("Lab ", [
          ["A2B0", legacy(precision)],
          ["B2A0", legacy(precision)],
        ]),
      );
      if (parsed.kind !== "lut") throw new Error("Expected LUT");
      const input =
        precision === 1
          ? ([0.5, 128 / 255, 128 / 255] as const)
          : ([32640 / 65535, 32768 / 65535, 32768 / 65535] as const);
      const y = ((50 + 16) / 116) ** 3;
      close(parsed.toPcs(input), [y * 0.9642, y, y * 0.8249]);
      close(parsed.fromPcs(parsed.toPcs(input)), input);
    });

  it("supports A2B-only profiles without a matrix substitute", () => {
    const parsed = parseIccProfile(profile("XYZ ", [["A2B1", staged(false, true)]]));
    if (parsed.kind !== "lut") throw new Error("Expected LUT");
    const input = [0.25, 0.5, 0.75] as const;
    close(parsed.fromPcs(parsed.toPcs(input)), input, 1 / 255);
  });

  it("accepts SDR CICP metadata and keeps PQ, HLG and YCbCr explicitly unavailable", () => {
    const base = matrixTags();
    const supported = profile("XYZ ", [...base, ["cicp", cicp()]]);
    assert.deepEqual(parseIccProfile(supported).cicp, {
      primaries: 1,
      transfer: 13,
      matrix: 0,
      fullRange: true,
    });
    const value: Rgba = [90, 140, 190, 37];
    assert.deepEqual(
      colorProfileToSrgb(value, icc(supported)),
      colorProfileToSrgb(value, icc(profile("XYZ ", base))),
    );
    assert.equal(
      parseIccProfile(profile("XYZ ", [...base, ["cicp", cicp(1, 0, 0)]])).cicp?.fullRange,
      false,
    );
    for (const [tag, error] of [
      [cicp(16), /HDR PQ/],
      [cicp(18), /HDR HLG/],
      [cicp(13, 1), /YCbCr/],
      [cicp(255), /transfer characteristic/],
      [cicp(13, 0, 2), /full-range flag/],
    ] as const)
      assert.throws(
        () => assertSupportedColorProfile(icc(profile("XYZ ", [...base, ["cicp", tag]]))),
        error,
      );
  });

  it("rejects incomplete stages, truncated grids and invalid offsets before installing a profile", () => {
    const missing = staged(false, true);
    new DataView(missing.buffer).setUint32(28, 0, false);
    assert.throws(() => parseIccProfile(profile("XYZ ", [["A2B0", missing]])), /incomplete LUT/);
    const badOffset = staged(false, false);
    new DataView(badOffset.buffer).setUint32(12, badOffset.length + 4, false);
    assert.throws(() => parseIccProfile(profile("XYZ ", [["A2B0", badOffset]])), /truncated/);
    const short = legacy(2).subarray(0, 55);
    assert.throws(() => parseIccProfile(profile("XYZ ", [["A2B0", short]])), /truncated/);
  });

  it("opens and saves the unchanged official RGB/Lab profile without rewriting working pixels", () => {
    const data = new Uint8Array(readFileSync(fixture));
    const parsed = parseIccProfile(data);
    assert.equal(parsed.kind, "lut");
    assert.match(parsed.description, /Lab PCS/);
    const pixels = image([
      [20, 40, 60, 255],
      [130, 150, 170, 85],
      [1, 2, 3, 0],
    ]);
    const core = new RasterEditor(pixels);
    core.sprite.setProperties({ colorProfile: icc(data) });
    const document = core.getSnapshot().document!;
    const before = structuredClone(document);
    const converted = convertPixelsToSrgb(pixels, icc(data));
    assert.deepEqual(pixels.data, before.layer.pixels.data);
    assert.deepEqual(
      Array.from(converted.data.filter((_, index) => index % 4 === 3)),
      [255, 85, 0],
    );
    assert.deepEqual([...converted.data.subarray(8)], [1, 2, 3, 0]);
    const saved = decodeAsepriteSync(
      encodeAsepriteSync(asepriteFromProject(projectFromDocument(document))),
    );
    assert.equal(saved.colorProfile?.type, "icc");
    if (saved.colorProfile?.type !== "icc") throw new Error("Expected ICC");
    assert.deepEqual(saved.colorProfile.data, data);
    const reopened = projectFromAseprite(saved);
    assert.deepEqual(reopened.timeline.frames[0].cels[0]?.pixels.data, pixels.data);
    assert.deepEqual(document, before);
  });

  it("uses the assigned profile for display, paste and export, and restores it through undo/recovery", () => {
    const data = new Uint8Array(readFileSync(fixture));
    const pixels = image([[110, 150, 190, 255]]),
      core = new RasterEditor(pixels);
    core.sprite.setProperties({ colorProfile: icc(data) });
    const document = core.getSnapshot().document!;
    const options = {
      name: "out.png",
      scalePercent: 100,
      area: "canvas",
      layers: "visible",
      frame: 0,
    } as const;
    assert.equal(workingColorProfile(document.timeline)?.type, "icc");
    assert.deepEqual(
      renderExport(document, options).data,
      convertPixelsToSrgb(pixels, icc(data)).data,
    );
    const incoming = image([[50, 100, 180, 255]]);
    const pasted = prepareImageClipboardForDocument({ pixels: incoming, mask: null }, document);
    assert.deepEqual(
      pasted.pixels.data,
      convertPixelsBetweenProfiles(incoming, undefined, icc(data)).data,
    );
    core.history.undo();
    assert.equal(workingColorProfile(core.getSnapshot().document!.timeline), undefined);
    core.history.redo();
    assert.equal(workingColorProfile(core.getSnapshot().document!.timeline)?.type, "icc");
    const snapshot = core.getPersistenceSnapshot();
    assert.ok(snapshot);
    const recovered = new RasterEditor();
    recovered.restorePersistenceSnapshot(snapshot);
    assert.deepEqual(
      renderExport(recovered.getSnapshot().document!, options).data,
      renderExport(document, options).data,
    );
    core.sprite.setProperties({ colorProfile: null });
    assert.equal(workingColorProfile(core.getSnapshot().document!.timeline), undefined);
    assert.deepEqual(renderExport(core.getSnapshot().document!, options).data, pixels.data);
  });

  it("rejects an unsupported HDR assignment without replacing the existing profile", () => {
    const core = new RasterEditor(image([[80, 120, 160, 255]]));
    core.sprite.setProperties({ colorProfile: { type: "srgb" } });
    const previous = workingColorProfile(core.getSnapshot().document!.timeline);
    assert.throws(
      () =>
        core.sprite.setProperties({
          colorProfile: icc(profile("XYZ ", [...matrixTags(), ["cicp", cicp(16)]])),
        }),
      /HDR PQ/,
    );
    assert.deepEqual(workingColorProfile(core.getSnapshot().document!.timeline), previous);
  });

  it("converts an imported LUT profile once and keeps its original ICC bytes available for undo", () => {
    const bytes = new Uint8Array(readFileSync(fixture));
    const pixels = image([[100, 140, 180, 255]]);
    const source = new RasterEditor(pixels);
    source.sprite.setProperties({ colorProfile: icc(bytes) });
    const sprite = decodeAsepriteSync(
      encodeAsepriteSync(asepriteFromProject(projectFromDocument(source.getSnapshot().document!))),
    );
    const project = projectFromAseprite(sprite),
      core = new RasterEditor();
    core.document.loadTimeline(project.timeline, 1, 1, "Imported ICC.aseprite");
    const original = core.getSnapshot().document!.timeline!.asepriteSource!.colorProfile;
    const options = {
      name: "out.png",
      scalePercent: 100,
      area: "canvas",
      layers: "visible",
      frame: 0,
    } as const;
    const displayed = renderExport(core.getSnapshot().document!, options).data.slice();
    core.sprite.setProperties({ colorProfile: { type: "srgb" }, convertColorProfile: true });
    assert.deepEqual(core.getSnapshot().document!.layer.pixels.data, displayed);
    assert.deepEqual(renderExport(core.getSnapshot().document!, options).data, displayed);
    assert.equal(core.getSnapshot().document!.timeline!.asepriteSource!.colorProfile, original);
    core.history.undo();
    assert.equal(workingColorProfile(core.getSnapshot().document!.timeline)?.type, "icc");
    core.sprite.setProperties({ colorProfile: null });
    assert.equal(workingColorProfile(core.getSnapshot().document!.timeline), undefined);
    assert.deepEqual(renderExport(core.getSnapshot().document!, options).data, pixels.data);
  });

  it.skipIf(!existsSync(skcms))(
    "matches the local skcms oracle for the official RGB/Lab LUT",
    () => {
      const directory = mkdtempSync(join(tmpdir(), "xprite-lut-oracle-"));
      try {
        const source = join(directory, "oracle.cpp"),
          executable = join(directory, "oracle");
        writeFileSync(
          source,
          `#include <fstream>\n#include <iostream>\n#include <iterator>\n#include <vector>\n#include "modules/skcms/skcms.h"\nint main(int argc,char**argv){std::ifstream file(argv[1],std::ios::binary);std::vector<char>profile((std::istreambuf_iterator<char>(file)),{});std::vector<unsigned char>pixels((std::istreambuf_iterator<char>(std::cin)),{}),out(pixels.size());skcms_ICCProfile parsed;if(!skcms_Parse(profile.data(),profile.size(),&parsed))return 2;if(!skcms_Transform(pixels.data(),skcms_PixelFormat_RGBA_8888,skcms_AlphaFormat_Unpremul,&parsed,out.data(),skcms_PixelFormat_RGBA_8888,skcms_AlphaFormat_Unpremul,skcms_sRGB_profile(),pixels.size()/4))return 3;std::cout.write((char*)out.data(),out.size());}`,
        );
        execFileSync("clang++", [
          "-std=c++17",
          "-O2",
          `-I${skia}`,
          source,
          skcms,
          "-o",
          executable,
        ]);
        const pixels = image(
          Array.from({ length: 256 }, (_, i): Rgba => [
            (i * 37) & 255,
            (i * 61) & 255,
            (i * 137) & 255,
            255,
          ]),
        );
        const fixtures = [fixture];
        for (const [index, bytes] of [
          profile("XYZ ", [["A2B0", legacy(1)]]),
          profile("XYZ ", [["A2B0", legacy(2)]]),
          profile("Lab ", [["A2B0", legacy(2)]]),
          profile("XYZ ", [["A2B0", staged(false, true)]]),
        ].entries()) {
          const path = join(directory, `synthetic-${index}.icc`);
          writeFileSync(path, bytes);
          fixtures.push(path);
        }
        for (const path of fixtures) {
          const expected = execFileSync(executable, [path], { input: pixels.data });
          const actual = convertPixelsToSrgb(pixels, icc(new Uint8Array(readFileSync(path))));
          for (let i = 0; i < expected.length; i++)
            assert.ok(
              Math.abs(expected[i] - actual.data[i]) <= 2,
              `${path}, Skcms channel ${i}: ${expected[i]} vs ${actual.data[i]}`,
            );
        }
      } finally {
        rmSync(directory, { recursive: true, force: true });
      }
    },
  );
});
