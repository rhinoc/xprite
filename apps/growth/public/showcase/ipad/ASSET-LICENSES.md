# iPad showcase assets

These assets are maintained in `apps/growth/public/showcase/ipad/` and served by the growth application.

`studio_small_08_1k.hdr` is **Studio Small 08** by **Sergej Majboroda**, provided by **Poly Haven** under **CC0 1.0 Universal**.

- Asset: https://polyhaven.com/a/studio_small_08
- License confirmation: https://polyhaven.com/license
- License legal text: https://creativecommons.org/publicdomain/zero/1.0/legalcode
- Original download: https://dl.polyhaven.org/file/ph-assets/HDRIs/hdr/1k/studio_small_08_1k.hdr
- Downloaded: 2026-10-04
- Resolution: 1024 × 512, Radiance HDR
- Original file size: 1,508,872 bytes
- Original MD5 from the publisher: `de3ba64222895aca876b1d1c2e0cf81a`
- Modifications: none

Poly Haven permits commercial use and redistribution of its CC0 assets. Attribution is appreciated but is not required by CC0. This record is retained so the source can be independently verified.

`ipad.glb` and `apple-pencil.glb` are original procedural models created for this repository. Their editable Blender source and generator are in `scripts/showcase/ipad/` and carry the repository's GPL-2.0-only license. They use no downloaded model, Apple logo, or third-party texture. iPad and Apple Pencil are Apple product names; this showcase is not an Apple-endorsed work.

## Photographic lock-screen wallpapers

