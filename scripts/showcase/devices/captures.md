# Device-specific demonstration captures

The showcase uses native editor screenshots and native Aseprite writing/playback frames, not a video recording or a live embedded editor. The two new device surfaces were captured from the running Xprite editor in isolated `computer-demo.localhost` and `phone-demo.localhost` workspaces. No normal user workspace was cleared or modified.

| Device      | Display texture | Native editor viewport | Editor origin                         | Native artwork rectangle           |
| ----------- | --------------- | ---------------------- | ------------------------------------- | ---------------------------------- |
| MacBook Pro | 1440 × 932      | 1440 × 840             | (0, 92) below authored browser chrome | (393, 122), 768 × 480 at 300% zoom |
| iPhone      | 430 × 934       | 430 × 846              | (0, 64) below the system status area  | (86, 204), 256 × 160 at 100% zoom  |

The display textures match the measured model screen ratios to the nearest pixel. App captures are drawn at their original dimensions. They are never stretched from a tablet capture, cropped into a phone viewport, or centered with letterbox bars. The remaining phone pixels belong to its authored status/home-indicator areas. The iPad retains its existing matching 1389 × 970 presentation and Pencil/hand sequence.

## Capture procedure

Use one authorized Ego Browser TaskSpace and the running editor on port 5173. Set device metrics and touch emulation at the beginning of each browser round because the browser host may reset overrides between rounds. Use the actual Preferences language control to prepare both `en` and `zh-CN` sets.

1. Capture the native Home view.
2. Use New File to create `hello`, 128 × 80, RGBA, white background. Capture the filled dialog as `create.png`.
3. Select black foreground. Set zoom to 300% for computer or 100% for phone. On phone, select the Timeline panel. Use the actual Center Sprite shortcut, Shift+Z, with focus outside an input. Capture `editor.png`.
4. Close that task-owned blank document. Open `apps/growth/public/showcase/ipad/hello/hello.aseprite` through the native file input. Select the Hello layer, black palette entry, and first frame. Restore the same zoom and center the sprite. Capture `animation.png`.
5. Click the real Play button and move the browser pointer away from the editor. Capture all eight playing frames with `captureDeviceFrames`.

Static captures and measured control rectangles are produced with:

```js
const { captureDeviceSurface } =
  await import("/absolute/repository/scripts/showcase/devices/capture-surface.mjs");
await captureDeviceSurface(page, {
  directory: "/absolute/repository/apps/growth/public/showcase/devices/phone/en",
  name: "editor",
  device: "phone",
});
```

The helper reads geometry through `@xprite/ui/utils`. The `canvasViewport` rectangle in its sidecar is the viewport, not the paper rectangle. Actual paper bounds are measured from the original native pixels and recorded separately in each `layout.json`. Button centers in that file come from the corresponding native Home/dialog/animation control rectangles.

`captureDeviceFrames(page, directory, artworkBounds, palette)` in `capture-frames.mjs` takes unmodified compositor PNGs while the real editor plays. It identifies the displayed source frame by comparing all 10,240 sprite pixel centers against the original Aseprite exports, using the same compositor palette mapping recorded by the earlier verified native capture. It does not infer a frame from racing DOM values, change canvas pixels, redraw timeline labels, or pause virtual time. Each frame retains its PNG color profile, geometry, SHA-256 and frame duration. `playback/captures.json` records the source document hash and the palette mapping.

`catalog.json` is the capture inventory. These files are authored showcase assets, not visual-audit baselines. The pre-push screenshot rules and thresholds are unchanged.

## Runtime composition

`device-demo-screen.ts` draws browser/system chrome around these captures. `mac-browser-chrome.ts` follows a native Safari window inspected on the user’s Mac: a 36 px macOS menu bar accommodates the hardware notch, followed by a single 56 px Safari toolbar. Window buttons, navigation, address field and trailing tools share the same 64 px center line. These two bands still total 92 px, so the native editor captures and their measured button positions retain their original size. The typing cursor targets the new address-field center. The MacBook types `xprite.cc`, then the repository's `@xprite/ui/cursor` normal and crosshair vectors mark real capture-button positions and follow the shared writing path. The phone's existing MIT-licensed WebXR hand taps Xprite, New File, confirmation and Play, and traces that same raster-writing path in the portrait paper rectangle.

`phone-demo-hand.ts` maps normalized display points onto the actual phone Screen mesh before placing the fingertip. Language changes update the captures, button coordinates and all screen text together. The scene waits for all display assets before presenting the three-device entrance; each selected demonstration starts only after its focus/snap completes. Reduced motion shows the finished frame instead.

## iPhone shell reference

The phone shell was revised against Apple’s [iOS 26 Home Screen examples](https://www.apple.com/newsroom/2025/06/apple-elevates-the-iphone-experience-with-ios-26/) and [status-icon guide](https://support.apple.com/guide/iphone/learn-the-meaning-of-iphone-status-icons-iphef7bb57dc/ios). `iphone-chrome.ts` owns the status baseline, cellular/Wi-Fi/battery drawing, continuous icon corners, two-column widget layout, four-column app grid, Search capsule and translucent Dock. The authored Home Screen uses the existing licensed photograph and original vector illustrations. Apple reference screenshots are not runtime assets.

`IPHONE_HOME_ICON` is shared by the visible Xprite icon, the launch-window origin and the finger contact point. The app reveal grows its clipping window while scaling the screenshot uniformly, so portrait controls no longer squash into the icon’s square. The home indicator is drawn only after the app opens. Native editor captures and their coordinate mapping remain unchanged.

## Phone hand framing

The phone uses the anatomical hand at source scale 1, inheriting only the same presentation scale as the device. Do not halve the hand independently: this thins the wrist and can pull the finite forearm endpoint into the shot. Entry and exit translate the complete hand below the viewport with only a shallow depth lift, preserving hand/wrist proportions. The confirmation tap retreats before its visibility interval ends, just like the launch and Play taps.

The iPhone wallpaper is sampled directly at an aspect-preserving cover size. Its launch transition uses scale and opacity without applying background blur.
