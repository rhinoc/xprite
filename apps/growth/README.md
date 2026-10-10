# Growth pages

This app owns the public help pages, the about page (the device showcase), document pages such as the privacy notice, and website SEO. Its page runtime and Three.js dependency are separate from the editor. The editor reads only Markdown, image catalog data, and image URLs through the private `@xprite/growth-content/help` package in `content/`.

## Development

From the repository root, run `pnpm run dev:growth`, then open:

- `http://localhost:5175/about/` for the MacBook Pro, iPad, and iPhone showcase (the about page).
- `http://localhost:5175/compare/` for the selection column and its three initial articles.
- `http://localhost:5175/help/` for the English guide.
- `http://localhost:5175/zh-CN/help/` for the Chinese guide.
- `http://localhost:5175/privacy/` for the privacy notice rendered from `PRIVACY.md`.

The app uses its own fixed port, 5175. Reuse the running server and HMR after editing. `pnpm run preview:growth` serves an existing growth build on port 4175. Do not run builds or tests during development.

The editor and viewer remain independent applications. Links to their published URLs open the website; this development server does not load their application runtimes.

## Editing the showcase

- HTML entry: `showcase/index.html`; composition root: `src/main.tsx`.
- Page layout: `src/components/showcase/showcase.tsx` and its CSS Module.
- Chapters, labels, and timing: `src/managers/showcase/ipad-story.ts`.
- Editable lettering and native export: `../../scripts/showcase/ipad/hello-path.json` and `generate-hello.py`; see `hello-assets.md` in that directory.
- Actual layered artwork and GIF: `public/showcase/ipad/hello/hello.aseprite` and `hello.gif`. `frames.json` records native frame durations, writing tips and source hashes.
- `public/` is the shared, asset-only `@xprite/site-assets` workspace for website branding and example artwork. Editor and viewer import the same editable example; editor imports its first-frame PNG. Editor and gallery publish selected brand files through `infra/public-package-assets.ts`, preserving their public URLs. The workspace manifest is excluded from public serving and build output.
- Artifact links and canvas mapping: `src/managers/showcase/hello-project.ts`; native PNG sequence loading: `src/adapters/showcase/hello-sprite-project.ts`.
- Playback state: `src/managers/showcase/showcase-manager.ts`.
- Device order and names: `src/managers/showcase/showcase-device.ts`; swipe handling: `src/components/showcase/use-device-swipe.ts`.
- Licensed MacBook Pro and iPhone meshes, author records, editable Blender files, and preparation: `../../scripts/showcase/devices/`. Display texture composition: `src/adapters/showcase/device-models.ts`. Both displays use their own native viewport captures, including the full portrait editor on iPhone.
- Scene rendering, camera motion, and lighting: `src/adapters/showcase/three-showcase-scene.ts`. Overview/focus and snap timing: `src/adapters/showcase/showcase-motion.ts`; wheel and keyboard input: `src/adapters/showcase/showcase-navigation.ts`.
- Device screen composition: `src/adapters/showcase/ipad-screen.ts` and `device-demo-screen.ts`. The computer types `xprite.cc` into an authored browser address bar, then uses the original `@xprite/ui/cursor` artwork for clicks and drawing. The phone opens its Xprite icon with the existing hand model, draws in the portrait editor, and taps Play.
- Computer and phone capture preparation, native images, geometry, frame receipts, and display dimensions: `../../scripts/showcase/devices/captures.md` and `public/showcase/devices/`.
- Touch-up and application launch timing: `src/managers/ports/ipad-launch-motion.ts`; system status layout: `src/adapters/showcase/ipad-system-chrome.ts`.
- Lock-screen photo selection and crop: `src/managers/ports/ipad-wallpapers.ts`; source photographs and license records: `public/showcase/ipad/wallpapers/`.
- Home Screen layout: measured iPad proportions are used as reference only. The page contains a licensed photograph and the Xprite entry, with no personal Home Screen screenshot or apps.
- Runtime models, environment, screen captures, and asset provenance: `public/showcase/ipad/`.
- Editable Blender source and generator: `../../scripts/showcase/ipad/`; see that directory's README for model dimensions and regeneration instructions.

This presentation does not change editor controls, gestures, document creation, or saving behavior. It requires no new editor usage-guide chapter.

Writing is displayed from unchanged native Aseprite PNG exports, without browser stroke rasterization. `motion.json` supplies a continuous arc-length path for the Pencil and retimes the writing PNGs to match that path over ten seconds; the integer cel-tip positions do not drive the pen. Playback uses eight whole-editor captures of the actual `hello.aseprite` file, selected with the ASE's original 120/130ms durations; the artwork, timeline selection and current-frame field therefore advance together. Changing the animation document requires re-exporting its assets and re-capturing the corresponding editor frames. The page is an authored film, not an embedded live editor session.

