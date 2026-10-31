# Growth pages

This app owns the public help pages, the About landing page, document pages such as the privacy notice, and website SEO. Its page runtime is separate from the editor. The editor reads only Markdown, image catalog data, and image URLs through the private `@xprite/growth-content/help` package in `content/`.

## Development

From the repository root, run `pnpm run dev:growth`, then open:

- `http://localhost:5175/about/` for the About landing page.
- `http://localhost:5175/compare/` for the selection column and its three initial articles.
- `http://localhost:5175/help/` for the English guide.
- `http://localhost:5175/zh-CN/help/` for the Chinese guide.
- `http://localhost:5175/privacy/` for the privacy notice rendered from `PRIVACY.md`.

The app uses its own fixed port, 5175. Reuse the running server and HMR after editing. `pnpm run preview:growth` serves an existing growth build on port 4175. Do not run builds or tests during development.

The editor and viewer remain independent applications. Links to their published URLs open the website; this development server does not load their application runtimes.

## Editing the About page

- HTML entry: `showcase/index.html`. The build writes static HTML through `build/seo/showcase-seo.ts`; the menubar and footer hydrate as islands through `src/public-main.tsx`.
- Page body: `src/components/landing/landing.tsx` and its CSS Module. Copy: `content/showcase/landing.ts`; FAQ: `content/showcase/faq.ts`; titles and descriptions: `content/showcase/pages.ts`.
- Colors: `src/components/landing/landing-palette.ts` writes `--landing-*` variables per appearance from the Moss color family in `@xprite/ui`.
- Hero pointer painting and ruler marks: `src/adapters/landing/landing-hero.ts`, loaded only when the hero exists. Reduced motion turns it off.
- Editor screenshots: `public/showcase/landing/`, captured with `../../scripts/showcase/landing/capture.mjs`; `capture.json` records the source and hashes.
- Editable lettering and native export: `../../scripts/showcase/ipad/hello-path.json` and `generate-hello.py`; see `hello-assets.md` in that directory.
- Actual layered artwork and GIF: `public/showcase/ipad/hello/hello.aseprite` and `hello.gif`. `frames.json` records native frame durations, writing tips and source hashes.
- `public/` is the shared, asset-only `@xprite/site-assets` workspace for website branding and example artwork. Editor and viewer import the same editable example; editor imports its first-frame PNG. Editor and web components publish selected brand files through `infra/public-package-assets.ts`, preserving their public URLs. The workspace manifest is excluded from public serving and build output.
- Computer editor captures used by feature pages: `../../scripts/showcase/devices/captures.md` and `public/showcase/devices/computer/`.

## Help and SEO

Maintain both guide languages and their screenshot records together under `content/help/`. The `build/public-pages.ts` plugin assembles static pages and serves exact public routes. Page renderers in `build/pages/` read the formal content and check guide section links and image catalog entries. `build/seo/` owns search metadata and discovery files; `build/routing/` owns deployed serving rules and the public-path guard.

`content/site/pages.ts` registers canonical public pages from each content scope. The registry supplies sitemap entries, redirects, deployment rewrites and required output files. English pages are unprefixed; Chinese pages share the root `/zh-CN/` prefix (`localizedSiteHref` in `content/site/language.ts`). The editor, public pages and tools share the saved language preference `xse.ui.language.v1`; tools keep the same URL in both languages. `content/site/documents.ts` lists Markdown document pages: the privacy notice (from the repository-root `PRIVACY.md` and `PRIVACY.zh.md`) and the about articles in `content/about/` (How Xprite Works and Features, in English and Chinese). A document publishes only the languages it is written in, so every registered page has content. Register only pages with written content. The editor remains at `/`; the website's About link points to the localized about page.

The public-page resource map serves `/theme/fonts.css`, `/theme/chikarego2.woff2` and `/theme/finderskeepers.woff2` directly from `packages/ui/assets/fonts/macintosh/`. Marketing pages, guides, articles and the 404 page share these Macintosh fonts; Fusion Pixel remains the CJK fallback. Fonts are copied only into build output, and their originals stay with the UI package. Latin display sizes follow the fonts’ 16px grid.

## Compare

The English selection column at `/compare/` is static HTML with no application
runtime. Its manifest and renderer live in `content/articles/index.ts` and `build/pages/article-pages.ts`; Markdown
articles and source dossiers live in `content/compare/`. Only manifest articles
are published. Research and reserve drafts stay out of the output and sitemap.
See [the editorial workflow](content/compare/README.md) for verification rules,
the initial batch, attribution, and evidence required to expand the column.

