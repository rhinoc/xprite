# Xprite browser tools

Standalone read-only Aseprite viewer at `/tools/viewer/`. Run from the repository root
with `pnpm run dev:tools`; the development server uses port 5176. The root
`build:site` pipeline combines this application's independent build with the
editor and growth applications. For access through one LAN IP and port, run
`pnpm run dev` and open `http://<LAN-IP>:5173/tools/viewer/`. Cross-app links and
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
these settings are shared with showcase, guides, articles and web components, and never
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

## Features and shared shell

`/features/` groups editor features and standalone tools into one directory.
The shared menu and footer link directly to each tool, and the desktop Features
shortcut opens the localized directory. `ToolFrame` centralizes browser appearance and
navigation; `FileToolShell` owns local file selection, drag/drop, the short empty
state and the centered **Try example** preview. Examples appear only before opening a
file and are hidden while loading or inspecting a file. Pages contribute their own toolbar
buttons and content. The system menu manages public-desktop appearance preferences.

The registry in `@xprite/growth-content/tools` feeds the tool menu, sitemap and
discovery metadata. Features entries live in the localized `content/about/features.*.md`
files in growth. Preview URLs import original artwork through
`@xprite/site-assets`. A new tool adds its descriptor, manager/adapter/view, HTML
entry, Vite build input and a Features entry in both languages; the shared shell can
be reused without copying it.
Files selected in the tools are processed locally and are not sent
to cloud storage or conversion services.

## Static first paint

`build/startup-pages.ts` generates static HTML during the existing Vite build.
`src/ssg.tsx` calls React's `renderToString` on the actual `ViewerPage`, `GifSheetPage`
and `AnimalCrossingPage`, using their ordinary manager-owned empty states. Pages and
controls have one implementation. Production serves HTML, CSS and assets from
the static build; no request-time rendering service is deployed.

`build/ssg-renderer.ts` collects the components' CSS Modules and original assets.
CSS class names match the browser build, and styles retain dependency evaluation
order. Light and Dark HTML are generated from the same tree. A small inline
script selects the saved Light/Dark/System appearance before paint; without
JavaScript the default is Light. Development previews the same generation path.

`src/bootstrap.tsx` waits for fonts and bitmap resources, then calls `hydrateRoot`
with the same initial theme metadata. A font or image that fails or stalls does not hold the
page: after 4 seconds it hydrates anyway. The generated buttons look ready before React
attaches events, so an inline script (`adapters/tools/startup-click.ts`) remembers the last
button pressed until hydration starts, and it is pressed again once the tool is ready. Shared UI atlas controls provide responsive
first-paint artwork until browser measurements are available. Hydration errors
fail the startup visual gate alongside pixel and geometry changes.
All tool routes use the Macintosh skin from `@xprite/ui`. Light/Dark/System is
shared through the public desktop preferences; the editor appearance is a read-only
initial value when no public preference exists. `ToolAppearance`, browser
preloading and both SSG snapshots select the same skin, so the empty-state HTML
and the hydrated controls share artwork and palette. Empty surfaces use the
provider's palette tokens; the system menu changes the shared public appearance.
Typography also comes from the skin: ChiKareGo2 for ordinary copy and controls,
FindersKeepers for the theme’s mini text, and Fusion Pixel for CJK glyphs.
The shell does not override the theme font, and bootstrap waits for the active
skin’s declared fonts before hydration.

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
use `ScrollArea` with reserved gutters, while `ScrollAreaTarget.Page` covers document
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
The Kenney CC0 village is retained as a fixture.

The lazy Three.js adapter renders a grass plane and alpha-tested design overlay.
`IslandPreviewManager` owns scene lifetime, seasonal ground, original/QR colors,
nearby 3×3/repeated-cell placement, filtering, repeat count and camera presets.
Components size the host through shared geometry utilities. Procedural seasonal grass textures are generated by the preview adapter. Source-color surfaces use
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

