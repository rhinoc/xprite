# SSG and interactive first paint

The pre-push hook runs `pnpm run visual:startup` after the existing editor visual
gate. It captures the current tool pages from the running tools server on port 5176. Set `XPRITE_TOOLS_VISUAL_PORT` for an existing server on another port.
The audit never builds or starts a server.

The tool directory, Aseprite viewer, GIF converter and Animal Crossing QR tool each have wide (1440 × 900)
and compact (390 × 844) captures. Each layout covers saved Light and Dark choices
against the opposite system preference, plus System with both light and dark
system preferences: 32 required pairs, 64 screenshots, English UI and DPR 1.
No scene-selection or threshold overrides are accepted by the gate.
`--space ID` reuses an existing agent-owned Ego space when recovering a failed
capture; success closes that space. Every recovery still captures all 32 pairs.

For each pair, external runtime JavaScript modules are blocked before navigation.
The generated HTML, critical CSS, fonts, images and real inline appearance script
remain available. The audit checks that the static shell is visible. It then
unblocks modules and navigates to the same URL, requiring hydration to finish
before taking the second screenshot. React recovery errors fail capture. These
are compositor captures of the live page; they are not screenshots reconstructed
from an HTML string or crops of a selected area.

Each phase waits for fonts and successfully loaded images and requires two
consecutive identical PNGs with stable region geometry. Dedicated
`xprite-tools-startup-*.localhost` origins isolate capture storage from user data.
Both phases use the same viewport, saved preference and system preference.
Source hashes must remain unchanged across the entire capture.

`scripts/base/screenshot.mjs` supplies native PNG capture, actual DPR and dimension
checks, byte hashes and PNG color-space checks. Screenshots are not resized,
masked or normalized. Every decoded RGBA pixel in the complete viewport must match exactly, including
transparent and antialiased pixels: **100% similarity, zero changed pixels**.
Pixelmatch at threshold 0 only supplies the diagnostic background; exact RGBA
comparisons mark every changed pixel red. Color-space metadata and region
geometry must also match.
Geometry is measured through CDP for the header, main content, headline and
directory cards or example row.

Raw `*-ssg.png`, `*-ready.png`, per-pair provenance, `*-diff.png` and
`comparison.json` are saved in `.tmp/tools-startup-visual/`. A new run immediately
marks the report incomplete; old files cannot certify a later run. Partial or
failed captures, changed sources, invalid evidence, geometry changes and scores
below 100% all return a nonzero status and block the push. Review failing images
and diffs with the user before pushing or publishing. The audit never updates
editor baselines or changes the existing editor comparison contract.

The audit refreshes the shared `.tmp/visual-report/index.html` on success or
failure. Run `pnpm run visual:report` to regenerate this portable HTML file from
existing captures. It shows SSG, interactive first paint and red pixel diffs
with similarity and geometry results; partial or older captures remain visibly
unqualified for the current run.