## Performance

The About page is static HTML. Its only scripts are the shared menubar and footer islands and the small hero adapter. Development help routes cache their resource map and rendered Markdown until watched sources change, and read binary resources asynchronously. Published help pages retain static HTML and lazy images, with a shared-control enhancement entry for navigation and themed scrollbars.

## Website packaging

`pnpm run build:growth` produces only `apps/growth/dist`. It prepares the shared UI package before type checking and bundling the growth app. It does not build or modify the editor.

The release command `pnpm run build:site` builds the editor, growth app, and tools independently, then `scripts/deploy/assemble-site.mjs` combines their outputs in `.tmp/site`. The editor remains at `/` and `/editor`; the viewer is at `/tools/viewer/` and the GIF converter at `/tools/gif-to-sprite-sheet/`; growth provides `/help/`, `/showcase`, and `/compare/`. Website indexing metadata is applied to the combined output. Each application's own `dist` remains untouched during assembly.

EdgeOne and deployment preparation consume `.tmp/site`. The deployment preparation step checks that all required page entries exist before staging an upload. Build, visual review, push, and publication follow the repository's existing release rules; development does not publish the page.

## Public theme

Both help languages, comparison/file-guide pages and the 404 page use
the Macintosh light skin. The About page body uses the Moss colors; its menubar
keeps the Macintosh skin. Static documents load `/theme/macintosh.css`, generated from the UI package's
`assets/themes/macintosh/palette.json` by `pnpm assets:macintosh-theme`. The public
resource map serves and publishes that stylesheet. Colors remain owned by the
UI theme, and these pages do not alter editor appearance or storage settings.

`/theme/*.css`, `/help/guide.css`, fonts and images keep stable file names. The
growth build ends with the shared `versionOutputDirectory()` from
`infra/content-versions.ts`, which appends `?v=<content hash>` to every such page
and stylesheet reference; see `scripts/deploy/README.md`.

About, help, comparison, article
and 404 HTML include the separately bundled `controls/index.html` entry, which
mounts shared link buttons, document scrollbars and local `ScrollArea` controls.
Static content and ordinary links remain usable before JavaScript is available.

## Unified development access

Run `pnpm run dev` from the repository root to start or reuse all four independent
app servers. Access About, articles and help through `http://<LAN-IP>:5173`
at their normal website paths. See [development setup](../../CONTRIBUTING.md).
Growth retains port 5175. Its development modules and hot-update connection use
`/__growth/` to avoid editor module collisions; public URLs include `/about/`,
`/help/` and `/compare/`. The production base remains `/`.

## System menu and page navigation

Non-editor pages use `@xprite/site-shell`. The rainbow menu opens desktop appearance,
page language and background choices. The right-hand application name opens
design scenes, resources, tools, tutorials and help, product, and legal submenus, alongside editor and Home links.
Current-page commands sit between the system menu and application switcher.
The data-only navigation registry and article catalog live in `content/site/navigation.ts`
and `content/articles/`; editor code consumes only guide/tool data. Desktop
preferences use a separate origin-scoped browser record and do not write editor
preferences. Each page supplies help for its own instructions; the editor guide is linked
from site resource navigation.

The menu and shared footer use the same navigation hierarchy. `@xprite/site-shell`
receives the groups as data, keeping the shell independent of growth. Public pages
and tools render footer columns on wide screens and native disclosures on narrow
screens. Articles share presentation components and styles in `src/components/articles/`.

The desktop pattern menu now uses the curated original System 7/7.5/Mac OS 8
collection in the UI asset package. Two-color masks can use a separately saved
foreground/background pair through Pattern colors; fixed-color PNGs keep their
original palette. The pattern menu groups source tiles and exposes color preview with Apply/Cancel.

The Features page at `/features/` and `/zh-CN/features/` renders grouped
editor and tool icons from the localized Markdown in `content/about/features.*.md`.
The menu and footer link directly to individual tools; desktop directory shortcuts
open Features. `/tools/` redirects to Features.

Features entries open movable, resizable windows in the directory. Window content
comes from `content/features/details/`, and the same content has localized direct
URLs under `/features/<task>/` and `/zh-CN/features/<task>/`. Each window provides
an explicit editor or tool launch action.

Feature-window media references existing comparison, guide and shared public
assets through `content/features/media.ts`. Animation and workspace captures come
from `content/features/capture-media.ts`; reuse URLs and originals rather
than adding feature-specific image copies.
