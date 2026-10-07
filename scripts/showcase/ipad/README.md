# Editable iPad showcase models

The `/showcase` page opens with all three devices in a stationary overview.
Clicking or tapping an actual device surface selects it; the camera then focuses
that device before its film clock advances. Empty-space clicks, scrolling, and
hovering never start a demo. Hovering raises the model by 0.18 scene units and
enlarges it by 8%, easing back when the pointer leaves. The overview uses physical
device width ratios (355.7 : 247.6 : 76.7 mm) with wider spacing; focused demos
retain their viewport framing. Reduced motion disables
this effect and shows completed artwork only after device selection. The iPad's
initial display is a lit lock screen with its padlock already open. The page has
no transport, chapter navigation, or download footer. Its language comes from
`/showcase/en/` or `/showcase/zh-CN/`; the neutral `/showcase` entry redirects to
English. The top-right globe link toggles languages and changes that path without restarting
the demo or music. Browser Back/Forward follows the language in the URL. Each
language has a generated HTML page with localized metadata, a self canonical,
reciprocal hreflang links, and a sitemap entry. Query parameters and browser or
stored language preferences do not select the showcase language.

All three devices have the same soft radial contact-shadow treatment. The
MacBook and iPhone shadows are sized and positioned from each model's local
bounds; their parent model supplies overview scaling, hover lift, tilt, and
carousel movement. The iPad keeps its authored shadow placement.

The supplied Tokyo lofi MP3 loops at 25% volume after the first trusted pointer
or keyboard interaction, independently of model loading and demo selection. The
bottom-right Pixelarticons speaker button toggles mute and saves the preference
under `xprite.showcase.music.muted`. Hidden pages pause the music; visible pages
resume previously started playback. Unmounting releases the audio element and
its interaction listeners. A media-loading failure disables the music button.

