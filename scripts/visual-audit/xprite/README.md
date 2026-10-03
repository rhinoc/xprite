# Xprite visual baselines

These baselines record Xprite's current UI using the built-in `example.aseprite`
project. The former Aseprite UI screenshot comparison workflow has been retired.
Aseprite document/algorithm compatibility checks and widget geometry fixtures
remain separate.

Each scene is captured in wide (1440 × 900) and compact (390 × 844) layout:
24 screenshots per language, 48 in total for Chinese and English. Scene names and dimensions are defined in `scenes.mjs`.
The saved set has been confirmed and locked by the user. Each screenshot's
capture point is recorded in the manifest. Later UI changes are candidates to
compare with this set, rather than a reason to update baselines automatically.

| Scene name | State | Wide | Compact |
| --- | --- | --- | --- |
| `home` | Hover the example recent row, including pin/delete buttons | [PNG](../baselines/xprite/zh/home-wide.png) | [PNG](../baselines/xprite/zh/home-compact.png) |
| `editor` | Example, frame 1, 400% zoom, animation stopped | [PNG](../baselines/xprite/zh/editor-wide.png) | [PNG](../baselines/xprite/zh/editor-compact.png) |
| `preferences` | Preferences dialog, General section, default controls | [PNG](../baselines/xprite/zh/preferences-wide.png) | [PNG](../baselines/xprite/zh/preferences-compact.png) |
| `edit-menu` | Top Edit menu in wide layout; application menu's Edit submenu in compact layout | [PNG](../baselines/xprite/zh/edit-menu-wide.png) | [PNG](../baselines/xprite/zh/edit-menu-compact.png) |
| `new-sprite` | New Sprite dialog, initial draft, no sprite created | [PNG](../baselines/xprite/zh/new-sprite-wide.png) | [PNG](../baselines/xprite/zh/new-sprite-compact.png) |
| `save-as` | Save As dialog for the example, default destination, no save submitted | [PNG](../baselines/xprite/zh/save-as-wide.png) | [PNG](../baselines/xprite/zh/save-as-compact.png) |
| `export-file` | Export File dialog for the example, default GIF draft, no export submitted | [PNG](../baselines/xprite/zh/export-file-wide.png) | [PNG](../baselines/xprite/zh/export-file-compact.png) |
| `gif-options` | GIF Options opened from the export draft, no export confirmed | [PNG](../baselines/xprite/zh/gif-options-wide.png) | [PNG](../baselines/xprite/zh/gif-options-compact.png) |
| `recovery` | Recovery tab in fresh storage, no previous user sessions | [PNG](../baselines/xprite/zh/recovery-wide.png) | [PNG](../baselines/xprite/zh/recovery-compact.png) |
| `color-picker` | Foreground popup opened from the color button, white RGB color | [PNG](../baselines/xprite/zh/color-picker-wide.png) | [PNG](../baselines/xprite/zh/color-picker-compact.png) |
| `tooltip` | Hover the Pencil tool until its tooltip is visible | [PNG](../baselines/xprite/zh/tooltip-wide.png) | [PNG](../baselines/xprite/zh/tooltip-compact.png) |
| `layer-properties` | Layer Properties dialog for the example's Flattened layer | [PNG](../baselines/xprite/zh/layer-properties-wide.png) | [PNG](../baselines/xprite/zh/layer-properties-compact.png) |

Captures cover Chinese (`zh-CN`) and English (`en`), with the light theme and DPR 1.
Selectors are resolved from the corresponding UI catalog, and the actual page language is checked. Compact uses the
application's compact layout with mouse input; this suite does not emulate touch.
PNGs are raw, without resizing or masking. Each scene must produce two
consecutive identical captures. Editable fields are blurred before capture so
blinking carets do not enter the comparison. Dialogs are closed without editing
draft values. The recovery tab is closed before capturing editor overlays.
Dialog captures reject frames outside the viewport and client areas requiring horizontal scrolling. The default color picker must also show all channels without vertical scrolling.
The color popup keeps focus on its Restore Original Color button so its editable
field has no blinking caret.

