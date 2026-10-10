# Xprite browser tools

Standalone read-only Aseprite viewer at `/tools/viewer/`. Run from the repository root
with `pnpm run dev:tools`; the development server uses port 5176. The root
`build:site` pipeline combines this application's independent build with the
editor and growth applications. For access through one LAN IP and port, run
`pnpm run dev` and open `http://<LAN-IP>:5173/tools/`. Cross-app links and
hot-update WebSockets are proxied without changing the browser's origin; the
standalone tools server remains on 5176. See [development setup](../../CONTRIBUTING.md).

Components compose shared UI controls. The manager owns the decoded project and
playback and tag selection. Rendering, frame ordering, animation directions and
GIF encoding reuse `editor-core`. Multi-frame ranges export as GIF; the export
menu also saves the current frame as PNG. The display-only checker is composited
in source pixel coordinates and never included in exports. Browser adapters
provide bounded decompression, downloads and explicit file transfer to the
editor. No editor app runtime is imported.

Timeline tags, frame headers and layer rows use the private `@xprite/editor-ui`
presentation extracted from the editor. Editing actions stay with the editor;
the viewer exposes inspection, visibility and group expansion only. The shared
appearance policy uses the editor's saved Light/Dark/System choice initially.
The rainbow system menu controls the separate public-desktop appearance and background;
these settings are shared with showcase, guides, articles and gallery, and never
write editor preferences.

The bundled Example animation imports
`@xprite/site-assets/showcase/ipad/hello/hello.aseprite` directly from
[`apps/growth/public/showcase/ipad/hello/hello.aseprite`](../growth/public/showcase/ipad/hello/hello.aseprite).
It contains eight frames and two editable layers. See the
[artwork source notes](../../scripts/showcase/ipad/hello-assets.md).

The entry HTML and navigation use the shared rainbow `menu-icon.svg` from
`@xprite/site-assets`; the editor retains its own icon. The tools serve and bundle
the SVG through the public-asset plugin. Apple touch icons and social preview images
are proxied from the editor and growth servers during development. The combined
site provides shared assets at the domain root. Viewer title,
description and Open Graph/Twitter cards describe animation preview and GIF/PNG
export; the site assembly adds viewer-specific WebApplication structured data.
Production uses `https://xprite.cc/tools/viewer/` as its canonical URL and includes it in
the sitemap. Development and preview deployments use `noindex, follow` and omit
the canonical URL and structured data.

## GIF to Sprite Sheet

The independent entry `/tools/gif-to-sprite-sheet/` converts local GIF files into
PNG sheets with JSON Array metadata. Its manager builds an isolated document via
`rasterAnimationProject` and reuses `renderSpriteSheet`; it keeps frame order,
full frame sizes, transparent pixels and durations. Rows default to a near-square
grid. Columns, horizontal/vertical strips, border padding, frame spacing and
power-of-two dimensions are configurable. PNG and JSON download separately to
avoid requiring browser permission for multiple automatic downloads.

Both tools share preview navigation, bitmap typography and appearance adapters.
Conversion uses existing core import/export memory limits, plus a 64 MiB input
file limit. Static GIFs are decoded through the same bounded core path. No
editor preferences, recents or recovery records are written by conversion.
The root `build:tools` output is assembled under `/tools/`; website metadata,
sitemap and HTTP serving rules remain owned by growth and deployment scripts.

## Tool directory and shared shell

`/tools/` lists all tools. The shared Menubar starts with the Xprite logo, followed
by a tool menu; All tools returns to the directory. The logo opens the showcase,
and a help bubble at the trailing edge opens the tool guide. Page actions and
filenames sit in the toolbar below it. `ToolFrame` centralizes browser appearance and
navigation; `FileToolShell` owns local file selection, drag/drop, the short empty
state and the centered **Try example** preview. Examples appear only before opening a
file and are hidden while loading or inspecting a file. Pages contribute their own toolbar
buttons and content. Theme follows the editor preference with no override buttons.

The registry in `@xprite/growth-content/tools` feeds the tool menu, directory,
sitemap and discovery metadata. Preview URLs import original artwork through
`@xprite/site-assets`. A new tool adds its descriptor, manager/adapter/view, HTML
entry and Vite build input; the shared shell can be reused without copying it.
Files selected in the current two tools are processed locally and are not sent
to cloud storage or conversion services.

## Static first paint

`build/startup-pages.ts` generates static HTML during the existing Vite build.
`src/ssg.tsx` calls React's `renderToString` on the actual `ToolsHome`, `ViewerPage`
and `GifSheetPage`, using their ordinary manager-owned empty states. Pages and
controls have one implementation. Production serves HTML, CSS and assets from
the static build; no request-time rendering service is deployed.

