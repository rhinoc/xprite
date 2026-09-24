# Aseprite widget geometry fixtures

These Light-theme widget trees were captured from Aseprite 1.3.18.5-5-g1af985278-dev at source revision `1af985278481e278bf44ebec86cb4433aff280b4`. Each `*.widgets.json` is copied byte-for-byte from the corresponding Aseprite capture. Its paired `*.provenance.json` contains the widget SHA-256 and capture/build evidence. Filenames identify the dialog and UI state; the shared Aseprite version and theme are recorded here and in each provenance file.

Capture settings: client window inventory, Windows shortcut profile, image palette, regular layer, nearest normalization, and the basic feature capability profile. The geometry test verifies these authored widget bounds against the editor's Aseprite-dialog layout functions.

Regeneration uses `scripts/visual-audit/aseprite/capture-own-window.mjs` with the Aseprite source clone in `.refs/aseprite`, its matching app build, and `scripts/fixtures/editor/default-artwork.png`; see the paired provenance files for exact options and dependency hashes.

Retained provenance records preserve the source paths and hashes from their
capture date. The fixture's current location is the path above.