Physical dimensions follow Apple's technical specifications for the
[16-inch MacBook Pro](https://support.apple.com/en-gb/111838),
[11-inch iPad Pro](https://support.apple.com/en-kw/111974) in landscape orientation,
and [iPhone 15 Pro Max](https://support.apple.com/en-ie/111828).

After selecting a device, horizontal dragging, swiping, wheel scrolling, or the
keyboard's Left/Right arrow keys switch devices. Before selection, these gestures
leave the overview intact. Tab exposes device choices with a model hover preview;
Enter or Space selects the focused choice. There is no bottom
device picker or visible gesture hint. Screen-reader instructions and device
change announcements remain attached to the focusable model area.

Device selection starts at the hand's unlock entrance instead of waiting
through the opening hold. `managers/showcase/ipad-story.ts` maps elapsed playback
time onto the unchanged source-film clock: idle transitions last 80 ms, unlock
runs at 2×, app-launch and Play taps at 1.5×, creation at 1.6×, and the Pencil
arrives over 0.9 seconds. Drawing starts about 5 seconds after interaction instead
of 13 seconds. Writing runs at 2.5×, completing the ten-second source sequence in
four seconds; the native animation's frame durations stay unchanged. The manager
consumes elapsed time across segment boundaries so the fingertip, screen
transition and Pencil always share a clock.

All three devices show **Start editing** at `DEVICE_DEMO_TIME.play`, when the
finished animation begins playback. The button does not wait for the film's end
or for additional animation loops. The iPad screen shares this playback constant
with the computer and phone demonstrations.

All English page text, including the static Xprite wordmark, uses the existing
Aseprite bitmap font. Chinese text uses Fusion Pixel. The overview
heading sits slightly lower and its second line says **Choose your device**
(**选择你的设备** in Chinese), without a scramble effect. Selecting or switching
devices resolves random glyphs to the localized device name over 700 ms;
the surrounding words stay static and the heading has no entrance animation.
Each character reserves its final glyph's width during the transition, with
fullwidth scramble glyphs in Chinese positions to avoid trailing blank space.
Chinese heading text uses Fusion Pixel. The page takes its coral accent and warm
neutral colors from the editor's light theme. The tablet
has no authored pitch, yaw or roll; pointer tilt only applies within its projected
bounds and settles to zero when the pointer leaves. With reduced motion enabled, the heading
stays static and device selection shows the completed artwork without
playing the device motion.

The desktop background tiles the original 4 × 4 SVG at
`public/showcase/textures/macintosh-dither.svg`. Its two-pixel checker blocks use
the theme's warm gray over an ivory base, with crisp edges and a transparent
Three.js canvas so the same pattern continues behind all three devices.

Open `ipad-showcase.blend` in Blender to edit the tablet, Apple Pencil, materials, camera, and lights. The Pencil collection is hidden in the saved tablet view. `hand-tap.blend` contains the separate imported WebXR hand rig and editable pointing pose. `pencil-writing-rig.blend` contains the writing motion with editable tip, grip, wrist and barrel-roll controls; see [pencil-writing-rig.md](pencil-writing-rig.md).

To regenerate the models and `.blend` from their parameterized source, run from the repository root:

```sh
blender --background --python scripts/showcase/ipad/create-models.py
blender --background --python scripts/showcase/ipad/hand-pose.py
```

The generators export to `apps/growth/public/showcase/ipad/`. `create-models.py` only regenerates the iPad and Pencil; `hand-pose.py` only regenerates the hand. They replace their generated `.blend` and GLBs, so save manual art changes under a different name before regenerating.

## Coordinates shared with Three.js

The exports preserve **X right, Y up, Z toward the viewer**. The generator explicitly disables Blender's automatic Y-up conversion. Place all props in the same Three.js group if you tilt or rotate the iPad presentation.

| File               | Origin and dimensions                                                                                                                 | Named objects                                                                                         |
| ------------------ | ------------------------------------------------------------------------------------------------------------------------------------- | ----------------------------------------------------------------------------------------------------- |
| `ipad.glb`         | Body centered at the origin, 10 wide × 7.20 high × 0.20 deep, front toward +Z. Side buttons extend slightly beyond this nominal body. | `Screen`, `AluminumBody`, `BlackGlassBezel`, `FrontCameraLens`, individual buttons and speaker holes. |
| `apple-pencil.glb` | Tip at `(0, 0, 0)`. Barrel extends along +Y to 4.5. Radius 0.115.                                                                     | `PencilTip`, `PencilCollar`, `PencilBarrel`, `PencilCapSeam`.                                         |
| `hand.glb`         | Index finger pad contact at `(0, 0, 0)`. Hand and forearm extend along +Y, palm toward −Z, skin above the XY contact plane.           | Baked presentation mesh and `FingerContact`; the original armature remains in `hand-tap.blend`.       |

The USB-C opening and inner contact lie in the right side’s YZ plane, with their face normal along +X. Their long axes follow Y; their Z extents stay inside the body’s ±0.10 thickness. The generator and editable source use XYZ Euler `(π/2, 0, π/2)` for both parts.

`Screen` is a rounded front-facing plane, **9.38 × 6.55176**, radius **0.20**, at **Z = 0.121**. Its ratio matches the 2388 × 1668 display of the connected 11-inch iPad. The exported GLB has UV `(0, 0)` at the upper left and `(1, 1)` at the lower right, following glTF's texture convention. Replace its material with the animated canvas material and set **`CanvasTexture.flipY = false`**. Blender's native UV is vertically reversed by its glTF exporter, so the exported UV differs from Blender's UV editor. The mesh vertices are already in tablet coordinates, and its object transform is identity.

The original neutral softbox HDRI is `studio_small_08_1k.hdr`. Assign it as an equirectangular environment and generate PMREM lighting in Three.js. Source, author, URL, license, and publisher checksum are recorded in `apps/growth/public/showcase/ipad/ASSET-LICENSES.md`.

The original tablet and Pencil use the repository's GPL-2.0-only license. The derived WebXR hand retains its MIT notice in `hand-source-LICENSE.txt` and the public `hand-LICENSE.txt`. The environment image independently retains its CC0 license.

## Pointer tilt

`apps/growth/src/adapters/showcase/ipad-pointer-tilt.ts` controls mouse-follow motion: at most 5° pitch and 7° yaw, with a 160 ms damping time. A shared Three.js parent rotates the tablet, Pencil, hand and contact shadow together from a neutral front-facing pose. The scene supplies the tablet's projected bounds so surrounding white space does not tilt the device. Pointer motion works while the film is paused without advancing its frame. Leaving those bounds, scrolling or losing focus returns the pose to center. Touch and reduced-motion preferences disable pointer tilt; settled paused scenes skip GPU rendering.

## Lock screen and Home Screen presentation

The lock-screen wallpaper is a downloaded photograph. Select an entry through `ACTIVE_WALLPAPER` in `apps/growth/src/managers/ports/ipad-wallpapers.ts`; `positionY` controls the vertical crop. Three original photographs and their author/source/license records live under `apps/growth/public/showcase/ipad/wallpapers/`.

The owner's iPad was used only to study icon size, spacing and typography. Do not copy the personal Home Screen, installed applications, badges, Dock or wallpaper into this project. The demonstration Home Screen uses the same licensed photograph as the lock screen and a single Xprite entry. Its dimensions and position live in `ipad-screen-layout.ts` and `ipad-screen.ts`. Do not add a collection of invented system-app icons.

## Capture the real iPad editor

`capture-surface.mjs` saves the current page's `.xse-root` element screenshot and a sibling JSON file with viewport, editor canvas, and control geometry. It uses the shared `scripts/base/screenshot.mjs` helper to preserve the PNG bytes, verify native pixel dimensions against the measured CSS surface and device-pixel ratio, and record SHA-256 and the PNG's actual color-profile tags. It waits for fonts before measuring and rejects geometry changes during capture. It uses an existing local Safari WebDriver session and does not launch Safari, navigate, enter values, change styles or storage, or overwrite files. Session IDs, device identifiers, URL queries, and fragments are not written to the capture metadata.

On a Mac with a paired iPad and Safari remote automation available, start the native driver in a terminal:

```sh
safaridriver --port 4444
```

Create a dedicated iPad automation session and copy `value.sessionId` from the response. `pageLoadStrategy: "none"` avoids blocking capture on development-server connections:

```sh
curl --request POST http://127.0.0.1:4444/session \
  --header 'Content-Type: application/json' \
  --data '{"capabilities":{"alwaysMatch":{"browserName":"safari","platformName":"iOS","safari:deviceType":"iPad","safari:useSimulator":false,"pageLoadStrategy":"none"}}}'
```

Open the editor in this automation tab using an address the iPad can reach. A USB network bridge can work when a LAN address is unavailable. Replace `SESSION_ID` and `MAC_USB_ADDRESS` below with the current session and Mac interface address:

```sh
curl --request POST http://127.0.0.1:4444/session/SESSION_ID/url \
  --header 'Content-Type: application/json' \
  --data '{"url":"http://MAC_USB_ADDRESS:5173/"}'
```

Enter Safari's native fullscreen before preparing the shots, keeping browser chrome out of the display aspect ratio:

```sh
curl --request POST http://127.0.0.1:4444/session/SESSION_ID/window/fullscreen \
  --header 'Content-Type: application/json' --data '{}'
```

Use the editor's controls to prepare each scene, then capture the complete fullscreen page from the repository root:

```sh
node scripts/showcase/ipad/capture-surface.mjs \
  --session SESSION_ID \
  --selector html \
  --output /tmp/xprite-ipad-captures/home.png
```

Use a fresh output name for Home, the New Sprite dialog, the one-frame canvas, the eight-frame timeline, and active playback. For the hello sequence, create a `128 × 80` RGBA sprite named `hello` with **White** background, then choose black as the foreground color. Keep the Home tab, document tab, toolbar, timeline, and status bar visible. Capture active playback through the real Play control; its Stop icon and frame selection remain part of the screenshot.

The PNG keeps the element screenshot's original pixels; capture never crops, resizes, or converts its color samples. Dimensions must equal the measured surface dimensions multiplied by the measured device-pixel ratio, rounded to integer pixels. The sibling JSON's `capture` field records the viewport, requested clip, pixel dimensions, actual pixel scale, detected color tags, and byte hash. The film texture is 1389 × 970. Current Chromium captures match it at 1:1; native iPad fullscreen captures can instead be 2778 × 1940 and projected at half size. Each capture record identifies its actual source and dimensions. Safari's current display-scale rounding differs slightly from physical panel pixels. Do not use the shorter browser-window `.xse-root` captures: fitting those into the tablet reintroduces letterboxing. Control coordinates in `surfacePixels` use the measured device-pixel ratio. `canvases` describes the complete drawing viewport, not the sprite's inner artwork rectangle; measure the latter from the captured image before placing the animated drawing. Screen dimensions, artwork bounds and button targets live together in `apps/growth/src/managers/ports/ipad-screen-layout.ts`.

Review the PNGs and metadata before deliberately copying a complete set into `apps/growth/public/showcase/ipad/screenshots/`. Update its `captures.json` sizes and hashes, the measured artwork and control coordinates, and `CAPTURE_REVISION` in `ipad-screen.ts` together so browser image caches cannot mix capture sets. The capture tool never updates that directory automatically.

### Color-managed screen assets

The original twelve captures remain unchanged in `screenshots/`. The film loads
the presentation copies in `screenshots/display/`. Those copies add the verified
Chromium compositor ICC profile without changing RGB samples, alpha, dimensions,
or compressed image data. Browser image decoding then converts the image into
the screen canvas's sRGB color space. Do not compensate for capture color errors
with saturation, lighting exposure, or screen tone mapping.

The original DPR 1 captures contain display RGB values but no PNG color metadata.
`screenshots/color-reference/` records a fresh pair of unmodified native captures
of the same hello document: DPR 2 includes the compositor ICC, while DPR 1 omits
it. All 10,240 artwork pixel centers have identical encoded colors in both
captures and the original showcase image. `proof.json` records the source hashes,
sample bounds, seven color mappings and matching ICC hash. This establishes the
specific capture profile; it is not an assumption that these samples use Display
P3. The presentation copies' `color-check.json` records their decoded sRGB samples;
each channel is within one 8-bit level of the original ASE palette.

Reproduce these presentation copies with:

```sh
node scripts/showcase/ipad/normalize-screen-color.mjs \
  --profile-capture apps/growth/public/showcase/ipad/screenshots/color-reference/dpr2.png
```

The script checks the original capture hashes and the specific reference ICC
hash before producing files in `display/`. It must not be used to assign this
workstation's profile to new captures. Preserve new raw screenshots and their
actual color metadata, and investigate any missing metadata before displaying
them. These presentation copies and diagnostic captures are separate from the
repository's visual-audit candidates and baselines.

## Real pixel artwork and synchronized playback

Create and export the actual documents with `python3 scripts/showcase/ipad/generate-hello.py`; see [hello-assets.md](hello-assets.md) for the integer-pixel source and native Aseprite export workflow. The page footer links to the editable eight-frame `hello.aseprite` and its GIF export. A separate 301-frame `hello-writing.aseprite` records the ten-second drawing process.

The movie displays exported PNG frames; it does not draw vector strokes into a canvas. The Pencil follows a continuous floating-point curve from `motion.json`, and the unchanged writing PNGs are retimed to the corresponding arc-length positions over ten seconds. The saved writing ASE's original cel durations are retained as source data. During animation playback, the whole editor image comes from one of eight real captures of `hello.aseprite`: artwork, layer cels, selected frame and current-frame field advance as a unit, using the document's exact 120/130ms durations. Re-capture all eight UI states after editing that animation. [capture-playback.md](capture-playback.md) documents the reproducible browser workflow and frame-content checks. The total frame count stays eight throughout playback.

## Stable display rendering

The camera near plane follows 5% of the current viewing distance, including the wide three-device overview, so depth precision can distinguish the tablet display at Z 0.121 from the glass at Z 0.1175. The far plane expands when needed for tall overview viewports. Hover and the camera trajectory remain unchanged.

The wallpaper/system-screen canvas uses trilinear mipmap minification to avoid photo-detail shimmer during tilt. Once the application finishes opening, the texture switches back to base-level linear filtering for the native pixel editor. The photography and editor captures are unchanged.
