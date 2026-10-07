# Scripts

Run scripts from the repository root. The root `package.json` exposes common commands.

`pnpm run dev` uses `dev/site.mjs` to start or reuse the four independent app
servers and prints unified local/LAN entry points on port 5173. It does not run
builds and only stops processes that it started. Shared proxy rules and server identity metadata live in `infra/dev-site.ts`;
fixed ports and development bases live in `infra/dev-site.json`. See
[development setup](../CONTRIBUTING.md).

`pnpm run check:public-docs` rejects Xiaohongshu / 小红书, RedNote, XHS and
platform links in root Markdown (except `AGENTS.md`), the user guide and its
text assets, public text assets, and the editor HTML entry. It reports file and
line numbers and exits with a failure. New files in these locations are included
automatically. Platform runtime code and developer documentation under `scripts/`
are outside this public-document scope. The guide is for the official website
and describes differences from Aseprite; it also rejects itch.io and mini tool
edition references. The pre-commit hook, root `check` (including pre-push),
PR/push CI, and deployment workflow all run the check.

Editor release configuration and tag/manual deployment instructions are in
[deploy/README.md](deploy/README.md). Root `deploy:*` scripts prepare and publish
the static editor to EdgeOne Makers.

For itch.io, run `pnpm run itch:pack` to build an uploadable ZIP, or build with
`pnpm run build:itch` and upload through `pnpm run deploy:itch username/project`.
See [the itch.io distribution instructions](deploy/ITCH.md).

Use the ignored `.tmp/` directory for all script-generated local output, including QA reports, screenshots, generated fixtures, visual captures, audit manifests, temporary bundles, and caches. Keep checked-in source fixtures under `scripts/fixtures/`.

Retained task reports and minitool ZIP exports live in `.tmp/artifacts/`.
The deterministic editor artwork fixture lives in `fixtures/editor/`;
asset extraction tools in `fixtures/assets/` write runtime fonts, themes and
cursors into the corresponding `packages/ui/assets/` source directories.

Unit tests use Vitest and live beside the implementation: `module.ts` is tested by `module.test.ts`. Run them with `pnpm test`, or run one file with `pnpm exec vitest run path/to/module.test.ts`.

`pnpm run check:ui-editor-usage` uses the TypeScript compiler API to trace rendered components from the Editor entry through local wrappers, lazy imports, and UI component composition. Missing public `@xprite/ui` components, invalid variant values, and variant usages the checker cannot resolve fail the check. Legal variants that the Editor does not use are informational and do not fail it; Gallery usage does not count toward Editor coverage. Its implementation is in `check/`; the root `check` and pre-commit hook both run it.

`pnpm run check:stale-css` runs `check-unused-css` against the Editor, Gallery, and UI source trees. The checker reports unused CSS Module classes and class references missing from their stylesheets. The root `check` runs it.

UI regression compares current Xprite screenshots with its own checked-in
baselines. Use `pnpm run visual:capture` and `pnpm run visual:compare` against
the running dev server; see [the visual baseline workflow](visual-audit/xprite/README.md).
The pre-push hook runs both commands after static checks. Capture or comparison
failure blocks the push. Screenshots require at least 99% pixel similarity and
unchanged region geometry. Show differences that fail these limits to the user for confirmation;
never replace a baseline or change comparison rules without their approval.
Capture saves each completed scene immediately and compares it in a separate
worker while the next scene is being captured. Incomplete runs retain their
images and comparison reports but cannot pass the gate.
If the editor is running on another port, set `XPRITE_VISUAL_PORT` when pushing
so the hook captures that server; the default is 5173.
The old Aseprite UI screenshot comparison and source snapshot workflow has been removed.

Pre-push also runs `pnpm run visual:startup` to compare the generated SSG first
paint with the interactive first paint on all three tool pages, in wide and
compact layouts with Light, Dark and both System preferences. This separate gate
requires at least 99% whole-viewport pixelmatch similarity at threshold 0.1 and
unchanged region geometry. Capture failure or incomplete evidence blocks the
push. Reports and both raw images are saved in `.tmp/tools-startup-visual/`.
The default tools port is 5176; `XPRITE_TOOLS_VISUAL_PORT` targets another existing
server. See [the SSG capture contract](visual-audit/tools-startup/README.md).

