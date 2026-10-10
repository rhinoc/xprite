# iPad pixel editors: evidence file

Verification date: 2026-10-04. Scope: continue an existing desktop Aseprite project on iPad. Source reading was completed through ego-browser, shared task space 12, page p3. No native app installation, Pencil test, offline session, performance benchmark or conversion round trip was performed. Facts below are vendor claims unless marked as current local Xprite code or guide evidence. Exact prices are intentionally omitted: the browser redirected the App Store URL to a different storefront, so a regional purchase quote was not verified.

## Aseprite availability

- The official paid offering lists Windows, macOS and Ubuntu packages; it does not list an iPadOS package. This supports “no official iPad package listed,” not a claim about every unofficial or remote-desktop solution. [Official FAQ](https://www.aseprite.org/faq/#what-do-i-get-when-i-buy-aseprite)
- `.ase` and `.aseprite` denote the same native format; full project data includes color mode, layers, frames, palette, tags and slices. Desktop saves are local; external folder services can provide transfer. [Official file guide](https://www.aseprite.org/docs/files/)

## Pixquare

- **Platform:** iPad and iPhone; Apple-silicon Mac also supported with some operations less optimized. No Android version currently offered. [Introduction](https://docs.pixquare.art/), [FAQ](https://www.pixquare.art/faqs)
- **Payment:** free download, one-time unlock, no subscription; separate all-device and iPhone-only licenses are advertised. Do not treat the iPhone license as an iPad entitlement. Exact current regional amounts and free-mode feature restrictions remain unverified. [FAQ](https://www.pixquare.art/faqs)
- **Aseprite import:** `.ase` / `.aseprite` supported, normally converting to `.px`. Original-format import is also offered; that choice disables auto-save, auto-backup and timelapse. PSD, GIF and image imports and sprite-sheet slicing are documented. [Create/import](https://docs.pixquare.art/pixquare-file/create-import)
- **Export:** ASEPRITE, PSD, PNG, BMP, JPEG, GIF, MOV, APNG, sprite sheets and timelapse; selected layers and frames can be controlled. Native-format export is a declared feature, not measured preservation of Aseprite properties. [Exporting](https://docs.pixquare.art/pixquare-file/exporting)
- **Save and sync:** local device or iCloud Drive location; the guide describes iCloud file synchronization between devices. Conflict handling and cached offline iCloud availability remain unverified. [Storage location](https://docs.pixquare.art/gallery/storage-location)
- **Backup:** configurable backup interval, retained count and local/iCloud destination; restore from file information. Recently Deleted retains files three days. Timelapse data is local and can be cleared separately. [Gallery miscellaneous](https://docs.pixquare.art/gallery/misc)
- **Pen:** pencil-only input suppresses finger drawing; optional finger pan, frame/layer swipe navigation and long-press color picking. Device palm rejection and latency are untested. [Drawing settings](https://docs.pixquare.art/settings/drawing)
- **Gestures:** two-finger pan/pinch/undo, three-finger redo; Pencil double tap and Pencil Pro squeeze tool or palette actions. Hardware-specific Pencil gestures require compatible hardware. [Gestures](https://docs.pixquare.art/interface-and-gestures/gestures-and-quick-actions)
- **Animation:** adjustable backward/forward onion skins, tints and per-layer scope; frame navigation settings can loop or ignore tags. [Animation settings](https://docs.pixquare.art/settings/animation)
- **Tilemaps:** tilemap layers, tile painting, auto-new tiles and animated maps; tilesets exchange as `.pxts` or PNG. This does not establish Aseprite tilemap round-trip preservation. [Tilemap/tileset guide](https://docs.pixquare.art/misc/tilemap-tileset-system)
- **Limits:** canvas and cel limits depend on available RAM. The guide’s cel formula wording is ambiguous; do not reproduce it as a validated sizing equation. [Limitations](https://docs.pixquare.art/pixquare-file/limitations)
- **Unconfirmed:** tags, slices, group effects, indexed mode and tilemap fidelity across export; exact trial limits, offline startup and entitlement restoration while disconnected; simultaneous iCloud editing behavior.

## Resprite

- **Platform:** iOS/iPadOS 16+, Android 7+, Windows 10+ x64, macOS 12+ on Apple silicon. Keep iOS and Desktop/Android feature versions separate. [System requirements](https://resprite.fengeon.com/faq/getting-started/system-requirements)
- **Payment:** trial, subscriptions and one-time purchase advertised. Premium removes daily export-attempt limits; trial exports support all formats without watermarks. Premium also unlocks named adjustment, outline, symmetry and text tools. [Official homepage](https://resprite.fengeon.com/), [Premium unlocks](https://resprite.fengeon.com/faq/purchase/premium-unlocks)
- **Entitlements:** a purchase does not transfer between App Store, Google Play and Steam. A storefront’s license is not a universal device license. Regional prices remain unverified. [Install/licensing](https://resprite.fengeon.com/docs/install)
- **Import:** `.ase` / `.aseprite` from Aseprite 1.3+; Resprite bundles, GIF/APNG, sprite sheets and Tiled maps/tilesets also documented. [Import artwork](https://resprite.fengeon.com/docs/files/import)
- **Native file losses:** import changes group effects, overlapping tags, reverse ping-pong, repeat counts, some cel links, palette names and indexed editing; user data/slices/tilesets are skipped. Export loses equivalent group effects, clipping masks, live styles, references and some grid/blend settings; tilemap export is rasterized. These are vendor-documented current conversion limits. [Aseprite compatibility](https://resprite.fengeon.com/docs/files/aseprite)
- **Export:** `.resprite`, `.aseprite`, GIF/APNG, PNG sheets and Tiled resources; PSD export captures the current frame. AirDrop, Files or an external cloud client can transfer exported copies. This is not evidence of built-in project sync. [Export artwork](https://resprite.fengeon.com/docs/files/export)
- **Storage:** iOS projects reside locally in Files → On My iPad/iPhone → Resprite. Vendor advises exporting project bundles and keeping independent backups outside the app folder. [iOS files](https://resprite.fengeon.com/faq/files/ios-file-location)
- **Auto-save:** scheduled save defaults off; initial interval ten minutes, configurable five to thirty. On iOS the countdown stops in background and restarts on return; other save triggers also exist. Save before leaving a mobile session. [Auto-save limits](https://resprite.fengeon.com/faq/settings/enable-auto-save)
- **Recovery:** iOS Safe Zone retains previous overwritten saves, twenty backups total across projects, not twenty per project. It cannot recover unsaved edits. [Safe Zone](https://resprite.fengeon.com/docs/files/safezone)
- **Pen:** homepage declares Pencil, finger shortcuts and radial brush controls; device responsiveness and pencil models untested. [Official homepage](https://resprite.fengeon.com/)
- **Animation:** timeline groups/layers/frames/clips; optional iPad single-finger frame navigation and onion skin toggle. iPhone does not expose the same single-finger drawing-mode settings. [Timeline](https://resprite.fengeon.com/docs/animation/timeline)
- **Tilemaps:** iOS R59+ / DA 1.32.0+ support rectangular, isometric and hex maps; terrain rules exclude hex. Tile animations and Tiled exchange are documented. Distinguish this capability from Aseprite tilemap import, which is not supported as editable maps. [Tilesets and tilemaps](https://resprite.fengeon.com/docs/drawing/tilemaps-and-tilesets)
- **Unconfirmed:** exact free daily export quota and region-specific purchase amounts; offline license checks; automatic synchronization; measured timing and rendering after export.

## Pixaki

- **Platform and payment:** iPad app with free Intro and paid Pro. Intro: three layers plus one reference, eight animation frames, maximum 160 × 160 canvas and basic formats. Pro: advanced Aseprite/PSD exchange, up to two-megapixel canvas, layers/frames bounded by hardware. The site states Aseprite exchange requires iPadOS 13+. Do not equate this format requirement with the current App Store minimum OS. [Official editions](https://pixaki.com/)
- **Import:** Open accepts Pixaki projects, GIFs, Aseprite documents, PSDs and iPadOS image formats; Files integration is documented. [Gallery](https://pixaki.com/user-guide/gallery/)
- **Export:** Aseprite import/export explicitly claims layers and cels retained; PNG/TIFF/JPEG-2000, GIF/APNG, sheets, movies and PSD also supported. This claim does not establish every native Aseprite property. [Export](https://pixaki.com/user-guide/export/)
- **Storage and backup:** On My iPad or iCloud Drive; iCloud projects can be shared between devices. Deleting the app deletes its local folder. Gallery guide says Dropbox and Google Drive providers do not support Pixaki project packages; verified availability depends on the storage provider. Offline iCloud availability and conflict resolution remain untested. [Gallery](https://pixaki.com/user-guide/gallery/)
- **Pen and touch:** configurable finger tool, eraser, pan or no-action mode; multitouch gestures remain available. Pencil always invokes the selected tool. [Settings](https://pixaki.com/user-guide/settings/)
- **Drawing gestures:** two-finger undo and three-finger redo; pixel-perfect and matrix dither brushes. [Drawing](https://pixaki.com/user-guide/drawing/)
- **Animation:** project frame rate plus held-frame duration multiples, timeline scrubbing and onion skin. Cross-project frame copy/paste is currently not supported. [Animation](https://pixaki.com/user-guide/animation/)
- **Tilemaps:** no editable tilemap layer claim was located in the reviewed official homepage or guide; avoid claiming either support or definitive absence without product verification. [Official overview](https://pixaki.com/)
- **Unconfirmed:** tags, slices, palette/indexed behavior, group effects and tilemap round trips; auto-save cadence/recovery retention; offline launch and purchase validation; current store OS minimum and region-specific price.

## Xprite evidence boundaries

- Browser save is per browser/device, does not sync, and disappears when site data is cleared; File Manager save may use downloads. Offline use requires initial resource preparation. Pen/touch defaults and shortcut toolbar are documented. [Current English guide](https://xprite.cc/help/#save-and-recover), [touch](https://xprite.cc/help/#fingers-and-a-pen), [offline](https://xprite.cc/help/#add-to-desktop-and-use-offline)
- Current implementation reads Aseprite image/group/tilemap layers and preflights unsupported semantics before installation: `packages/editor-core/src/import-export/aseprite/project.ts`. This code reading establishes implementation intent, not device or project fidelity.
- Current guide source: `apps/growth/content/help/README.en.md`. Public article contains no blanket “fully compatible” or Pencil performance claim.

## Phase 2: Pixquare vs Resprite article outline

Proposed H1: “Pixquare vs Resprite: which iPad pixel editor fits your animation handoff?” Target an existing desktop artist choosing a tablet companion; do not rank tools by raw feature counts. Suggested length: 900–1,200 words after representative device and file checks.

1. **Answer the purchase decision first.** Pixquare suits an Apple-device workflow with documented iCloud storage; Resprite spans additional platforms but storefront entitlements do not transfer. Phrase these as fit criteria, not endorsements.
2. **Pencil actions during real editing.** Compare one-pixel contour, selection move, color pick, frame switch and accidental finger input. Cite Pixquare Drawing/Gestures and Resprite homepage/Timeline. Add measured Pencil hardware/app versions only after a device session.
3. **A two-direction handoff table.** Separate Aseprite import, working project format and Aseprite export columns. Explain Pixquare’s original-format import disabling autosave/backup/timelapse. Explain Resprite’s documented timing, tag and indexed conversion. Avoid treating PNG/GIF export as native-project support.
4. **Animation timing case.** Use a copy with 70 ms, 100 ms and 150 ms frames, overlapping tags and linked cels. Verify preview and reopened export; publish actual outcomes and file versions. Resprite’s documented 100 ms import units are a selection criterion, not a measured result.
5. **Maps case.** Distinguish repeat preview, editable tilemap, tile animation and Tiled exchange. Both apps have native maps today. Resprite requires iOS R59+; Aseprite input does not preserve its editable map structure. Pixquare native Aseprite map interchange remains to be measured.
6. **Save before the train loses connectivity.** Compare native working copies, save triggers, local/iCloud location, recovery retention and independent export. Resprite’s Safe Zone shares twenty backups across projects; Pixquare’s backup interval/count/location are configurable. Do not label iCloud sync a version backup.
7. **Cost with matching scope.** Quote the same storefront region, currency and verification date; distinguish Pixquare iPhone-only and all-device licenses, Resprite trial attempts versus Premium and cross-store purchases. Obtain checkout-visible offers before publishing a price winner.
8. **Conditional recommendations and browser option.** Use “choose after this sample project check.” Keep Xprite to a short alternative for browser access and link its actual save/touch guide. End with a project-copy CTA, with campaign `pixquare-vs-resprite`.

Release prerequisites for measured conclusions: app versions, iPad/Pencil models, source `.aseprite` copy and returned copies; screenshots of converted layer/timeline state; pixel and metadata comparison; offline save/export proof; documented regional purchase scope. Until those exist, publish only documented-capability wording and explicitly identify the missing measurements.