`build/ssg-renderer.ts` collects the components' CSS Modules and original assets.
CSS class names match the browser build, and styles retain dependency evaluation
order. Light and Dark HTML are generated from the same tree. A small inline
script selects the saved Light/Dark/System appearance before paint; without
JavaScript the default is Light. Development previews the same generation path.

`src/bootstrap.tsx` waits for fonts and bitmap resources, then calls `hydrateRoot`
with the same initial theme metadata. Shared UI atlas controls provide responsive
first-paint artwork until browser measurements are available. Hydration errors
fail the startup visual gate alongside pixel and geometry changes. This changes
loading only, so the user guide needs no update.

All tool routes use the Macintosh skin from `@xprite/ui`. Light/Dark/System is
shared through the public desktop preferences; the editor appearance is a read-only
initial value when no public preference exists. `ToolAppearance`, browser
preloading and both SSG snapshots select the same skin, so the empty-state HTML
and the hydrated controls share artwork and palette. Empty surfaces use the
provider's palette tokens; the system menu changes the shared public appearance.
Typography also comes from the skin: ChiKareGo2 for ordinary copy and controls,
FindersKeepers for the theme’s mini text, and Fusion Pixel for CJK glyphs.
The shell does not override the theme font, and bootstrap waits for the active
skin’s declared fonts before hydration. This changes typography only; guide
operations and existing guide screenshots are unaffected.

## Animal Crossing Design Converter

`/tools/animal-crossing-qr/` accepts local PNGs and Aseprite projects with embedded
image or tilemap layers. The manager renders a chosen frame through editor-core,
uses the visible tilemap's initial grid when present, and requires explicit
slicing/generation before export. It shares the editor's ordinary-design export
codec: 32 × 32 pixels, 15 ACNL palette colors plus transparency, a raw 620-byte
QR BYTE segment and M error correction. No Nintendo account credentials or
publishing APIs are used. QR PNG downloads and ZIP archives are local; archives
contain `.acnl`, QR and pattern PNGs, a map preview and `layout.json` coordinates.
See ATTRIBUTION.md for reference and encoder licensing. The entry participates in
the existing static-first render/hydration pipeline and tools registry.

Tool navigation/actions use shared slotted `Button` surfaces; panels, inputs,
comboboxes and previews use the UI package. The directory and file empty states
use `ScrollArea` with reserved gutters, while `PageScrollArea` covers document
overflow on small screens. Responsive card previews use
`PixelImageFit.Contain`. Initial artwork URLs are published with the SSG payload
and supplied to hydration, so the same image URLs and CSS dimensions are used
in both renders. File picking, playback and export remain manager workflows.

Normal design QR imports (PNG/JPEG) and raw `.acnl` imports retain all 620 bytes.
The pure `qr/decode.js` reader captures BYTE segments before text decoding.
The manager immediately enables direct export of imported bytes and disables
slicing and reconversion; it does not send imports through color quantization or
rewrite names, IDs, palette ordering or reserved bytes. Four-part pro designs
are outside this tool's normal-design scope.

The default example reconstructs Amy / A Forest Life's **ACNH Winding Cobblestone
Path**, creator `MA-0515-5045-1390`, from the author's published Switch design
previews. Nine pieces form a 96×96 path with transparent edges. Source provenance,
sampling coordinates, 15-color reconstruction palette and error are retained in
`apps/growth/public/tools/animal-crossing/acnh/provenance.json`. The custom credit
policy is retained in `LICENSES/aforestlife-acnh.txt`; it is not a CC license or
original game data. Example loading generates nine designs and credits Amy.
The former Kenney CC0 village remains a fixture, not the default.

The lazy Three.js adapter renders a grass plane and alpha-tested design overlay.
`IslandPreviewManager` owns scene lifetime, seasonal ground, original/QR colors,
nearby 3×3/repeated-cell placement, filtering, repeat count and camera presets.
Components size the host through shared geometry utilities. Procedural seasonal
grass approximations contain no Nintendo texture rips. Source-color surfaces use
the same cell geometry and nearest sampling as QR conversion; QR exports still
use the older import palette. The preview does not emulate built-in path clipping
or game lighting. The center pane always shows the 2D sprite sheet, while a
separate compact Preview panel shares the QR sidebar. Its settings are collapsed
initially. Nearby placement crops at most 3×3 cells around the selected tile; repeat
placement tiles that one design 1–7 times per axis. Hiding Preview releases GPU resources;
WebGL failures do not block QR conversion. Artwork conversion separates information,
layout, composite preview and QR output; Single/Tiles layout controls draft
geometry. The preview's source/converted grid uses the same core geometry policy
as export and highlights the selected row/column. QR reading has compact read-only
information and direct PNG export. Narrow screens use natural vertical flow;
primary download is also available in the mobile header.

Tool-host and initial-artwork contexts keep their identities across hot updates,
so independently refreshed providers and consumers remain connected. Static asset
resolution reads the current asset package's exports and watches its manifest,
avoiding stale Node package-export caches after adding an example asset.