## Shared screenshots

All capture entry points use [`base/screenshot.mjs`](base/screenshot.mjs).
`captureBrowserScreenshot(page, { path, clip?, expectedDpr? })` reads the Chromium
compositor's native PNG, waits for fonts, aligns an optional viewport-CSS crop to
device pixels and checks actual PNG dimensions. It never changes the page DPR
or resizes the image. It writes a sibling JSON with logical dimensions, native
pixel dimensions, scale, color-space fingerprints and the original byte hash.
Use `metadataPath: null` when embedding this data in an existing report.
Live frame collectors use `captureBrowserPng` to inspect the same bytes and
metadata before selecting a frame, then persist accepted frames with `saveScreenshot`.

`saveScreenshot` applies the same byte-preservation and metadata checks to
Safari WebDriver and native window providers. A provider without measured
logical geometry records pixel dimensions only; no DPR is fabricated.
`inspectPng`, `assertSamePngColorSpace`, `cropPngBytes` and
`preservePngColorSpace` are shared by comparison and diagnostic scripts.
Diagnostic crops use explicit integer PNG-pixel coordinates and retain color
metadata. Changed ICC, sRGB, gamma or chromaticity tags reject a comparison;
they are never silently converted to make images match.

Xprite regression remains at its locked DPR 1 and 99% similarity contract.
Human acceptance captures can use native DPR 2 or 3, with corresponding display
dimensions recorded separately. Marketing compositions render directly at
their final export size; raw screenshots and covers are not resampled afterward.

The ignored `.refs/` directory still supplies source and executable oracles for
document/algorithm compatibility, runtime asset extraction, and widget geometry
fixtures. Aseprite is pinned to `1af985278481e278bf44ebec86cb4433aff280b4`, and
LibreSprite to `eb34acdf27805504fe6637093685944877b51fe5`. Defaults use
`.refs/aseprite` and `.refs/libresprite`; override them with `ASEPRITE_SOURCE`
or `LIBRESPRITE_SOURCE`. Retained Aseprite tools use
`.refs/aseprite/build/bin/Aseprite.app/Contents/MacOS/aseprite` or
`ASEPRITE_BINARY`. The Skia-based ICC oracle uses `SKIA_ROOT` or `.refs/skia-arm64`.

| Folder                                     | Purpose                                                                                  |
| ------------------------------------------ | ---------------------------------------------------------------------------------------- |
| `base/`                                    | Shared script helpers, including report parsing and check lookup.                        |
| `fixtures/`                                | Prepares deterministic test data and generated assets.                                   |
| `e2e/`                                     | End-to-end browser flows, package integration checks, and Aseprite compatibility checks. |
| `performance/`                             | Benchmarks and performance checks.                                                       |
| `visual-audit/aseprite/`                   | Exports document frame oracles and regenerates widget geometry evidence.                  |
| `visual-audit/xprite/`                     | Captures current Home/editor scenes and compares them with Xprite baselines.               |
| `visual-audit/baselines/xprite/{zh,en}/`   | Checked-in raw screenshot baselines and capture provenance, grouped by language.           |
| `visual-audit/` and `visual-audit/checks/` | Runs visual gates and compares screenshots, pixels, and audit manifests.                 |

`pnpm run assets:desktop-patterns` decodes the preserved System 7.0, System 7.5
and Mac OS 8.0 disks into the UI pattern catalog, variants and stylesheet. Run it
from the root with `machfs` and `macresources` available (the local research
environment uses `.tmp/system7-icon-tools`). It reads original disks under `.refs`,
retains only repeating PAT#/ppat resources, merges exact repeat/phase/inverted
two-color duplicates, and excludes the visually reviewed vertical gradient.
Full PICT desktop photographs are not imported. Source hashes, original dimensions,
related variants and tile hashes remain in asset provenance. After changing the
public Pattern API, regenerate gallery descriptors with `pnpm run gallery:generate`.
No visual baseline or audit threshold is changed by this asset importer.
