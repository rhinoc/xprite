# Aseprite to PNG: Export a Transparent Sprite Frame Free

Need a PNG from an `.aseprite` project someone sent you? The [free Xprite viewer](/tools/viewer/) opens local Aseprite files, lets you select a frame and visible layers, and downloads that rendered frame as PNG. No account, desktop installation, or project upload is required.

This exports one image at the source canvas dimensions. It does not create a sprite sheet, a ZIP of every frame, or an editable layered project. Keep the `.aseprite` original for further work.

## Choose a frame and download PNG

Choose **Open file** or drop an `.ase` or `.aseprite` file into the viewer. Use **Example** if you want to try the controls first. Select the frame you need on the timeline and check the visible layers.

For an animated project, open the arrow beside the export button and select **Current frame (.png)**. For a single-frame range, the export button already downloads PNG. The filename includes the source frame number so that individual downloads are easier to identify.

To turn the whole animation into a shareable moving image, use the [Aseprite to GIF guide](/learn/aseprite-to-gif/). For a sprite sheet, use the editor's **File → Export Sprite Sheet** workflow; choosing PNG in the viewer exports only the current frame.

## Keep transparency and crisp pixels

The checkerboard in the viewer shows transparency; it is not painted into the exported PNG. An opaque background layer is part of the artwork, however. Hide that layer before exporting if you want it excluded. PNG preserves alpha transparency in the rendered frame.

Viewer zoom does not resize the download. A 32 × 32 project produces a 32 × 32 PNG. If a destination enlarges it with smoothing, the display can look blurry even though the downloaded pixels are unchanged. Set the destination's image scaling to nearest-neighbor, or resize a separate copy in an editor when the destination requires a larger image.

Visible layers are composited into one image. Layer names, hidden content, animation tags, and other editable project information are not stored in that PNG. Aseprite likewise recommends keeping its project format for editable work. [Aseprite save documentation](https://www.aseprite.org/docs/save/)

## Open the right kind of ASE file

`.aseprite` is an Aseprite project extension. `.ase` is also used for Adobe Swatch Exchange palettes; those palette files are a different format and cannot be converted into sprite images by this viewer. Renaming one does not convert it. [Aseprite file-extension FAQ](https://www.aseprite.org/faq/)

A corrupt or incomplete project can fail to decode. The viewer also limits input files and decoded pixel data to **64 MiB**, with separate canvas, layer, and frame checks. A small compressed file is not necessarily a small image in memory. Reduce a copy in the originating editor when its dimensions or contents exceed these limits.

## Continue editing without losing your source

**Edit** opens the original project in Xprite. Layer visibility changes made just for previewing are not transferred. Save a separate project if you change the artwork, and keep the PNG as the delivery image. The [save and recovery guide](/help/en/#save-and-recover) explains browser file saving.

Xprite is a separate project from Aseprite. Import support does not promise that every Aseprite feature renders identically; compare important outputs with the original application before using them in a production asset pipeline.
