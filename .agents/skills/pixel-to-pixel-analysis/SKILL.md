---
name: pixel-to-pixel-analysis
description: Compare PNG reference and candidate images pixel by pixel, run this app's visual audit with area and provenance checks, and diagnose dimension or threshold failures. Use for screenshot, sprite, raster, and visual-regression comparisons.
metadata:
  short-description: Pixel-accurate PNG comparison and diff reports
---

# Pixel-to-pixel analysis

For Xprite UI regression, compare against the repository's current Xprite
baselines. The old Aseprite screenshot comparison workflow has been retired.
For unrelated PNG or sprite comparisons, use the standalone comparator.
Both use the repository's existing `pixelmatch` and `pngjs` dependencies.
Preserve captures exactly: do not resize, mask, or rewrite candidate pixels.

## Audit Xprite's current UI

Reuse the running development server and run from the repository root:

```sh
pnpm run visual:capture
pnpm run visual:compare
```

The twelve scenes are Home, editor, Preferences (General), Edit menu, New Sprite,
Save As, Export File, GIF Options, Recovery, foreground color picker, Pencil tooltip, and Layer Properties.
Each has wide (1440×900) and compact (390×844) captures in Chinese and English: 48 PNGs total.
They use the bundled `example.aseprite`, light theme,
Chinese (`zh-CN`) or English (`en`) UI, DPR 1, and the editor's first frame at 400% zoom. Home highlights
the example row so the pin and delete controls are included. Compact captures
use mouse input; they do not certify touch interaction.

Chinese baselines and provenance live in `scripts/visual-audit/baselines/xprite/zh/`;
English baselines and their own manifest live in `scripts/visual-audit/baselines/xprite/en/`.
README images reference the editor baseline PNGs directly.
Candidates, per-scene diff PNGs, and `comparison.json` are written to
`.tmp/xprite-visual/zh/` and `.tmp/xprite-visual/en/`. `comparison-all.json` at the root summarizes
both languages. Captures stay in the background and require two consecutive identical
PNGs per scene. Identical candidate pixels need no diff PNG; pixel differences produce one.
Comparison requires at least 99% whole-window decoded RGBA pixel similarity and
unchanged region geometry. Dimension, browser/platform, fixture, theme,
language, frame, or zoom changes require resolving the capture contract before
interpreting pixel scores. Source hashes record each capture; differing source
hashes between baseline and candidate are expected when code changes.
Scene names and dimensions are defined in `scripts/visual-audit/xprite/scenes.mjs`. Captures reject dialog frames outside the viewport, horizontal client overflow, and vertical clipping in the default color picker.
Use `--scenes name,name` on capture and compare to check a subset, or
`--languages en` / `--languages zh-CN` to select a language. Default
comparison requires all 48 captures. Use `visual:baseline --extend` to add missing
scenes while preserving existing PNGs and their capture provenance.

Only update a baseline when an intended visual change has been reviewed:

```sh
pnpm run visual:baseline --force
```

Recapture and compare after updating to confirm reproducibility. These scenes
do not cover other preference sections, animation frames, or dark themes.
See [the capture workflow](../../../scripts/visual-audit/xprite/README.md)
for the dedicated storage origins and capture options. Read the ego-browser
skill before browser capture. Keep Aseprite file/algorithm compatibility checks,
widget geometry fixtures, and runtime font/theme resources separate from this
UI regression workflow.

## Compare two images

From the repository root, run:

```sh
node .agents/skills/pixel-to-pixel-analysis/scripts/pixel-diff.mjs \
  reference.png candidate.png .tmp/pixel-diff.png \
  --threshold 0.1
```

The command writes a red-marked diff PNG and prints JSON containing dimensions,
different pixel count, total pixels, and difference percentage. Exit status is
`0` only when no pixels differ at the selected threshold; a nonzero status means
the images differ or the inputs are invalid.

Use `--threshold 0` for zero pixelmatch color tolerance. The standalone default
`0.1` allows color tolerance and includes antialiased pixels; it is separate
from the project's exact RGBA comparison. Resolve dimension mismatches before
interpreting pixel scores. Use this mode when the task does not require the
app's capture provenance or area-level audit rules.

For pixel-art import classification, use the application heuristic exported by
`packages/editor-core/src/import-export/image/import/analyze.ts`; it is advisory
and must not override a user's choice silently.
