# Editable Hello artwork

The showcase lettering is original artwork. Its only control-point source is
[`hello-path.json`](hello-path.json). Native Aseprite generates the pixel art
and the recorded brush-center coordinates. The browser places the Pencil on a
continuous floating-point path from the same source curves and displays the
corresponding native PNG frame without changing its pixels.

Run from the repository root:

```sh
python3 scripts/showcase/ipad/generate-hello.py
```

The generator accepts `--aseprite /path/to/aseprite` and otherwise uses the
`aseprite` executable or this workstation's Aseprite development app. It needs
Python's standard library and native Aseprite with Lua scripting. It does not
run the application build or test suite.

The generator samples the editable path, rounds the results to integer sprite
coordinates, then draws Bresenham segments with a 2 × 2 square brush directly
into Aseprite `Image` pixels. It never uses font rasterization, a canvas stroke,
antialiasing, a color threshold, or a scaled source image. It saves layered
`.aseprite` files, reopens those files in native Aseprite, and exports the PNG
sheets, individual PNG frames, GIF, and native frame metadata from those saved
documents.

Deliverables are in `apps/growth/public/showcase/ipad/hello/`:

These files belong to the shared, asset-only `@xprite/site-assets` workspace
rooted at `apps/growth/public/`, alongside website brand assets. The editor's
bundled `example.aseprite` and the viewer's Example import `hello.aseprite`
directly; the editor preview imports `hello-frame-01.png`. Regenerating these
originals updates all consumers without copying files into individual apps.
The package manifest is source configuration and is excluded from public output.

| File                                        | Editable content or export                                                                                                                       |
| ------------------------------------------- | ------------------------------------------------------------------------------------------------------------------------------------------------ |
| `hello.aseprite`                            | 128 × 80 RGBA animation, eight real frames and two editable layers: Background (hidden by default) and Hello                                     |
| `hello.gif`                                 | Native export of the same eight-frame color animation                                                                                            |
| `animation.png`                             | Eight untrimmed frames in a 1024 × 80 horizontal sheet                                                                                           |
| `hello-editor.png`                          | Unmodified 1440 × 840 Xprite editor capture with the Hello project and its Background layer hidden; capture provenance is in `hello-editor.json` |
| `hello-sheet.png`                           | 384 × 240 transparent static sheet exported from the saved native document, with three columns and eight full-size frames                        |
| `hello-frame-01.png` … `hello-frame-08.png` | Individual native PNG exports                                                                                                                    |
| `animation.json`                            | Native Aseprite export metadata and actual frame durations                                                                                       |
| `hello-writing.aseprite`                    | Separate 301-frame, two-layer black-ink writing process using the same path                                                                      |
| `writing.png`                               | Writing process in a 20-column sheet, 2560 × 1280 pixels                                                                                         |
| `writing.json`                              | Native metadata for the writing sheet                                                                                                            |
| `frames.json`                               | Runtime frame rectangles, actual durations, Pencil tips, rendered colors, and document SHA-256 hashes                                            |
| `motion.json`                               | 4097 equal-distance floating-point samples and a monotonic mapping to the unchanged writing PNG frames                                           |

The animation durations alternate 120 and 130 milliseconds, giving eight
frames per second and a one-second loop. This represents every duration exactly
in both Aseprite's millisecond timing and GIF's 10-millisecond timing. The
writing document uses 301 frames across ten seconds, including a blank first
frame and a complete last frame. Native frame durations of 33 and 34 milliseconds
sum to exactly 10,000 milliseconds. Its frame count describes the separate
stroke recording; the final looping document has eight frames. Each writing
frame records the actual integer-positioned brush center for source auditing.

The film does not move the Pencil between those quantized pixel coordinates.
It samples `motion.json` continuously with shared-tangent Hermite interpolation.
The 301 original writing frames are displayed in their original order at matching
arc-length milestones, retaining the same ten-second total. This is continuous
gesture retiming: the saved writing document's 33/34ms cel timings are preserved
but do not determine the film's writing timing. The eight-frame color animation
still uses its exact original 120/130ms durations.

`python3 scripts/showcase/ipad/generate-hello.py --motion-only` regenerates only
this motion metadata, without invoking Aseprite or rewriting any ASE, PNG or GIF.

Use `python3 scripts/showcase/ipad/generate-hello.py --writing-only` to regenerate
only the writing source, writing exports, and manifest. This preserves the
existing eight-frame animation documents and exports byte for byte.

Native Aseprite readback records seven RGBA values in the animation (six opaque
ink colors plus transparent pixels), and two in the writing process (black plus
transparency). Both documents retain the editable white Background layer with
visibility off by default. PNG/GIF exports therefore have transparent backgrounds;
checkerboards belong only to presentation and are never baked into the images.

To change the overall lettering, edit the path, palette, brush size, or timing
in `hello-path.json` and regenerate. To hand-edit individual animation cels,
open `hello.aseprite` in Xprite or Aseprite. Rerunning the generator replaces
the generated documents, so keep a copy of any manual cel edits.

No Aseprite implementation code or Apple lettering assets are copied into
these files. The local Aseprite Lua API implementation was consulted only to
confirm the native image, cel, frame, and export operations.

The tools directory uses `hello-sheet.png` as the converter's static output preview.
The native generator now regenerates it alongside every other Hello export. It
uses three columns, no padding, no trimming and the original frame order. There
are no visual-audit baseline, rule or threshold changes in this asset pipeline.
