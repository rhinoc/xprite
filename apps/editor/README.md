# Editor app

The browser editor is the main application in this workspace.

- `assets/examples/xprite/` contains the `xprite.ase` brand artwork source
  project, its metadata and derived preview. The source also serves as an
  editable example; it and its preview use the
  [Xprite brand asset license](../../LICENSES/xprite-branding.txt).
- `assets/commands/` contains menu, shortcut and tool-tip catalogs.
- `assets/icons/` groups icons by source (`pixelarticons/` and `xprite/`),
  retaining their attribution notices.
- `assets/home/` contains the Home mascot animation frames, covered by the
  [Xprite brand asset license](../../LICENSES/xprite-branding.txt).
- `assets/palette-presets/` groups palettes by source and retains the catalog's
  author, source and license records.
- `assets/public/` contains files served from the site root by Vite. The brand
  icon, favicons and startup animation are covered by the
  [Xprite brand asset license](../../LICENSES/xprite-branding.txt).
- `assets/help/` contains the English and Simplified Chinese user guides used
  by **Help → User Guide** and linked from the repository READMEs.
- `src/` contains the app composition root, business components, managers,
  browser adapters, and localization.
- `src/i18n/locales/` contains the English and Simplified Chinese UI catalogs.

Test-only artwork belongs in `scripts/fixtures/editor/`. Generated QA evidence
and distribution archives belong in the ignored `.tmp/` directory.

See the repository-level [README](../../README.md) for setup and the
[asset attribution](../../ATTRIBUTION.md) and `LICENSES/` notices for
third-party terms.