## Fuse Bead Pattern Maker

`/tools/fuse-beads/` opens PNG, JPEG, WebP and Aseprite artwork locally. Its manager owns
source frames, grid dimensions, aspect locking, brand selection, board selection and output
state. It does not read or write editor preferences, projects, history or palette state.
The color records in `@xprite/palette-assets/beads` and the quantization, raster chart and
vector PDF functions in editor-core are shared with the editor exporter. The page uses
`FileToolShell`, native shared controls and `ToolCanvasPreview` for file input and navigation.
The original Hello artwork is reused through `@xprite/site-assets`; it is not copied.
The entry participates in the tool registry, site discovery, static first paint and hydration.

The bead tool and Pixelate use the same `pixelateImage`, `updatePixelationSettings`,
`pixelationSettingsOptions` and method descriptors. Both expose nearest-neighbor, area
average, most-frequent RGB, local dominant color and edge-preserving sampling. Bead-specific
processing follows that shared pixel grid: brand/code matching, color exclusion, material
counts, board partitioning and chart output.

On the website, Pixelate runs grid detection and conversion in one page-long worker
(`SerialWorker` from `@xprite/bedrock/browser/worker-job`), started as a file or the example
begins opening. PixelOE keeps its recent results and colour tables there, so a colour-only change
does not rerun it. A new request cancels a running one by replacing the worker.

The tool opens with the full pattern and board guides. The material list supports code/name
search, quantity or code ordering, preview highlights, and color exclusion/restoration.
Excluding a used color rematches it to the remaining used colors; selecting a highlight only
changes the preview. PNG and PDF retain the complete processed pattern.

PNG output uses the shared `renderBeadPatternSheet`: brand, pattern dimensions, bead/color/board
counts, global row and column coordinates, board row/column guides and a swatch/code/quantity
legend accompany the annotated grid. PDF output adds numbered boards to its assembly overview,
global coordinates around each board, and repeated headings on material-list continuation
pages. Both artifacts include the original Xprite brand mark, the tool URL and a QR code;
each PDF page also includes a clickable URL. The PNG memory check includes the annotation,
legend and attribution footer space. Adapters load the original logo from `@xprite/site-assets`
and pass portable pixels to the shared exporters.

Workflow research used [Zippland/perler-beads](https://github.com/Zippland/perler-beads/tree/2efee730f73dd4eb472ebde443a022d11f98bc21),
including its pixelation and color-management behavior. The inspected revision is
`2efee730f73dd4eb472ebde443a022d11f98bc21` (2026-05-14), licensed under AGPL-3.0.
The shared most-frequent sampler is implemented here with bounded RGB counts and explicit
transparent samples. Partial alpha is retained independently of the selected RGB.

Pattern columns and rows describe the whole design. Board columns and rows are independent
integer dimensions of a single rectangular pegboard, used for preview selection, chart
boundaries and PDF pagination. Both accept 1–512; the default board is 29×29. Preview raster
resolution is bounded independently of printable output, so large custom boards remain usable.
Board dimensions are independent of the chosen color palette.

Board sizes vary by product: [Artkal's mini boards](https://www.artkalfusebeads.com/products/artkal-clear-large-square-pegboard-for-mini-2-6mm-beads-bcp01)
come in 50×50 and 52×52 versions, and [Hama's large mini board](https://hama.dk/en/products/mini-pegboard-large-square)
has 3,249 pegs (57×57). [Perler's large square boards](https://perler.com/products/large-square-pegboards-2-ct)
interlock for larger projects. These product examples do not restrict custom dimensions or
the overall pattern size.

## Shared pixelate engine

`src/pixelation-engine.ts` is exported as `@xprite/tools-app/pixelation` (`PixelationManager`, its
port, palettes and the import limit) for apps that build their own screen on the pixelate tool,
such as the Xiaohongshu pixelate mini tool in [`apps/xhs-minitools`](../xhs-minitools/README.md).
