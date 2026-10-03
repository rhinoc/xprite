# Scripts

Run scripts from the repository root. The root `package.json` exposes common commands.

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
The old Aseprite UI screenshot comparison and source snapshot workflow has been removed.

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
