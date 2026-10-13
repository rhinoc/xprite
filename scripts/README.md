# Scripts

Run scripts from the repository root. The root `package.json` exposes common commands.

`pnpm run dev` uses `dev/site.mjs` to start or reuse the four independent app
servers and prints unified local/LAN entry points on port 5173. It does not run
builds and only stops processes that it started. Shared proxy rules and server identity metadata live in `infra/dev-site.ts`;
fixed ports and development bases live in `infra/dev-site.json`. See
[development setup](../CONTRIBUTING.md).

To run another worktree at the same time, give its four-server stack a free port
block, for example `XPRITE_DEV_PORT_BASE=5273 pnpm dev`. That worktree uses
5273–5276 for editor, components, growth, and tools, with its proxy routes kept
inside the same checkout. Choose another unused base for each additional
worktree; the default checkout continues to use 5173–5176.

`pnpm run check` runs every check in parallel through `scripts/check/run.mjs` and
lists all failures at the end. Groups can run alone: `pnpm run check:architecture`
(package imports, package architecture, DOM geometry, UI editor usage, UI control
placement, global CSS and the editor-core dependency graph), `pnpm run
check:stale-css` and `pnpm run check:site-build`. `node scripts/check/run.mjs
<group> --only name,name` runs selected tasks; `--list` prints them.
`pnpm run check:types` type-checks every project with tsgo, incrementally (cache in
each project's `node_modules/.cache/xprite-types`).

Visual audits run with Playwright's bundled headless Chromium on macOS, Linux and
Windows. `pnpm run visual` builds the production site (`pnpm run build:site`, skipped with
`--prebuilt`), serves `.tmp/site` with the EdgeOne routing rules
(`visual-audit/base/static-site.mjs`), launches one browser and runs every audit in parallel,
sharding scenes over `XPRITE_VISUAL_SHARDS` pages (default: half the CPUs). `--dev` audits the
Vite dev server instead. Scrollbars stay visible (Playwright's default `--hide-scrollbars` is
dropped) so the baselines match the real product; see `visual-audit/base/browser.mjs` for the
pinned rendering settings. Run `pnpm exec playwright install chromium`
once per machine. `XPRITE_SKIP_VISUAL=1` skips the visual audits explicitly. After any
re-baseline, run `pnpm run visual:optimize` (lossless oxipng, pixels verified, manifest hashes
updated) before committing.

`pnpm run build:site` (`scripts/build/site.mjs`) always builds fresh. It builds `@xprite/ui`,
bedrock, editor-core and editor-ui once, then the editor, growth, tools and components apps in
parallel, and assembles `.tmp/site`. Each lane's log goes to `.tmp/build-logs/`. The apps'
`prebuild`/`predev` hooks (`scripts/build/ensure-ui.mjs`) skip the ui build only inside that same
run (`XPRITE_UI_BUILT=1`). The ui and editor-core declaration builds use `tsc -b` without
`--force`; their build info lives inside the output folder, so deleting the outputs rebuilds them.

The pre-push hook (`scripts/check/pre-push.mjs`) runs `pnpm run check --skip site-build` in
parallel with the one site build (`check:deploy --build`). Once both pass, `pnpm run test:ci`
(`XPRITE_TEST_MAX_WORKERS` optionally caps its workers), `pnpm run visual --prebuilt`,
`check:deploy --prepare` and `pnpm run check:site-output` run in parallel against that build.
`check:site-output` holds the growth/tools output checks (SSR warnings read from the build
logs, page metadata, asset versions), so nothing builds growth or tools a second time while the
site build writes them.
Their output is buffered and printed as one block per step with its time, followed by the
total. Nothing is cached between pushes: every push runs every step. husky skips all hooks
when `HUSKY=0` is set, so make sure it is unset (for example, `env -u HUSKY git push`) when
the environment sets it. `pnpm install` under `HUSKY=0` also skips installing the hooks, so a
fresh clone or worktree set up that way needs `env -u HUSKY pnpm exec husky` once.

`pnpm run test:ci` fails on any failing test; there is no known-failure allowlist.
`pnpm run check:deploy` is the build half of the deploy workflow without secrets or
publishing: `edgeone validate`, `pnpm run build:site` and `pnpm run deploy:prepare` into
`.tmp/deploy/editor`.

CI is a safety net because pre-push catches failures first. `check.yml` runs `check` and
`test:ci` in one job on pull requests (no duplicate push run). `visual.yml` runs the visual
audits only when rendering-related paths change, with cached Playwright browsers. Both
cancel superseded runs.

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

`pnpm run check` (and so pre-push) runs `check:site-build`, which builds Growth's and
Tools' static pages and blocks the push if React reports that `useLayoutEffect`
ran during server rendering, if a page is larger than 1 MiB, or if a page inlines
theme cursor artwork in a `style` attribute. The same build then feeds the page
metadata check and the asset-version check.

For itch.io, run `pnpm run itch:pack` to build an uploadable ZIP, or build with
`pnpm run build:itch` and upload through `pnpm run deploy:itch username/project`.
See [the itch.io distribution instructions](deploy/ITCH.md).

Use the ignored `.tmp/` directory for all script-generated local output, including QA reports, screenshots, generated fixtures, visual captures, audit manifests, temporary bundles, and caches. Keep checked-in source fixtures under `scripts/fixtures/`.

Retained task reports live in `.tmp/artifacts/`.
The deterministic editor artwork fixture lives in `fixtures/editor/`;
asset extraction tools in `fixtures/assets/` write runtime fonts, themes and
cursors into the corresponding `packages/ui/assets/` source directories.

Unit tests use Vitest and live beside the implementation: `module.ts` is tested by `module.test.ts`. Run them with `pnpm test`, or run one file with `pnpm exec vitest run path/to/module.test.ts`.

`pnpm run check:architecture -- --only ui-editor-usage` uses the TypeScript compiler API to trace rendered components from the Editor entry through local wrappers, lazy imports, and UI component composition. Missing public `@xprite/ui` components, invalid variant values, and variant usages the checker cannot resolve fail the check. Legal variants that the Editor does not use are informational and do not fail it; components app usage does not count toward Editor coverage. Its implementation is in `check/`; the root `check` runs it.

`pnpm run check:stale-css` runs `check-unused-css` against the Editor, components, growth, tools and UI source trees in parallel. The checker reports unused CSS Module classes and class references missing from their stylesheets. The root `check` runs it.

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

Pre-push also runs `pnpm run visual:startup` to compare the generated SSG first
paint with the interactive first paint on all three tool pages, in wide and
compact layouts with Light, Dark and both System preferences. This separate gate
requires exact equality of every decoded RGBA pixel across the whole viewport
and unchanged region geometry (100% similarity). Capture failure or incomplete evidence blocks the
push. Reports and both raw images are saved in `.tmp/tools-startup-visual/`.
The hook targets the unified site on port 5173; `XPRITE_VISUAL_PORT` selects
another existing site server. See [the SSG capture contract](visual-audit/tools-startup/README.md).

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
| `visual-audit/aseprite/`                   | Exports document frame oracles and regenerates widget geometry evidence.                 |
| `visual-audit/xprite/`                     | Captures current Home/editor scenes and compares them with Xprite baselines.             |
| `visual-audit/baselines/xprite/{zh,en}/`   | Checked-in raw screenshot baselines and capture provenance, grouped by language.         |
| `visual-audit/` and `visual-audit/checks/` | Runs visual gates and compares screenshots, pixels, and audit manifests.                 |

`pnpm run assets:desktop-patterns` decodes the preserved System 7.0, System 7.5
and Mac OS 8.0 disks into the UI pattern catalog, variants and stylesheet. Run it
from the root with `machfs` and `macresources` available (the local research
environment uses `.tmp/system7-icon-tools`). It reads original disks under `.refs`,
retains only repeating PAT#/ppat resources, merges exact repeat/phase/inverted
two-color duplicates, and excludes the visually reviewed vertical gradient.
Full PICT desktop photographs are not imported. Source hashes, original dimensions,
related variants and tile hashes remain in asset provenance. After changing the
public Pattern API, regenerate component catalog descriptors with `pnpm run components:generate`.
