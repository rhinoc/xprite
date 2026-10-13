# Growth and tools regression gate

`pre-push` uses a compact, checked-in matrix of 33 scenes. Each non-About,
non-tool canonical content route is represented once with one selected locale,
viewport and appearance. The About page is represented at both wide and compact
sizes in one locale. All four tools include empty and example-loaded states, each in one
selected locale, viewport and appearance. The Features directory and shared footer have sampled
states, and two representative feature windows cover both locales, including an
illustration scroll state. Languages, sizes and appearances are distributed
across the remaining pages. The registry requires every listed scene; per-run
scene selection, masks, image scaling and threshold overrides are unsupported.

`pnpm run visual:site:capture` writes native PNG candidates, source hashes, browser
provenance, region geometry and a searchable `review.html` to `.tmp/site-visual/`.
The collector requires stable consecutive captures, decoded visible images, no
runtime/hydration errors, correct routes and locales, and unchanged sources.
Feature-window captures also prove Escape closes the window without navigating.
Captures run in Playwright's headless Chromium (see `../base/browser.mjs`); a
failed run recaptures every scene. The command never writes a baseline.

`pnpm run visual:site:compare` requires a complete baseline at
`scripts/visual-audit/baselines/site/`, a complete current candidate, matching
browser/platform contracts and native PNG hashes/dimensions. It compares every
RGBA pixel of the entire viewport at 99% minimum similarity and requires exact
region geometry. Missing, stale or partial evidence blocks the push.

Before initializing or changing a baseline, show the review artifact and obtain
explicit human approval. Promote only that reviewed complete candidate, including
its manifest and original PNG files with `pnpm run visual:site:baseline`, which
copies the current complete candidate. Baseline files must never be generated or
updated automatically by a capture, comparison or hook.

About uses its real static first paint for the historical pixel baseline; the
startup-continuity audit also observes it at both viewport sizes. Reduced-motion
is recorded in every capture contract so GIF illustrations use real supported
poster images. Other public pages and sampled tool/window states capture their
actual interactive ready views. The separate SSG/ready audit remains at 100%
pixel equality and unchanged geometry for every registered pair.
