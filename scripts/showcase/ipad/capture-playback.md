# Native Xprite screen captures

The film uses the real editor at a 1389 × 970 CSS-pixel viewport. The current
captures come from Chromium on macOS; they are not screenshots of a physical
iPad. All editor controls, tabs, timeline cells and artwork in the playback
images are rendered by Xprite itself.

The original Chinese presentation set is in `screenshots/display/`. English
source captures and receipts are in `screenshots/en/`; its presentation copies
are in `screenshots/en/display/`. Select English through Preferences before
preparing the same native Home, New Sprite, blank editor and animation states.
Keep the viewport, document, zoom and artwork bounds identical for both languages.

Use an existing ego-browser TaskSpace and the running editor development server.
The `showcase.localhost` host reaches the same local server while keeping the
capture workspace separate from the normal `localhost` workspace. Do not clear
the user's browser storage. The current capture workspace uses Simplified Chinese,
100% UI Element Scaling, the shortcut toolbar, black foreground and 300% canvas
zoom. These settings are selected through the real Preferences and editor controls.

Capture `home.png`, fill the actual New Sprite dialog with `hello`, 128 × 80,
RGBA and white background, capture `create.png`, then confirm and capture
`editor.png`. These files are complete viewport screenshots at CSS resolution.
The measured paper rectangle is `{ x: 382, y: 172, width: 768, height: 480 }`.

Close the demonstration blank document and open
`apps/growth/public/showcase/ipad/hello/hello.aseprite` using the editor's real file
input. Select the Hello layer, the black palette entry and the first frame.
Save the complete stopped view as `animation.png`. Press the real Play button
and move the cursor outside the canvas and controls before capturing playback.

From an ego-browser Node.js round with `page` pointing to that editor:

```js
await page.cdp("Emulation.setDeviceMetricsOverride", {
  width: 1389,
  height: 970,
  deviceScaleFactor: 1,
  mobile: false,
});
const { capturePlayback } =
  await import("/absolute/repository/scripts/showcase/ipad/capture-playback.mjs");
await capturePlayback(page, {
  outputDirectory: "/absolute/repository/apps/growth/public/showcase/ipad/screenshots/playback",
  artworkDirectory: "/absolute/repository/apps/growth/public/showcase/ipad/hello",
  artworkBounds: { x: 382, y: 172, width: 768, height: 480 },
  resume: true,
});
```

The helper observes live playback. It keeps a screenshot only when the current
frame is unchanged before and after capture, exactly that native timeline header
is pressed, and the actual Stop control is present. It compares all 10,240 sprite
pixel centers to the corresponding native Aseprite export. macOS display color
management is recorded as an exact one-to-one palette mapping; it does not alter
the screenshot. No DOM styling, editor internals, canvas pixels, frame labels or
timeline artwork are changed by the capture helper.

Each accepted playback frame also has an individual JSON receipt. `resume: true`
reuses receipts only when their document hash, source URL, viewport, PNG hash and
all artwork pixel centers match the current capture session. This allows slow
compositor captures to collect all eight frames over several passes without
changing the animation durations.

The English capture's third frame was collected with Chromium virtual time
paused immediately after the real Play action, then resumed after the native
screenshot. Its receipt records that timing condition; the native artwork,
Stop control and selected timeline frame remained the actual editor state.

For English presentation copies, the native DPR 2 profile reference and its
10,240 matching artwork samples are retained in `screenshots/en/color-reference/`.
Generate the tagged copies without altering the raw screenshots:

```sh
node scripts/showcase/ipad/normalize-screen-color.mjs \
  --profile-capture apps/growth/public/showcase/ipad/screenshots/en/color-reference/dpr2.png \
  --screenshots-dir apps/growth/public/showcase/ipad/screenshots/en
```

Keep `playback/captures.json` with the captured images. Update the parent
`screenshots/captures.json` and the measured geometry in
`apps/growth/src/managers/ports/ipad-screen-layout.ts` if the viewport or layout
changes. These assets are presentation source material, not visual-audit
baselines; the repository's pre-push comparison rules remain unchanged.

The initial DPR 1 capture set has display RGB samples without an embedded color
profile. The current film uses separate ICC-tagged presentation copies from
`screenshots/display/`; it does not change the raw captures above. A native DPR 2
capture from the same compositor establishes the ICC profile, with an exact
seven-color mapping match over all 10,240 artwork pixel centers. See
[Color-managed screen assets](README.md#color-managed-screen-assets) for the raw
diagnostic pair, reproducible presentation generation and browser decode check.
