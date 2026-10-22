# Xiaohongshu mini tool (pixelate)

`pnpm build:pixelate-minitool` (or `pnpm --filter @xprite/xhs-minitool run build`) packages the
pixelate tool as a Xiaohongshu 小工具: an offline H5 ZIP (`apps/xhs-minitool/xhs-minitool.zip`,
built from `vite.config.ts` into `dist/`) with `index.html` at the root, one classic ES2017 script,
relative asset paths, and Chrome 61 fallbacks for the stylesheet (`build/legacy-css.ts`).

It is separate from the website. It uses the pixelate engine through `@xprite/tools-app/pixelation`
(`PixelationManager` and its port), plus `@xprite/editor-core` and `@xprite/ui`, with its own
phone-sized screen:

- `src/components/` is a single 390-wide screen in Simplified Chinese: a top row (换照片,
  导出), the before/after split preview, and three tabs. 像素 sets the block count and four presets
  (默认, 清晰, 复古, 少色), with the engine's options under 高级. 对比 sets the divider's angle,
  position, sides, line style and labels; the divider can also be dragged and rotated on the
  canvas. 边框 picks the frame: none, Mac OS 8, System 7 and Windows 95-style windows, an old
  candy-bar phone, a handheld console, a CRT monitor or an instant photo. The export ratio (3:4,
  1:1, 9:16) is under 比例 below the canvas. The top 88 px stay clear for the container's bar.
- `src/managers/` holds the screen's state (`MiniToolEditor`: split, layout, presets,
  undo), the screen's text (`text.ts`) and the pure geometry: `split-geometry.ts` (the divider and its pixel steps),
  `composition.ts` (export sizes, frames, whole-pixel block placement) and `pixel-presets.ts`.
- `src/adapters/composition-renderer.ts` draws one scene for the preview, the thumbnails,
  the export sheet and the exported PNG, so the export matches the preview. Exports are 1080 px
  wide. Frames are pixel art drawn at a whole number of export pixels per art pixel and sized around
  the picture, so its blocks stay whole with no letterboxing; framed exports carry the Xprite name
  in a status bar, on the device or as a caption, and frameless ones never do.
- `src/adapters/minitool-pixelation.ts` converts on the main thread (the container has no
  Workers) and downscales photos to 4 MP first.
- `src/adapters/xhs-bridge.ts` feature-detects `window.xhs.miniTool`: **保存到相册** passes
  the PNG (through `writeTempFile` when large) to `saveImageToPhotosAlbum`, **发布笔记** to `postNote`,
  and preferences use the container Storage API on clients that have it, with browser storage as
  the fallback. On `localhost` outside the container, saving downloads the PNG instead, for
  testing; elsewhere both buttons explain that they need the Xiaohongshu app.
- No site navigation, help, footer, telemetry, network requests or external links.
