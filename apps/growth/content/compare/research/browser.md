# Browser editors and Aseprite file workflows

Research date: 2026-10-04. This is an internal fact file for maintaining comparison content. Product self-descriptions below are paraphrases, not independent benchmark results. Official pages were opened through ego-browser in task space 12, page p2. No sample-file import/save round-trip, device performance, touch, account, payment, or offline test was performed. Search results and AI summaries were used only to locate official sources and are not evidence.

## Aseprite

- **Platforms / browser:** [Official FAQ](https://www.aseprite.org/faq/#what-do-i-get-when-i-buy-aseprite) lists Windows, macOS, and Ubuntu packages. This supports “official desktop downloads”; the absence of browser downloads is not a universal claim about every unofficial port.
- **Price / free limits:** [FAQ price section](https://www.aseprite.org/faq/#how-much-does-it-cost) showed USD 19.99 minimum pledge. The source-code section permits personal compilation and commercial artwork, with redistribution restrictions. Avoid calling the current application unrestricted open source. Trial saving restrictions were not verified in this pass.
- **Import / export:** Native `.ase` and `.aseprite` are the same format according to the [FAQ file section](https://www.aseprite.org/faq/#is-there-any-difference-between-ase-and-aseprite-files). [Save documentation](https://www.aseprite.org/docs/save/) and [export documentation](https://www.aseprite.org/docs/exporting/) are next-pass sources for output details; no extra output claims were inferred here.
- **Animation / tilemaps:** [Tilemap documentation](https://www.aseprite.org/docs/tilemap/) defines tilemap layers and tilesets since v1.3, and distinguishes editing pixels from placing tile references. [Documentation index](https://www.aseprite.org/docs/) lists animation, scripting, CLI and extensions.
- **Storage / offline:** Local desktop application; no cloud-sync claim verified. Do not equate a hosted file viewer with the official Aseprite application.
- **Evidence wording:** FAQ describes downloadable desktop packages; tilemap manual describes reusable tile references. No browser application was listed in these sources.
- **Uncertain:** Exact current trial capabilities; mobile/native plans; third-party browser ports; behavior of specific scripts in alternatives. Do not publish negative claims that Aseprite has no possible remote/browser use.

## Xprite

- **Platforms / browser:** Website browser editor; guide covers mouse/trackpad, touch and pen, plus home-screen installation in Chrome/Edge and Safari. This establishes documented input and install workflows, not tested parity or measured performance on every device.
- **Price / free limits:** No account or pricing gate was found in the reviewed guide and file adapter. Parent/content owner should confirm launch/pricing policy before a long-lived pricing table.
- **Import:** `.ase` and `.aseprite` are documented for the viewer. Editor adapter `decodeAsepriteBlob` uses local bytes, performs preflight, and converts the decoded document into a session project. It has file/decoded-resource bounds, frame and layer caps, and can reject unsupported content.
- **Export / editable save:** `saveAseprite` encodes a project as Aseprite bytes; `asepriteFileName` supplies the extension. This is evidence of a save implementation, not a comprehensive fidelity guarantee. Viewer exports multi-frame ranges as GIF or a single frame as PNG.
- **Storage / offline:** Guide distinguishes Browser save from File Manager save. Browser copies stay on the current device/browser; no sync. Clearing site data removes those copies and recovery data. File Manager uses a save dialog where supported and downloads elsewhere. Offline resources need preparation while connected; afterward guide says local open/edit/save/export work offline. Browser permissions and externally linked assets remain separate constraints.
- **Animation / tilemaps:** Viewer guide documents frame timing, tags and animation ranges. Local core has tilemap model/controllers/codecs; decoder explicitly rejects type-3 tile-management external files. Do not use the mere presence of tilemap code to claim every tilemap/external-file case works.
- **Official public source:** [Xprite user guide](https://xprite.cc/help/); its reviewed local source is `apps/growth/content/help/README.en.md`.
- **Implementation evidence:** [Editor file adapter](https://github.com/rhinoc/xprite/blob/main/apps/editor/src/adapters/files/aseprite-files.ts); reviewed local `decodeAsepriteBlob` and `saveAseprite`. [Codec](https://github.com/rhinoc/xprite/blob/main/packages/editor-core/src/import-export/aseprite/decode.ts); reviewed `inspectExternalFiles` and unsupported-feature diagnostics. Local current source is stronger evidence than an assumption that public main already contains these exact changes.
- **Uncertain:** Comprehensive import/save fidelity; exact live deployment match; performance/resource limits per device; metadata preservation across all files. Current article asks readers to use a copy and reopen their result.

## Novaboard

- **Platforms / price:** [Developer's product page](https://marcel0ll.itch.io/novaboard) says free browser use without signup and offline operation; store releases are described as forthcoming. Treat platform release status as time-sensitive.
- **Import:** Same source explicitly lists `.ase/.aseprite`, PSD, ORA, GAL, PIXIL and animated GIF.
- **Export:** Developer lists GIF, MP4, sprite sheets and JSON atlases. PNG and other image formats were visible in the live export selector at [the application](https://novaboard.app/). An Aseprite write-back option was not established; do not turn missing evidence into “cannot export.”
- **Storage / offline:** Offline is a developer claim, not independently tested. Storage durability, quotas, project save extension and backups were not verified.
- **Animation / tilemaps:** Developer lists frame/tag timeline and onion skinning; tile mode means seamless patterns and does not establish a tilemap-layer system.
- **Evidence wording:** Developer directly advertises browser/offline use, Aseprite opening and animation output. UI inspection confirmed a file menu and export dialog only; no artwork edited or downloaded.
- **Uncertain:** Import fidelity, modern Aseprite tilemap support, `.aseprite` export, touch quality and native release timing.

## Manabit

- **Platforms:** [Browser documentation](https://manabit.app/docs/basics/browser/) recommends recent Chromium, Firefox or Safari on desktop/tablet. Browser sketches can start without an account, but saving requires sign-in. Purchase covers browser and Windows desktop. [Pricing page](https://manabit.app/get-manabit/) showed USD 9.99 sale / USD 19.99 crossed-out price; avoid storing the sale as a permanent price.
- **Free limits:** [Free access documentation](https://manabit.app/docs/features/available-for-free/) lists 1 local project, 1 cloud project, 25 MB cloud storage, and account-required saves. License unlocks unlimited local projects; Pro adds up to 100 cloud projects / 250 MB and requires a license.
- **Contradiction to preserve:** Free page advertises the full toolkit and “Full UI” but qualifies that some browser features may need a license; pricing describes a limited free app. The exact feature gate matrix is not established. Publish “free access with saving/project limits; license may be needed for features,” not “all features free.”
- **Import:** [Import/export manual](https://manabit.app/docs/features/import-export/) documents `.ase/.aseprite` with layers, frames and tags mapped into layer animations, plus images/GIF and PSD. This is a conversion description.
- **Export:** Same manual lists PNG/JPG still images, GIF and PNG animation strips; native `.manabit` projects are listed on opening. Aseprite export is not documented there. No lossless round-trip claim.
- **Storage / offline:** Free page establishes local and cloud projects. [Cloud-sync feature](https://manabit.app/docs/features/cloud-sync/) is a follow-up source not reviewed this pass. Home-screen installation is documented in browser page; installation does not prove fully offline startup/save. Offline behavior unverified.
- **Animation / tilemaps:** [Official home page](https://manabit.app/) describes independent layer frame counts, stages, Map Builder and repeat tile mode. This does not establish preservation of Aseprite tilemap-layer metadata.
- **Evidence wording:** Import manual separates Aseprite input from image/strip output; browser manual separately states account-required saving.
- **Uncertain:** Exact unpaid feature gates; Pro price; offline/license validation; cloud conflict resolution; Aseprite tilemap import and write-back; actual iPad/phone experience. Do not adopt developer marketing rankings as findings.

## Pixelorama

- **Platforms / price:** [Installation manual](https://pixelorama.org/user_manual/installation) lists free Windows/Linux/macOS downloads, a browser build, and experimental Android. Android is primarily for tablets; phone adaptation is incomplete. Steam is paid support with broadly the same program. Do not claim an iPad-native app from browser availability.
- **Import:** [Import manual](https://pixelorama.org/user_manual/Import) explicitly lists `.ase/.aseprite` and limited compatibility. Its checklist includes pixel/group/tilemap layers, linked cels, tags, timing and tilesets. It excludes slices, cel extra, profiles, external files and masks. Grayscale converts to RGBA.
- **Export / save:** [Official v1.2.2 release](https://github.com/Orama-Interactive/Pixelorama/releases/tag/v1.2.2), dated 2026-09-09, explicitly adds Aseprite project export via PR #1603. This supersedes the omission in the [save/export manual](https://pixelorama.org/user_manual/save_and_export), which still describes `.pxo` save and image/animation export. Do not classify Pixelorama as import-only. `.pxo` remains its own working-project format. Web saves download through the browser; video's documented FFmpeg workflow does not establish browser video export.
- **Release / browser version:** [Official releases](https://github.com/Orama-Interactive/Pixelorama/releases) showed latest v1.2.3 dated 2026-09-15. v1.2.2 assets on GitHub include desktop packages and Android APK, with no web archive listed. Separately, the browser build launched from the [official developer product page](https://orama-interactive.itch.io/pixelorama) displayed **Pixelorama v1.2.3-stable** in its splash dialog on 2026-10-04. Evidence screenshot `/tmp/pixelorama-web-version.png`; embed URL observed `https://html-classic.itch.zone/html/3089992-1981545/index.html?v=1789478815`. This confirms the deployed browser version, not a tested export round-trip. Aseprite output fidelity was not tested.
- **Storage / offline:** Desktop local save is documented; web download is documented. Durable browser project storage, offline web caching and cloud sync were not verified. [Developer listing](https://orama-interactive.itch.io/pixelorama) describes automatic backups, not a guarantee about browser storage.
- **Animation / tilemaps:** [Official homepage](https://pixelorama.org/) documents frame animation/audio synchronization and rectangular/isometric/hexagonal tilemap layers. Import support and tool features should remain distinct.
- **Evidence wording:** Import manual labels third-party import limited and itemizes features. v1.2.2 release explicitly records Aseprite export. Browser splash records v1.2.3, independently of native release assets.
- **Uncertain:** Browser parity of each feature, large-file performance, offline startup and fidelity of Aseprite export. Manual Windows-version language differs from developer comments; don't publish minimum OS versions from this pass. Export cannot be assumed to recover data discarded at import.

## LibreSprite

- **Platforms / price:** [Official project README](https://github.com/LibreSprite/LibreSprite) describes free GPLv2 software and downloads for Linux, macOS, Windows and Android. It is independently developed from a historical Aseprite fork.
- **Browser:** [Official site](https://libresprite.github.io/) links [Online](https://libresprite.github.io/online/). The opened build exposed a canvas and runtime log, including a tablet-support failure message. That single log is not a verdict on all tablets.
- **Import / export:** README says several sprite/animation file types, without a precise current `.aseprite` import/export matrix. Not verified here. Fork history cannot establish modern-format fidelity.
- **Storage / offline:** Unverified for the online build. Desktop downloads do not establish web offline support.
- **Animation / tilemaps:** README lists layers, frames, real-time previews, onion skinning and tiled drawing. Tiled drawing is not evidence of modern Aseprite tilemap layers.
- **Evidence wording:** Project self-description supports free animation software; official site supports existence of a web entry point only.
- **Uncertain:** Online supported formats and write-back, persistence, mobile/touch, modern tilemaps, exact build version. Keep it as a qualified additional option, not the best browser file-exchange recommendation.

## Stage-two article angles

- **Best online pixel art editors:** Compare two separate tasks: creating art and continuing an existing project. Include Piskel/Pixilart from the other research owner, plus Novaboard/Manabit/Pixelorama. Compare account-required saves and editable output, not a flat tool-count ranking.
- **Aseprite alternatives:** Distinguish native desktop workflows, browser file editing and native tablet work. Use measured criteria for a future practical test; Aseprite's native format remains the reference for fidelity, not a quality ranking.
- **Browser project saving:** Explain download vs browser-local copy vs cloud project. Xprite and Manabit have materially different documented saving models; offline and sync need explicit evidence.
- **Editing an Aseprite file on a tablet:** Combine this file with native-tablet research. Separate opening/playback, touch editing and save-back. No Apple Pencil latency, touch accuracy or “works on all devices” claims before device testing.
- **Tilemaps in browser editors:** Distinguish repeat/tiled drawing from tilemap layers and actual level-map builders. Request representative `.aseprite` tilemap samples before ranking format preservation.

Maintenance trigger: recheck exact free limits/prices, platform releases, import/export lists and outstanding compatibility uncertainties before promoting a stage-two draft. Stable conclusions should remain linked to their supporting source rather than to a vendor comparison article.
