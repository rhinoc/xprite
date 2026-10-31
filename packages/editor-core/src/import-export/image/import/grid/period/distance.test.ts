import { describe, expect, test } from "vitest";

import { distanceCountGrids } from "$/import-export/image/import/grid/period/distance";
import {
  gradient,
  rowJitterUpscale,
  sprite,
  upscaleNearest,
  warpUpscale,
} from "$/import-export/image/import/grid/test-images";

const counts = (grids: ReturnType<typeof distanceCountGrids>) =>
  grids.map((grid) => [grid.width, grid.height]);

describe("boundary distance counts", () => {
  test.each([
    ["an exact", upscaleNearest(sprite(32), 6)],
    ["a warped", warpUpscale(sprite(32), 6, 2)],
    ["a row-jittered", rowJitterUpscale(sprite(32), 6, 1.2)],
  ])("propose the true count of %s upscale", (_, image) => {
    expect(counts(distanceCountGrids(image))).toContainEqual([32, 32]);
  });

  test("propose nothing on a gradient without boundaries", () => {
    expect(distanceCountGrids(gradient(240, 180))).toEqual([]);
  });
});
