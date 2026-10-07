# File workflow articles

The `/learn/` collection reuses the static article renderer and CSS Module in the growth app. Public Markdown is allowlisted in `content/articles/index.ts`; research notes, source card HTML, and unlisted drafts are not published. Each new entry needs a canonical route, EdgeOne redirect/rewrite, sitemap entry, and a real social image. The deployment scripts require every registered article and image.

The first two articles describe current viewer operations: local Aseprite input, PNG current-frame export, and GIF range export. Titles put the core query first and name the free output. They do not claim full Aseprite compatibility, universal performance, lossless GIF color, a sprite-sheet output from the viewer, or private sharing from an indexed article URL.

Facts were reviewed on 2026-10-05 against the viewer manager and adapters, core export/codec code, the English and Chinese user guides, and the linked Aseprite documentation. Synthetic browser checks covered 56.25 MiB raw input, a 65 MiB rejection, over-budget decoded pixels, linked-frame GIF limits, invalid files, and frame-step updates. These are local development observations, not production or mobile benchmarks. Research evidence is retained in `artifacts/seo-2026-10-05/`.

The original social-card HTML is in `social/`. It uses the existing shared brand icon and original CSS/text. Render it at 1200 × 630 CSS pixels in a browser and save PNG to `public/social/`; do not publish the template as an indexed page. These cards are not editor screenshots or visual-audit baselines.

The user guide's Save and recover sections were updated in both languages for the existing resource limits and actionable export failure. No control moved, so existing control-location screenshots remain applicable.

No builds, unit tests, git hooks, push, or deployment were run for this change. Read-only source review and the requested browser/HTTP edge-case observations were used. Release still requires the repository's visual review and hook workflow.
