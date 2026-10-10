# Startup continuity

The pre-push hook runs `pnpm run visual:continuity --port 5173` against the running
site and its app proxies. `XPRITE_VISUAL_PORT` selects an existing site server.
The audit does not build apps, start servers, or change screenshot baselines.

All 41 scenes are required. Eight templates cover both viewports and saved Light
and Dark: editor, Chinese showcase, Chinese help, Learn directory, Chinese article,
planned page, and both Gallery skins. Editor, Chinese showcase and Macintosh Gallery
also cover both system appearances at the wide viewport. English showcase, help
and article have an additional wide Light sample. Tool continuity is observed
within the existing 32 exact SSG/ready pairs, using the same captures.
Each scene uses a fresh, isolated localhost origin, disabled network cache, DPR 1,
and fourfold CPU slowdown. Existing user storage is never cleared or modified.

Each scene first blocks external runtime modules and requires visible initial
content. It saves a native full-viewport PNG, then starts a fresh navigation with
runtime modules enabled. A probe installed before parsing observes DOM mutations
and animation frames until the page is ready, then for at least 500 ms and ten
frames with loaded fonts and required images. Eager images must load; lazy images
must load only when they intersect the viewport and their scroll/clip ancestors.
Offscreen lazy images do not delay the first-paint capture. Required images are
decoded before the static screenshot. It checks the page, navigation, document, and contents
regions applicable to that route. Content removal, hidden/transparent regions,
missing initial content, runtime errors, failed public/tool hydration, timeouts, failed
screenshots, and incomplete observation block push. Source hashes must remain
unchanged during capture.

The probe reads sizes and computed styles through the existing UI geometry
boundary, transpiled for injection without importing the application's runtime.
It detects content disappearance and visibility loss, not arbitrary changes to
painted colors. The existing editor and exact RGBA tool screenshot gates remain
required and unchanged.

Evidence is written to `.tmp/startup-continuity/`: static and ready PNGs, each
scene's event trace with timestamps and failures, and `report.json`. A timeout
also saves the page's current screenshot; it may show recovered content, so use
the trace to locate an earlier disappearance. Every run invalidates its report
before capture. Missing or partial evidence cannot reuse a previous pass.
