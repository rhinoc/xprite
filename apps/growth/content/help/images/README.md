# User guide screenshots

These images show small regions of the current Xprite interface. The guide uses
standard relative Markdown image paths, so the same files work in the app and
in the repository documentation.

- `shared/` contains controls with no visible localized text.
- `zh/` and `en/` contain screenshots of the corresponding language interface.
- `catalog.json` records the actual pixel `width`/`height` and the measured CSS
  `displayWidth`/`displayHeight`. Both readers use the display dimensions without
  enlarging or squeezing screenshots. Wide images scroll inside their own region.
- `captures.json` records the source page, viewport, crop and target selectors.
  It is a maintenance record and is not part of the displayed guide.

Use `captureBrowserScreenshot` from `scripts/base/screenshot.mjs` for browser
captures. It retains native PNG pixels, validates DPR and crop dimensions, and
writes a JSON sidecar with pixel scale and PNG color metadata. CSS crop coordinates
are viewport-relative; the helper aligns them to physical pixel boundaries.
The existing images have recorded 1x output sizes but no original device-DPR
record; do not infer or fabricate that missing historical value.

Capture only the button, menu or settings described in the accompanying text,
with a small amount of context. Keep the raw PNG, then use `encodeLosslessWebp`
from `scripts/base/webp-assets.mjs` to preserve both pixels and metadata. Do not
resize, strip the ICC profile, or add screenshot styles to the real
interface. For example, the File menu image includes the File trigger and Save
As row; the Show image contains the Show submenu, whose route is explained in
the guide. Do not include the whole application or unrelated project artwork.

When refreshing a screenshot, use its recorded selectors and crop as a starting
point, then check the current interface before capturing. Update both language
versions, the dimension catalog, the capture record and the guide text when the
controls or their locations change. Restore temporary language and layout
choices after capture. No build or test run is needed to produce screenshots
against the existing development server.
