# Editor app

The browser editor is the main application in this workspace.

- `assets/examples/hello/` contains editor-specific example names and identity.
  The editable animation and first-frame preview are imported from the asset-only
  `@xprite/site-assets` workspace rooted at
  [`apps/growth/public/`](../growth/public/).
  Home lists the project as `example.aseprite`. See the
  [artwork source notes](../../scripts/showcase/ipad/hello-assets.md).
- `assets/examples/xprite/` retains the `xprite.ase` brand artwork source
  project and its derived preview, covered by the
  [Xprite brand asset license](../../LICENSES/xprite-branding.txt).
- `assets/commands/` contains menu, shortcut and tool-tip catalogs.
- `assets/icons/` groups icons by source (`pixelarticons/` and `xprite/`),
  retaining their attribution notices.
- `assets/home/` contains the Home mascot animation frames, covered by the
  [Xprite brand asset license](../../LICENSES/xprite-branding.txt).
- `assets/palette-presets/` groups palettes by source and retains the catalog's
  author, source and license records.
- `assets/public/` contains files served from the site root by Vite. The brand
  SVG icon, ICO favicon and 32px favicon come directly from `@xprite/site-assets`
  through the shared public-asset Vite plugin. App installation icons, the 16px
  favicon and startup animation remain local. All brand artwork is covered by the
  [Xprite brand asset license](../../LICENSES/xprite-branding.txt).
- **Help → User Guide** reads the English and Simplified Chinese guides from
  `@xprite/growth-content/help`. Their Markdown and screenshots are maintained in
  [`apps/growth/content/help/`](../growth/content/help/).
- `src/` contains the app composition root, business components, managers,
  browser adapters, and localization.
- `src/i18n/locales/` contains the English and Simplified Chinese UI catalogs.

Test-only artwork belongs in `scripts/fixtures/editor/`. Generated QA evidence
and distribution archives belong in the ignored `.tmp/` directory.

## Host boundaries

`@xprite/editor-app/embedded-runtime` mounts the application and its UI providers.
`@xprite/editor-app/host-contracts` exposes host ports without mounting or browser side effects.
`@xprite/editor-app/browser-io` supplies optional browser-compatible I/O defaults.
Recovery byte codecs live in `@xprite/editor-core/import-export`.
Hosts provide catalog, payload, checksum, ID, clock and lock capabilities through
`createProjectStorage()`; `App.tsx` creates the common repository policy.

## Installation and offline resources

The production web entry creates the PWA browser port before rendering React,
then injects it into the application manager. Development and embedded hosts
do not register a service worker or show installation promises.

`build/editor-offline.ts` generates the complete editor resource inventory from
the build output, including lazy modules, workers, fonts and bundled projects.
It embeds content hashes in `sw.js` and writes a separate immutable HTML shell
so deployment metadata changes cannot mix editor versions. Public help,
showcase and viewer routes are outside the editor navigation fallback.

The Home entry uses shared controls and tooltips to add a desktop shortcut and
report offline readiness. The first successful save may show one brief shared
Toast; there are no installation-failure dialogs or update controls. Complete
new resource caches activate silently, without reloading open pages. The next
manual refresh or reopen uses the new shell. Old immutable hashed resources
remain available to pages that are still running. Desktop shortcuts do not
synchronize artwork or replace file exports; the user-facing instructions live
in the bilingual help guides.

See the repository-level [README](../../README.md) for setup and the
[asset attribution](../../ATTRIBUTION.md) and `LICENSES/` notices for
third-party terms.
