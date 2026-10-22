# Xiaohongshu mini tools

Xprite's 小工具 for Xiaohongshu, one workspace app for all of them. Each tool is an offline H5
ZIP with `index.html` at the root, one classic ES2017 script, relative asset paths and Chrome 61
fallbacks for the stylesheet. They are separate from the website.

```sh
pnpm build:xhs-minitool pixelate   # one tool: dist/pixelate/ and dist/pixelate.zip
pnpm build:xhs-minitool            # every tool under tools/
```

`pnpm build:pixelate-minitool` is an alias for the first line. Every build type-checks the app
and runs the Xiaohongshu audit (`shared/build/audit.ts`): it fails on a module script, syntax
newer than ES2017, Workers, WebAssembly, `fetch`, `XMLHttpRequest`, `eval`, `new Function` or
dynamic `import()`.

## Layout

- `shared/` is everything the tools reuse:
  - `bridge/`: `xhs-bridge.ts` feature-detects `window.xhs.miniTool`. **保存到相册** passes the PNG
    (through `writeTempFile` when large) to `saveImageToPhotosAlbum`, **发布笔记** to `postNote`,
    and preferences use the container Storage API where the client has it, with browser storage
    as the fallback. On `localhost` outside the container, saving downloads the PNG instead, for
    testing; elsewhere both buttons explain that they need the Xiaohongshu app.
    `window-insets.ts` keeps the page below the container's status bar and buttons: their height
    from `getWindowInfo` (client 9.49+), otherwise at least the top 88 pt. `page.css` holds the
    page-wide touch rules and `runtime-compat.ts` the Chrome 61 fallbacks.
  - `ui/`: the phone kit. `PhoneScreen` (top row with 换照片, the Xprite lockup and 导出, the
    bottom tab bar and the toast), `ExportSheet` (preview, size line, save and post), and the
    controls: buttons, chips, segmented switch, toggle, slider and icons. Shared strings are in
    `text.ts`; a tool adds its own keys on top.
  - `frames/`: export sizes (3:4, 1:1, 9:16 at 1080 px wide), whole-pixel block placement, and
    the retro frames (none, Mac OS 8, System 7, Windows 95-style, old phone, handheld, CRT,
    instant photo) drawn as pixel art at a whole number of export pixels per art pixel and sized
    around the picture, so its blocks stay whole. Framed exports carry the Xprite name in a status
    bar, on the device or as a caption; frameless ones never do.
  - `build/`: the Vite config for one tool, the CSS lowering, the audit and the ZIP packaging.
- `tools/<tool>/` is one tool: `index.html`, `main.tsx` and its own screens and logic.

## Pixelate (`tools/pixelate`)

The pixelate engine through `@xprite/tools-app/pixelation` (`PixelationManager` and its port)
with a 390-wide screen in Simplified Chinese: the before/after split preview and three tabs.
像素 sets the block count and four presets (默认, 清晰, 复古, 少色), with the engine's options
under 高级. 对比 sets the divider's angle, position, sides, line style and labels; the divider can
also be dragged and rotated on the canvas. 边框 picks the frame; the export ratio is under 比例
below the canvas.

- `managers/`: the screen's state (`MiniToolEditor`: split, layout, presets, undo), its text, the
  divider geometry (`split-geometry.ts`), what an export shows (`scene.ts`) and `pixel-presets.ts`.
- `adapters/scene-renderer.ts` draws the frame and then the split picture, for the preview, the
  thumbnails, the export sheet and the PNG alike, so the export matches the preview.
- `adapters/pixelation.ts` converts on the main thread (the container has no Workers) and
  downscales photos to 4 MP first.
- No site navigation, help, footer, telemetry, network requests or external links.

## Adding a mini tool

1. Add `tools/<name>/` with an `index.html` that loads `./main.tsx`, and a `main.tsx` that imports
   `$/shared/bridge/runtime-compat` and `$/shared/bridge/page.css`, awaits `installWindowInsets()`
   and renders the tool.
2. Build the screen from `PhoneScreen`, `ExportSheet` and the controls in `shared/ui`, and provide
   the tool's text through `TextContext` (the shared strings plus its own). Use `shared/frames`
   for export sizes and frames, and `shared/bridge` to save or post.
3. `pnpm build:xhs-minitool <name>` builds `dist/<name>.zip`. Nothing else needs registering:
   the build, type check, knip and the CSS checks pick up every folder under `tools/`.
