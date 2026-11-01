# Computer editor captures

The feature pages use native editor screenshots captured from the running Xprite editor in an isolated `computer-demo.localhost` workspace. No normal user workspace was cleared or modified.

The native editor viewport is 1440 × 840 at DPR 1. The artwork sits at (393, 122), 768 × 480 at 300% zoom. Captures keep their original dimensions.

## Capture procedure

Use one authorized Ego Browser TaskSpace and the running editor on port 5173. Set device metrics at the beginning of each browser round because the browser host may reset overrides between rounds. Use the actual Preferences language control to prepare both `en` and `zh-CN` sets.

1. Capture the native Home view.
2. Use New File to create `hello`, 128 × 80, RGBA, white background. Capture the filled dialog as `create.png`.
3. Select black foreground. Set zoom to 300% for computer. Use the actual Center Sprite shortcut, Shift+Z, with focus outside an input. Capture `editor.png`.
4. Close that task-owned blank document. Open `apps/growth/public/showcase/ipad/hello/hello.aseprite` through the native file input. Select the Hello layer, black palette entry, and first frame. Restore the same zoom and center the sprite. Capture `animation.png`.
5. Click the real Play button and move the browser pointer away from the editor. Capture all eight playing frames with `captureDeviceFrames`.

Static captures and measured control rectangles are produced with:

```js
const { captureDeviceSurface } =
  await import("/absolute/repository/scripts/showcase/devices/capture-surface.mjs");
await captureDeviceSurface(page, {
  directory: "/absolute/repository/apps/growth/public/showcase/devices/computer/en",
  name: "editor",
  device: "computer",
});
```

The helper reads geometry through `@xprite/ui/utils`. The `canvasViewport` rectangle in its sidecar is the viewport, not the paper rectangle. Actual paper bounds are measured from the original native pixels and recorded separately in each `layout.json`. Button centers in that file come from the corresponding native Home/dialog/animation control rectangles.

`captureDeviceFrames(page, directory, artworkBounds, palette)` in `capture-frames.mjs` takes unmodified compositor PNGs while the real editor plays. It identifies the displayed source frame by comparing all 10,240 sprite pixel centers against the original Aseprite exports, using the same compositor palette mapping recorded by the earlier verified native capture. It does not infer a frame from racing DOM values, change canvas pixels, redraw timeline labels, or pause virtual time. Each frame retains its PNG color profile, geometry, SHA-256 and frame duration. `playback/captures.json` records the source document hash and the palette mapping.

These files are authored showcase assets, not visual-audit baselines. The pre-push screenshot rules and thresholds are unchanged.
