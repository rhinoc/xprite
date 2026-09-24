# Contributing

## Issues and feature requests

Use the repository's **Bug report / 问题反馈** or **Feature request / 功能建议**
issue form. Reports and suggestions are welcome in English or Chinese.

For a bug, reproduce the problem and open **Edit → Preferences → Diagnostics →
Export diagnostic log** (**编辑 → 首选项 → 诊断 → 导出诊断日志**). Attach the
downloaded `xprite-diagnostics-*.json` file to the diagnostic log field, then
describe the problem and the reproduction steps. Browser and app versions,
available system information, display/input capabilities, storage estimates,
workspace metadata, and recent logs are collected automatically. A report can
be exported even when there are no log entries. Browser privacy restrictions
may limit the system or version information available in the report.

Exports stay on your device until you choose to share them. They contain no
project artwork, but can include project names and error details; review them
before posting publicly. The environment URL excludes query parameters and
fragments. If export is unavailable, explain why in the same field and include
your browser/version, operating system, and the Xprite URL. Screenshots and
minimal example projects are optional; upload `.ase`/`.aseprite` examples as ZIP
attachments. Feature requests do not need diagnostic logs.

## Pull requests

Fork the repository and create a branch for your change. For a large feature or
an architecture change, open an issue first to agree on the scope. Keep each PR
focused; a draft PR is welcome while the work is in progress. PR descriptions
can be in English or Chinese.

Use the [PR template](.github/PULL_REQUEST_TEMPLATE.md) to explain the problem,
the resulting behavior, related issues, and how reviewers can try the change.
Use `Closes #123` only when the PR fully resolves that issue. Record the checks
you actually ran and their results, including anything not verified and known
limitations.

For visual UI changes, include **before-and-after screenshots** with the same
project, theme, zoom, and viewport so reviewers can compare them. For interaction
or animation changes, also include a **short recording or GIF** showing the
trigger, operation, and result. Drag screenshots or recordings into the PR
description to upload them. If the change affects phone or tablet layouts,
include those views and note the relevant browser, viewport, and input method
(mouse, touch, or pen). For changes without visible behavior, mark the visual
section as not applicable.

Read [AGENTS.md](AGENTS.md) and the nearest package's instructions before
changing code. Reuse `@xprite/ui` components and follow the existing component,
manager, port, and adapter boundaries. Update both language catalogs and the
relevant documentation when behavior or visible text changes. For new
third-party code or assets, record their source and license in the appropriate
attribution and license notices.

The in-app **Help → User Guide** reads the version-controlled Markdown files in
`apps/editor/assets/help/`. When changing user-facing navigation, layouts,
gestures, shortcuts, defaults, saving behavior or browser capabilities, update
the relevant sections in both `README.en.md` and `README.zh-CN.md` in the same PR.
Record updated sections in the PR template, or explain why no guide change is
needed. See the **使用指南维护** section in `AGENTS.md` for document format rules.

## Development setup

Use Node.js **24.x** and pnpm **11.1.3**. The Node version is recorded in
`.nvmrc` and `package.json`; the pnpm version is pinned in `package.json`.
If you use nvm, run `nvm use` before installing dependencies.

```sh
pnpm install
pnpm run dev
```

On Windows, install Git for Windows so Husky can run hooks using its shell.
The repository's `.gitattributes` keeps Git hook files on LF line endings even
when `core.autocrlf` is enabled. `pnpm install` installs the hooks automatically;
the generated `.husky/_` directory does not need to be committed.

The editor runs at `http://127.0.0.1:5173/`; the component gallery runs at
`http://127.0.0.1:5174/`. Start one app separately with `pnpm run dev:editor` or
`pnpm run dev:gallery`.

## Checks

For tag-triggered and manual editor releases to EdgeOne Makers, see the
[deployment guide](scripts/deploy/README.md). Deployment settings live in
`edgeone.json` and `.github/workflows/deploy-editor.yml`.

```sh
pnpm test
pnpm run check
pnpm run build
```

`pnpm run check:ui-editor-usage` requires public UI components to be reachable
from the Editor and rejects invalid or unresolved variant usages. Legal variants
that the Editor does not use are reported for information and do not block the
check. This policy also applies to the Git hooks that run the same script.

Browser and Aseprite compatibility scripts are in `scripts/e2e/` and
`scripts/visual-audit/`. The bundled `apps/editor/assets/xprite.ase` file is a
shared project fixture used by the editor, unit tests, and selected browser and
visual-audit checks.

Current UI regression uses Xprite's own 40 Chinese/English captures across Home, editor,
settings, menus, dialogs, recovery, and tooltips in wide and compact layouts. Run `pnpm run visual:capture` and `pnpm run visual:compare`
against the existing dev server. See [the visual baseline workflow](scripts/visual-audit/xprite/README.md)
for capture state, provenance, difference reports, and intentional baseline updates.
The former Aseprite UI screenshot comparison workflow has been removed;
document/algorithm compatibility checks and widget geometry fixtures remain.

## Localization

The editor supports English and Simplified Chinese. Add fixed messages to both
`apps/editor/src/i18n/locales/en.json` and `zh-CN.json`, using stable keys and
matching `{placeholder}` names. Use `tUi(key, values)` for dynamic messages;
translate native DOM labels and text explicitly. Existing `@xprite/ui` controls
resolve catalogued source labels through the UI provider. File names, layer names,
and other user content retain their original text.

`pnpm run check:i18n` checks locale key parity, empty values, duplicate keys,
placeholder parity, and source coverage in the editor, shared UI, menu catalog,
and tool tooltip catalog. It rejects unknown keys, missing interpolation values,
uncatalogued labels and workflow errors, native DOM literals, and messages
assembled with string concatenation or template literals. It follows unambiguous
local constants; runtime data and complex expressions still need review. The
development gallery is outside this editor language check.

The same check runs in the pre-commit hook, in `pnpm run check` before pushing,
and in the GitHub Actions **I18n coverage** workflow on pull requests and pushes.