## Capture and compare

Reuse the running development server on port 5173; no build or restart is needed.
With Ego Lite running:

```sh
pnpm run visual:capture
pnpm run visual:compare
```

The capture creates one Ego task space and closes it on success. For an existing
agent-owned space, pass `--space ID`; its caller remains responsible for closing
that space. `--port PORT` targets an existing server on another port.
The capture does not activate Ego Lite or bring its page to the foreground.
Capture waits for fonts and stable PNGs instead of animation frames, which can
be throttled in a background browser. The command reports total capture time.

Capture resets local storage and IndexedDB only on the dedicated
`xprite-visual-{wide,compact}-{zh-cn,en}.localhost` origins on that port,
with separate storage for each language and layout. User data on `localhost` and `127.0.0.1` is separate.
On those capture pages, Vite's HMR WebSocket is isolated while application
sockets and timers remain native. Each navigation still loads the current
source, and changing source files during capture rejects the result.

Candidates, diff PNGs, and each language's `comparison.json` are written to
`.tmp/xprite-visual/zh/` and `.tmp/xprite-visual/en/`. `comparison-all.json` at the root summarizes both languages.
Candidate capture and pixel comparison run in separate queues. Each stable PNG
and its provenance are saved immediately and sent to a comparison worker while
the browser captures the next scene. Reports update after each comparison;
completed candidates and results remain available if a later capture fails.
Partial reports cannot pass the push gate. The final comparison requires a
successful complete capture, every selected scene and the unchanged source check.
Baselines and capture manifests live in `scripts/visual-audit/baselines/xprite/zh/`
and `scripts/visual-audit/baselines/xprite/en/`.
Directory names use `zh` and `en`; UI locale IDs and `--languages` remain `zh-CN` and `en`.
PNGs and provenance should be committed together.

Comparison requires at least 99% of decoded RGBA pixels to match across the
whole screenshot. A changed pixel counts once regardless of channel differences;
the remaining 1% allows small rasterization differences. Region geometry must
still match exactly.
Identical images use a byte comparison and do not produce a diff PNG; images
with differing pixels produce a diff PNG for review.
Reports also score captured DOM regions, including dialogs, menus, tooltips,
and individual Home action buttons, and check that geometry is unchanged.
Dimension, fixture, browser/platform, frame, zoom, language, or theme mismatches
fail comparison. Each baseline scene retains its capture date, browser, Git
revision, and source digest; baseline extension preserves earlier source
snapshots. Source hashes are expected to differ when code changes.

Capture or compare only named scenes with `--scenes`:

```sh
pnpm run visual:capture --scenes preferences,edit-menu,tooltip
pnpm run visual:compare --scenes preferences,edit-menu,tooltip
```

Default comparison requires all 24 scenes in both languages (48 captures). Missing scenes and duplicate IDs
fail validation; a selected subset certifies only that subset.

Select languages with `--languages`:

```sh
pnpm run visual:capture --languages en
pnpm run visual:compare --languages en
pnpm run visual:capture --languages zh-CN,en --scenes editor
```

README images reference the `editor-wide.png` and `editor-compact.png` baseline
files directly: Chinese from `zh/`, English from `en/`. There is no
separate README capture or image-copy step. The table above links to Chinese PNGs;
English captures use the same filenames under `en/`.

## Extend or update baselines

Add newly defined scenes without replacing existing PNGs:

```sh
pnpm run visual:baseline --extend
```

Extension captures only missing scenes in each selected language, including a new
language with no manifest, validates the common capture contract,
and retains earlier hashes and capture metadata.
`visual:baseline --force --scenes name,name` replaces only the named scenes
and retains every other baseline PNG and its provenance. Add `--languages en`
to limit a reviewed update to English.

For an intentional change to existing scenes, review candidate screenshots and
diffs first, then replace the baselines explicitly:

```sh
pnpm run visual:baseline --force
```

Recapture and compare after updating to confirm reproducibility. Never update
baselines automatically to silence a regression. These scenes cover documented
default states; other preference sections, frames, dark themes, drag states,
and touch interactions need additional scenes.