The Pencil renders into a transparent viewport extending beyond the stage, while the device and hand retain the stage's original composition. Pixel-frame texture updates are independent of the Pencil's display-rate movement.

After loading, the page presents all three devices with their screens off until the visitor chooses one. Hovering a device wakes its screen, enlarges it, and tilts it toward the pointer (up to 5° vertically and 7° horizontally, with 160 ms smoothing). Leaving it turns the screen off and smoothly restores its pose. Keyboard focus wakes the corresponding screen without directional tilt. Reduced motion keeps screen changes immediate and disables hover transforms. Selecting a device by click, tap, or keyboard keeps the displays on and zooms into it over 1.4 seconds. Horizontal mouse drags or touch swipes then cycle through MacBook Pro, iPad, and iPhone, wrapping at either end. The release commits after 48 layout pixels (or 10% of a narrow stage), or a quick flick; it samples the final pointer position and snaps continuously from the dragged position over 460 ms. Cancelling a gesture or releasing a small jitter returns to the current device.

A wheel burst over the device stage advances one device in its dominant horizontal or vertical direction. A quiet interval rearms the gesture, and trackpad momentum cannot advance multiple devices in the same burst. Browser magnification shortcuts remain available. Left/Right arrow keys also navigate. Vertical touch scrolling remains available. The heading follows the selected device in both languages. Reduced motion skips the overview zoom and animated snap and uses the iPad film’s last frame. Each selected device starts its own demonstration after the camera and snap settle; dragging pauses its demonstration clock. The last shot holds while the sprite and matching timeline frames keep looping.

## Help and SEO

Maintain both guide languages and their screenshot records together under `content/help/`. The `build/public-pages.ts` plugin assembles static pages and serves exact public routes. Page renderers in `build/pages/` read the formal content and check guide section links and image catalog entries. `build/seo/` owns search metadata and discovery files; `build/routing/` owns deployed serving rules and the public-path guard.

`content/site/pages.ts` registers canonical public pages from each content scope. The registry supplies sitemap entries, redirects, deployment rewrites and required output files. English pages are unprefixed; Chinese pages share the root `/zh-CN/` prefix (`localizedSiteHref` in `content/site/language.ts`), while tools and component docs use `?lang=zh-CN`. `content/site/documents.ts` lists Markdown document pages: the privacy notice (from the repository-root `PRIVACY.md` and `PRIVACY.zh.md`) and the about articles in `content/about/` (How Xprite Works and Features, in English and Chinese). A document publishes only the languages it is written in, so every registered page has content. Register only pages with written content. The editor remains at `/`; the website's About Xprite link points to the localized about page.

The public-page resource map serves `/theme/fonts.css`, `/theme/chikarego2.woff2` and `/theme/finderskeepers.woff2` directly from `packages/ui/assets/fonts/macintosh/`. Marketing pages, guides, articles and the 404 page share these Macintosh fonts; Fusion Pixel remains the CJK fallback. Fonts are copied only into build output, and their originals stay with the UI package. Latin display sizes follow the fonts’ 16px grid. This typography change does not change user operations, so the guide content requires no additional instructions.

## Compare

The English selection column at `/compare/` is static HTML with no application
runtime. Its manifest and renderer live in `content/articles/index.ts` and `build/pages/article-pages.ts`; Markdown
articles and source dossiers live in `content/compare/`. Only manifest articles
are published. Research and reserve drafts stay out of the output and sitemap.
See [the editorial workflow](content/compare/README.md) for verification rules,
the initial batch, attribution, and evidence required to expand the column.

The column adds no editor operations, gestures, or save behavior, so it links to
existing guide sections without adding a user-guide chapter.

## Performance

`src/adapters/showcase/browser-showcase.ts` loads the Three.js scene through a dynamic import after the page has had a paint opportunity. The showcase uses `UIProvider` with `preloadArtwork={false}` because its buttons use CSS, so bitmap theme sheets and the Chinese font do not block page mounting. Only the Chinese HTML preloads Fusion Pixel, using the same font URL as the guide. Screen assets start loading alongside models and lighting. All three screens share one `HelloSpriteProject`, including its manifest, motion path, and writing sheet. Mutable manifests use HTTP revalidation; writing sheets retain their source hashes.

Each screen loads only the current language's captures initially, retaining them for subsequent switches. The other language loads on demand. Pending language loads pause the demonstration clock; obsolete language requests cannot replace a newer selection. This reduces initial capture loads from 72 PNGs to 36. Their native dimensions imply about 134 MiB less RGBA pixel data before a language switch; this is an asset-size estimate, not a browser heap measurement.

The film clock stays outside React's subscribed page snapshot. Only changes to visible controls and heading text notify page subscribers; the top-level provider subscribes only to language changes. The scene reports when another frame is needed and wakes its manager on input, resize, language completion, and motion-preference changes. A resting overview, paused drag, or reduced-motion still frame stops requesting scene animation frames once transitions settle. Hidden pages also cancel their frame request and resume without advancing the hidden interval. Active demonstrations continue to sample at display rate to keep their hands and Pencil smooth.