These downloaded photographs retain the [Unsplash License](https://unsplash.com/license), verified on 2026-10-04. It permits downloading, modification and distribution, including commercial use. It excludes selling unmodified images or compiling a competing photo service. Original photo and download URLs, dimensions and authors are recorded in `wallpapers/sources.json`.

- `mountain-lake-wolfgang-hasselmann.jpg`: [Mountain landscape with a calm lake at dawn](https://unsplash.com/photos/mountain-landscape-with-a-calm-lake-at-dawn-JCqW61z2Sz0), Wolfgang Hasselmann.
- `ocean-john-lockwood.jpg`: [Wavy ocean in aerial photography](https://unsplash.com/photos/wavy-ocean-in-aerial-photography-LUiw-54S7Ek), John Lockwood.
- `sunrise-clouds-balazs-busznyak.jpg`: [A Sunrise Undercast](https://unsplash.com/photos/landscape-photography-of-white-clouds-over-mountain-sEgyKdPI-fU), Balazs Busznyak.

## Home Screen presentation

The owner's iPad Home Screen was viewed only as a layout reference. No pixels, personal applications, badges, Dock, or wallpaper from that screen are included in the page assets. The demonstration uses a licensed photograph, the project's own Xprite icon, and a minimal original status display. No Apple default wallpaper is bundled.

## Rigged hand

`hand.glb` is derived from the **generic right hand** in **WebXR Input Profiles**, maintained by the Immersive Web community. The source asset is distributed under the **MIT License**, copyright (c) 2019 Amazon. The full required notice is retained in `hand-LICENSE.txt` alongside the public model and in `scripts/showcase/ipad/hand-source-LICENSE.txt` beside the editable source.

- Source: https://github.com/immersive-web/webxr-input-profiles/tree/main/packages/assets/profiles/generic-hand
- Official asset license statement: https://github.com/immersive-web/webxr-input-profiles/blob/main/packages/assets/README.md
- License: https://github.com/immersive-web/webxr-input-profiles/blob/main/packages/assets/LICENSE.md
- Original download: https://raw.githubusercontent.com/immersive-web/webxr-input-profiles/main/packages/assets/profiles/generic-hand/right.glb
- Upstream Git blob: `215f50d70fb7a5a884025b508cf5c58230913371`
- Original SHA-256: `291790c14f7f88a7f9bd35330c47392ed8e8d395ae6728f4bb7089f1bc1f2b96`
- Original size: 94,004 bytes
- Downloaded: 2026-10-04
- Modifications: anatomically rigged finger curl for an index-finger tap, smooth subdivision, a continuous extended forearm, skin material, and alignment of the index pad to the screen-contact origin.
- Editable source: `scripts/showcase/ipad/hand-tap.blend`; repeatable import and posing: `hand-pose.py`; unmodified download: `hand-source.glb`.

MIT permits use, modification, commercial use and redistribution when its copyright and permission notice remain with copies or substantial portions. The derived hand retains that notice independently of the repository's own code license.

## Hello sprite projects

The lettering in `hello/` is original repository artwork generated from `scripts/showcase/ipad/hello-path.json`. Native Aseprite writes each integer pixel into the layered `.aseprite` documents and exports the PNG sheets and GIF. These artwork files use the repository's GPL-2.0-only license; no Apple lettering artwork or Aseprite implementation code is included. `hello/frames.json` records the actual frame durations, color counts, recorded brush positions and source SHA-256 hashes.

The playback screenshots depict this same file in Xprite. Each screenshot contains the real editor artwork and timeline state for its documented frame, rather than a hand-drawn selection highlight.

The English editor captures in `screenshots/en/` use the same original hello
document with Xprite's English UI selected through Preferences. Their native
capture receipts and color-profile source are retained alongside the images.
The page’s current controls use the Macintosh fonts credited below. The editor
captures retain the original Aseprite font, credited in `ATTRIBUTION.md` and
`LICENSES/aseprite-font.txt`.

## Additional showcase devices

- **MacBook Pro M3 16-inch 2024** by [jackbaeten](https://sketchfab.com/jackbaeten), licensed under [CC BY 4.0](https://creativecommons.org/licenses/by/4.0/). [Original model](https://sketchfab.com/3d-models/macbook-pro-m3-16-inch-2024-8e34fc2b303144f78490007d91ff57c4). The downloaded GLB was publicly redistributed by [Origami](https://origami.ltd/en/acknowledgments) with the original author and license metadata.
- **iPhone 15 Pro Max** by [MajdyModels (formerly MpPower™)](https://sketchfab.com/MG990), licensed under [CC BY 4.0](https://creativecommons.org/licenses/by/4.0/). [Original model](https://sketchfab.com/3d-models/iphone-15-pro-max-5b7b35513a154ac69619dc2b2fe15686). The downloaded GLB was publicly redistributed by [Pane](https://github.com/ibuhs/Pane), whose credits separately identify the model's CC BY 4.0 license.

Xprite modifications: normalized size and orientation, adjusted laptop viewing pitch, remapped screen UVs, separated the phone display face from its shared body mesh and added clearance below its camera cutout, replaced display materials with Xprite imagery, and re-exported GLB with WebP textures. Device geometry and body materials retain the original authors' work. The complete license is in [device-CC-BY-4.0.txt](device-CC-BY-4.0.txt). The original downloads, provenance records, repeatable preparation script, and editable Blender files are preserved in `scripts/showcase/devices/`.

MacBook Pro and iPhone are Apple product names. Neither Apple nor the model authors endorse this showcase.

## Background music and speaker icons

The background track is the user-provided `zephiramusic-tokyo-lofi-604786.mp3`,
bundled without modification as `../audio/tokyo-lofi.mp3`. Its original filename
and SHA-256 are recorded in [audio provenance](../audio/sources.json).

The speaker, muted-speaker, and language-globe SVGs are from
[Pixelarticons](https://github.com/halfmage/pixelarticons), copyright Gerrit
Halfmann, under the MIT license. The original SVGs and their pinned source commit
are recorded in [icon provenance](../icons/sources.json); the complete
[MIT notice](../icons/pixelarticons-MIT.txt) is bundled alongside them.

## Showcase typography

The wordmark, headings, prose and controls use **ChiKareGo2**, with
**FindersKeepers** for compact captions. Both are by Giles Booth and are the
fonts named by the Classic Macintosh UI Kit. Original font sources, attribution
terms and browser-metric adjustments are recorded in
`packages/ui/assets/fonts/macintosh/README.md`; their originals stay in that
shared UI directory. Public pages serve the same WOFF2 files through `/theme/`.
Chinese text uses **Fusion Pixel** as a fallback, with its SIL Open Font License
1.1 notice in `LICENSES/fusion-pixel-font/OFL.txt`. Latin display sizes use the
Macintosh fonts’ 16px grid; Chinese headings retain the 10px CJK grid.

The former **Doto** wordmark font is retained with its asset provenance as a Google Fonts
Latin WOFF2 subset with the `wght` (100–900) and `ROND` (0–100) variable axes.
It is licensed under the **SIL Open Font License 1.1**. The download URL, hash,
and copyright/license source are recorded in [font provenance](../fonts/sources.json).
The complete notice is bundled alongside the font: [Doto license](../fonts/doto-OFL.txt).

## Device demonstrations and cursors

Computer and phone editor surfaces are unmodified native Chromium captures of Xprite at 1440 × 840 and 430 × 846 CSS pixels respectively, in English and Simplified Chinese. Their capture receipts, original PNG profiles, and measured control/artwork coordinates are preserved under `../devices/`. The eight playback frames are identified from the native sprite pixels and retain the actual editor timeline. These are authored demonstrations, not embedded live editor sessions or device recordings. Browser/system chrome is original canvas drawing; the hello writing frames remain the original native Aseprite exports described above.

Mouse pointers reuse the repository's `@xprite/ui/cursor` artwork and hotspots: Aseprite cursor artwork, copyright © 2009–2017 David Capello and Ilija Melentijevic, [Aseprite](https://www.aseprite.org/), [CC BY 4.0](https://creativecommons.org/licenses/by/4.0/). The original vectors are rendered at a larger pixel scale; no replacement pointer artwork was introduced. The phone reuses the MIT-licensed WebXR hand credited above.

## macOS menu-bar symbol

The small Apple silhouette in the authored macOS menu bar uses [Simple Icons’ Apple path](https://github.com/simple-icons/simple-icons/blob/develop/icons/apple.svg), distributed under CC0 1.0. The complete notice is retained in [simple-icons-CC0.txt](../devices/chrome/simple-icons-CC0.txt). Safari toolbar layout was referenced from a native Safari window on the user’s Mac. Apple and Safari identify the depicted platform and browser; no endorsement is implied.

## iPhone shell illustrations

The authored Home Screen and status-bar layout reference Apple’s [iOS 26 Home Screen examples](https://www.apple.com/newsroom/2025/06/apple-elevates-the-iphone-experience-with-ios-26/) and [iPhone status-icon guide](https://support.apple.com/guide/iphone/learn-the-meaning-of-iphone-status-icons-iphef7bb57dc/ios). Widget, app-symbol, Dock and status drawings in `iphone-chrome.ts` are original vector illustrations under the repository license, combined with the licensed wallpaper credited above. Apple’s reference screenshots and wallpaper pixels are not bundled.
