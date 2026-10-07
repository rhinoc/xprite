# Aseprite to GIF: Export Sprite Animations Online Free

Have an `.aseprite` animation that you need to share in a chat, portfolio, or issue report? The [free Xprite viewer](/tools/viewer/) opens the project in your browser and downloads an animated GIF. You do not need an account or an Aseprite installation. The selected file is decoded on your device; conversion does not upload it.

Xprite is an independent editor and viewer, not an official online version of Aseprite. Keep your original project: a GIF contains rendered frames, not editable layers or animation tags.

## Export the animation you need

Open the viewer and choose **Open file**, or drop an `.ase` or `.aseprite` file onto it. Use **Example** to try the workflow before choosing your own project.

Play the animation and inspect its layers. To export one sequence, click its timeline tag or choose it in **Animation range** beside the zoom control. Choose **All frames** for the complete animation. The export button downloads a GIF for a range containing multiple frames. A single-frame range downloads a PNG; it does not become an animated GIF.

The export uses the visible layers and the selected tag's direction. Hiding a layer in the viewer changes the rendered download, while the original file remains unchanged. **Edit** opens that original file in the editor, so preview-only layer visibility changes do not carry across.

## What the GIF preserves

The viewer uses the source frame durations and the selected tag's playback direction. GIF stores time in hundredths of a second, so timings that are not multiples of 10 ms are rounded down in this exporter; GIF players can also impose their own minimum delay. Inspect the downloaded animation in the application where you will share it.

GIF supports a limited color palette and transparent or opaque pixels. It cannot preserve partially transparent pixels like PNG. Gradients and soft edges can change during conversion. For a still image with smooth transparency, [export a PNG frame](/learn/aseprite-to-png/) instead.

The GIF keeps the canvas dimensions. Changing the viewer zoom changes the preview, not the exported resolution. Use the editor when you need to resize the artwork or change the animation itself. [Xprite user guide](/help/en/)

## Large files and export limits

The viewer accepts Aseprite files up to **64 MiB** and checks decoded pixel data separately. A highly compressed file can exceed the decoded-data limit even when its file size is small. Limits also apply to canvas size, frame count, and layers; a supported extension alone does not guarantee that a project can open.

GIF export expands the selected sequence into rendered frames. A small project with many linked frames can therefore be expensive to export. If the viewer reports an export limit, select a shorter existing tag or open the project in a desktop editor to export a smaller sequence. Keep the original when preparing a reduced copy.

No universal opening-time or frame-rate guarantee applies to every browser and project. Canvas dimensions, visible layers, frame count, and available device memory matter as well as the file's byte size.

## If the result looks wrong

- **Only one image downloads:** check that the selected animation range contains more than one frame.
- **A layer is missing:** check its visibility in the viewer before exporting.
- **The background or colors changed:** check whether the source uses partial transparency or more colors than GIF can retain; use PNG for a still frame.
- **The file will not open:** keep the error message and your original project. A truncated file, unsupported feature, or resource limit needs a different fix from changing the extension.

If you already use desktop Aseprite, its [official export documentation](https://www.aseprite.org/docs/exporting/) describes exporting there. For browser editing choices, see [Aseprite online tools](/compare/aseprite-online/).