Screen paint keys suppress unchanged raster updates, including phone frames where only the separate hand moves. The computer caches its browser/editor background independently of its moving cursor, invalidating that background only when the typed address, focus, language, writing frame, or animation frame changes. After camera settling, unchanged playback frames skip scene drawing. Imported model parts retain their local matrices, world matrices update once per drawn frame, and the foreground pass runs only while the Pencil or phone hand is visible. Both render layers' shaders compile before the entrance, in batches of twelve meshes with paint opportunities between them; shallow compilation clones share the original geometries and materials.

Pointer hover picking and resize/scroll work coalesce per animation frame. Hardware bounds reject empty space before detailed mesh raycasting. Pixel-trail samples share one client-to-local geometry measurement per batch. Unchanged canvas dimensions do not resize the drawing buffer. Development help routes cache their resource map and rendered Markdown until watched sources change, and read binary resources asynchronously. Published help pages retain static HTML and lazy images, with a shared-control enhancement entry for navigation and themed scrollbars. They do not load the showcase scene runtime.

These are source-level optimizations, not Lighthouse score or INP measurements. Compare production Lighthouse runs and interaction traces under the same viewport, device throttling, cache state, language, and story phase when runtime measurement is authorized. Keep the original artwork, native capture dimensions, model provenance, and visual-review requirements when making further reductions.

## Website packaging

`pnpm run build:growth` produces only `apps/growth/dist`. It prepares the shared UI package before type checking and bundling the growth app. It does not build or modify the editor.

The release command `pnpm run build:site` builds the editor, growth app, and tools independently, then `scripts/deploy/assemble-site.mjs` combines their outputs in `.tmp/site`. The editor remains at `/` and `/editor`; the viewer is at `/tools/viewer/` and the GIF converter at `/tools/gif-to-sprite-sheet/`; growth provides `/help/`, `/showcase`, and `/compare/`. Website indexing metadata is applied to the combined output. Each application's own `dist` remains untouched during assembly.

EdgeOne and deployment preparation consume `.tmp/site`. The deployment preparation step checks that all required page entries exist before staging an upload. Build, visual review, push, and publication follow the repository's existing release rules; development does not publish the page.

## Public theme

Showcase, both help languages, comparison/file-guide pages and the 404 page use
the Macintosh light skin. React showcase controls select `macintoshTheme`;
static documents load `/theme/macintosh.css`, generated from the UI package's
`assets/themes/macintosh/palette.json` by `pnpm assets:macintosh-theme`. The public
resource map serves and publishes that stylesheet. Colors remain owned by the
UI theme, and these pages do not alter editor appearance or storage settings.

The showcase uses `PageScrollArea` for document scrolling. Help, comparison, article
and 404 HTML include the separately bundled `controls/index.html` entry, which
mounts shared link buttons, document scrollbars and local `ScrollArea` controls.
Static content and ordinary links remain usable before JavaScript is available.
The UI enhancement does not change editor operations or guide content.

## Unified development access

Run `pnpm run dev` from the repository root to start or reuse all four independent
app servers. Access showcase, articles and help through `http://<LAN-IP>:5173`
at their normal website paths. See [development setup](../../CONTRIBUTING.md).
Growth retains port 5175. Its development modules and hot-update connection use
`/__growth/` to avoid editor module collisions; public URLs remain `/showcase/`,
`/help/`, `/learn/` and `/compare/`. The production base remains `/`.

## System menu and page navigation

Non-editor pages use `@xprite/site-shell`. The rainbow menu opens desktop appearance,
page language and background choices. The right-hand application name opens
design scenes, resources, tools, tutorials and help, product, and legal submenus, alongside editor and Home links.
Current-page commands sit between the system menu and application switcher.
The data-only navigation registry and article catalog live in `content/site/navigation.ts`
and `content/articles/`; editor code consumes only guide/tool data. Desktop
preferences use a separate origin-scoped browser record and do not write editor
preferences. Both user-guide languages describe these entry points. Existing guide
screenshots show editor controls, which this menu change does not move.

The menu and shared footer use the same navigation hierarchy. `@xprite/site-shell`
receives the groups as data, keeping the shell independent of growth. Public pages
and tools render footer columns on wide screens and native disclosures on narrow
screens. Articles share presentation components and styles in `src/components/articles/`.

The desktop pattern menu now uses the curated original System 7/7.5/Mac OS 8
collection in the UI asset package. Two-color masks can use a separately saved
foreground/background pair through Pattern colors; fixed-color PNGs keep their
original palette. The previous imitation IDs are removed. Both guide languages
describe the source groups, color preview and Apply/Cancel behavior.
