# WeChat mini program guide

## Canvas and tools

Use **文件 → 新建** (File → New) to choose a name and canvas dimensions. Draw with one finger. Pinch with two fingers to zoom, and move both fingers to pan. Adding a second finger cancels the current single-finger drawing gesture. **适合** (Fit) centers the canvas.

The bottom slider changes brush size. Tap the foreground swatch to enter a six-digit hexadecimal color, or tap a palette swatch to select that color.

## Layers and frames

Tap a layer name to select it; hold the name to rename it. **显/隐** changes visibility and **锁/解** changes the editing lock. Hidden and locked layers cannot be painted.

Tap a frame number to select it. **复制帧** duplicates the current frame. Tap the duration button to change its duration in milliseconds. **播放** plays the animation; **停止** stops it for editing.

## Open and save

**文件 → 打开 Aseprite 文件** opens an `.ase` or `.aseprite` file from a WeChat chat. **从相册打开图片** opens a photo-album image as a new canvas. Canvas dimensions are limited to 512 pixels per side; Aseprite files to 16 MiB, 64 frames and 32 layers. A failed import leaves the current canvas intact.

**文件 → 保存** saves the project to WeChat's local data. **本地作品** opens or deletes saved projects; up to 30 projects can be kept. Save changes you want to retain before switching projects.

Automatic drafts preserve completed edits and restore the last canvas when the mini program opens again. They do not preserve undo history or replace Save. An asterisk (`*`) in the title indicates unsaved changes.

## Export

**文件 → 导出 Aseprite 文件** creates an `.aseprite` file containing layers and frames, then opens WeChat's chat selector. Cancelling the selector does not change the project. Back up important projects outside the mini program: uninstalling WeChat, clearing its data or system storage reclamation may remove local projects.

**文件 → 导出 PNG 到相册** saves the current frame's visible-layer composite at its original pixel dimensions, preserving transparency. If photo-album permission was denied, enable it in Settings from WeChat's upper-right menu, then export again.
