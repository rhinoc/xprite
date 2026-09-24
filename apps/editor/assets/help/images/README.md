# User guide screenshots

These images show small regions of the current Xprite interface. The guide uses
standard relative Markdown image paths, so the same files work in the app and
in the repository documentation.

- `shared/` contains controls with no visible localized text.
- `zh/` and `en/` contain screenshots of the corresponding language interface.
- `catalog.json` records each PNG's actual pixel dimensions. The app uses these
  to reserve the image's aspect ratio and enlarge pixel artwork for readability.
- `captures.json` records the source page, viewport, crop and target selectors.
  It is a maintenance record and is not part of the displayed guide.

Capture only the button, menu or settings described in the accompanying text,
with a small amount of context. Use a lossless PNG and preserve the real
interface. For example, the File menu image includes the File trigger and Save
As row; the Show image contains the Show submenu, whose route is explained in
the guide. Do not include the whole application or unrelated project artwork.

When refreshing a screenshot, use its recorded selectors and crop as a starting
point, then check the current interface before capturing. Update both language
versions, the dimension catalog, the capture record and the guide text when the
controls or their locations change. Restore temporary language and layout
choices after capture. No build or test run is needed to produce screenshots
against the existing development server.
