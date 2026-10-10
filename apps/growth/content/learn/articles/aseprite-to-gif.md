# Aseprite to GIF

Use the [Xprite viewer](/tools/viewer/) to turn an `.aseprite` animation into a GIF for a chat, portfolio, or issue report. Open the project in your browser, choose an animation range, and download the result.

Keep your original project for further editing. GIF stores the rendered frames; editable layers and animation tags stay in the `.aseprite` file.

## Export GIF

Open the viewer and choose **Open file**, or drop an `.ase` or `.aseprite` file onto it. Use **Example** to try the workflow before choosing your own project.

Play the animation and inspect its layers. To export one sequence, click its timeline tag or choose it in **Animation range** beside the zoom control. Choose **All frames** for the complete animation. The export button downloads GIF for a range containing multiple frames and PNG for a single-frame range.

The export uses the visible layers and the selected tag's direction. Hiding a layer in the viewer changes the rendered download, while the original file remains unchanged. **Edit** opens that original file in the editor, so preview-only layer visibility changes do not carry across.

## What the GIF preserves

The viewer uses the source frame durations and the selected tag's playback direction. GIF stores time in hundredths of a second, so timings that are not multiples of 10 ms are rounded down in this exporter; GIF players can also impose their own minimum delay. Inspect the downloaded animation in the application where you will share it.

GIF supports a limited color palette and transparent or opaque pixels. It cannot preserve partially transparent pixels like PNG. Gradients and soft edges can change during conversion. For a still image with smooth transparency, [export a PNG frame](/learn/aseprite-to-png/) instead.

The GIF keeps the canvas dimensions. Viewer zoom controls the preview size. Use the editor to resize the artwork or change the animation itself. [Xprite user guide](/help/)

## Large files and export limits

The viewer accepts Aseprite files up to **64 MiB** and checks decoded pixel data separately. A highly compressed file can exceed the decoded-data limit even when its file size is small. Canvas size, frame count and layer limits can also prevent a project from opening.

GIF export expands the selected sequence into rendered frames. A small project with many linked frames can therefore be expensive to export. If the viewer reports an export limit, select a shorter existing tag or open the project in a desktop editor to export a smaller sequence. Keep the original when preparing a reduced copy.

Opening time and playback speed depend on canvas dimensions, visible layers, frame count and available device memory, as well as file size.

## If the result looks wrong

- **Only one image downloads:** check that the selected animation range contains more than one frame.
- **A layer is missing:** check its visibility in the viewer before exporting.
- **The background or colors changed:** check whether the source uses partial transparency or more colors than GIF can retain; use PNG for a still frame.
- **The file will not open:** keep the error message and your original project. A truncated file, unsupported feature, or resource limit needs a different fix from changing the extension.

If you already use desktop Aseprite, its [official export documentation](https://www.aseprite.org/docs/exporting/) describes exporting there. For browser editing choices, see [Aseprite online tools](/compare/aseprite-online/).

Xprite is an independent editor and viewer. Aseprite's official downloads are listed in its [FAQ](https://www.aseprite.org/faq/).
