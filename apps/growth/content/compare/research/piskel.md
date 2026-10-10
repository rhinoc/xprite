# Piskel research and production record

Checked: **2026-10-04**. Method: official pages and live editor menus in ego-browser TaskSpace 12, page p4. No drawing benchmark, imported-file preservation test, mobile/iPad hardware trial, or keyword-volume measurement was performed. Published article: `../articles/piskel-alternatives.md`.

## Piskel facts

| Area                 | Verified fact                                                                                 | Official source                                                   | Qualification                                                                                   |
| -------------------- | --------------------------------------------------------------------------------------------- | ----------------------------------------------------------------- | ----------------------------------------------------------------------------------------------- |
| Positioning / cost   | Free browser sprite and animation editor; open source                                         | [Overview](https://www.piskelapp.com/)                            | Do not equate free with ad-free                                                                 |
| Desktop / offline    | Windows, macOS, Linux downloads; listed version v0.14.0; best-effort releases with limited QA | [Download](https://www.piskelapp.com/download/)                   | Installation, signing and OS compatibility not tested                                           |
| Saved projects       | `.piskel` download or current-browser storage                                                 | [Editor Save panel](https://www.piskelapp.com/p/create/sprite/)   | No current cloud sync confirmed                                                                 |
| Import               | `.piskel`, PNG, JPG, BMP, animated GIF                                                        | [Editor Import panel](https://www.piskelapp.com/p/create/sprite/) | No Aseprite format claim found; absence of evidence is not a universal unsupported-format claim |
| Export               | GIF; PNG sprite sheets / ZIP                                                                  | [Overview](https://www.piskelapp.com/)                            | Exact ZIP contents and metadata preservation not checked                                        |
| Editing              | Layers, duplicate/delete frame, FPS preview, onion skin                                       | [Live editor](https://www.piskelapp.com/p/create/sprite/)         | No inference about per-frame timing or clip-tag support                                         |
| Recovery             | Periodic session backups; Import → Browse backups                                             | [FAQ](https://www.piskelapp.com/faq/)                             | Recovery is not a portable backup                                                               |
| Teaching / community | Kids edition is free, ad-free, without social features                                        | [FAQ](https://www.piskelapp.com/faq/#faq-piskel-for-kids)         | Do not infer main-editor galleries from legacy tooltip wording                                  |
| Ads / paid tier      | Main editor has ads; no paid ad-free edition currently offered                                | [FAQ](https://www.piskelapp.com/faq/#faq-why-ad)                  | Policy is changeable                                                                            |
| Touch                | Keyboard shortcuts appear in editor controls                                                  | [Editor](https://www.piskelapp.com/p/create/sprite/)              | Phone/tablet drawing, pen roles and gesture behavior remain unverified                          |

## Pixilart facts used for the alternative

| Area              | Verified fact                                                                              | Official source                                                                          | Qualification                                                          |
| ----------------- | ------------------------------------------------------------------------------------------ | ---------------------------------------------------------------------------------------- | ---------------------------------------------------------------------- |
| Platforms         | Web editor; official iOS and Android app links                                             | [Help](https://www.pixilart.com/help)                                                    | Mobile and Web feature parity unverified                               |
| Animation         | Frame speed, onion skin, GIF; layers with opacity/merge                                    | [Features](https://www.pixilart.com/features)                                            | Performance and practical frame limit untested                         |
| Project           | Save/open `.pixil`                                                                         | [Help](https://www.pixilart.com/help)                                                    | No documented `.piskel` or Aseprite project import confirmed           |
| PRO               | $4.99 USD/month, 3-day trial; ad-free; 5 GB editable `.pixil` cloud sync on desktop/mobile | [Subscribe](https://www.pixilart.com/subscribe)                                          | Web pricing checked on 2026-10-04; regional app-store price unverified |
| Community         | Galleries, challenges, tutorials                                                           | [Home](https://www.pixilart.com/)                                                        | Community size is not comparative keyword demand                       |
| Storage / offline | Editor displays Autosaves; cloud sync is PRO                                               | [Editor](https://www.pixilart.com/draw), [Subscribe](https://www.pixilart.com/subscribe) | Retention and offline operation not confirmed                          |

**Source conflicts:** `/help` says mobile has no subscriptions, while the current `/subscribe` page explicitly covers PRO benefits on the mobile app. Use the specific current subscription page for paid/cloud claims. `/features` mentions canvases under 700 pixels, but the legacy editor's new-drawing modal says maximum 1024×1024; avoid publishing a size limit until editor generations are separately checked. `/draw` offers a new editor in beta; comparison captures must identify which editor is used.

## Pixelorama facts used for the alternative

| Area                   | Verified fact                                                                                | Official source                                                                                                                                              | Qualification                                                                                                                                                  |
| ---------------------- | -------------------------------------------------------------------------------------------- | ------------------------------------------------------------------------------------------------------------------------------------------------------------ | -------------------------------------------------------------------------------------------------------------------------------------------------------------- |
| Platforms              | Free Windows/Linux/macOS; Web; experimental Android                                          | [Installation](https://pixelorama.org/user_manual/installation)                                                                                              | Android UI is not adapted for phones                                                                                                                           |
| License / paid version | MIT; paid Steam distribution adds platform benefits, no separate drawing feature tier        | [FAQ](https://pixelorama.org/faq)                                                                                                                            | Specific Steam price not checked                                                                                                                               |
| Animation              | Tags, onion skin, audio layers; non-destructive editing                                      | [Overview](https://pixelorama.org/)                                                                                                                          | No performance claim                                                                                                                                           |
| Project import         | `.piskel`, `.ase/.aseprite` and other formats listed                                         | [Import](https://pixelorama.org/user_manual/Import)                                                                                                          | Import support is not full preservation; Aseprite limitations are separately documented                                                                        |
| Save / export          | `.pxo`; PNG/APNG/GIF; sprite sheets; Aseprite export added in v1.2.2; Web downloads projects | [Save and Export](https://pixelorama.org/user_manual/save_and_export), [v1.2.2 release](https://github.com/Orama-Interactive/Pixelorama/releases/tag/v1.2.2) | Official web build observed as v1.2.3-stable by browser research owner; file round trip not tested. Video import requirements do not establish browser parity. |
| Sync / offline         | Desktop application; Steam Cloud documented                                                  | [FAQ](https://pixelorama.org/faq)                                                                                                                            | Web offline/cache behavior not confirmed                                                                                                                       |

## Xprite evidence behind published claims

| Claim                                    | Current repository evidence                                                                                                                     | Public support                                            |
| ---------------------------------------- | ----------------------------------------------------------------------------------------------------------------------------------------------- | --------------------------------------------------------- |
| Aseprite reading/writing                 | `apps/editor/src/adapters/files/aseprite-files.ts`: decode and encode paths                                                                     | [User guide](https://xprite.cc/help/#save-and-recover) |
| PNG sheet import                         | `packages/editor-core/src/import-export/image/import-sprite-sheet.ts`; workflow at `apps/editor/src/managers/workspace/use-editor-workflows.ts` | Current menu implementation; not an imported-file test    |
| Animated GIF import                      | `apps/editor/src/adapters/files/animated-images.ts` invokes GIF decoder                                                                         | Current implementation; not a round-trip test             |
| Timeline duration/tags                   | `packages/editor-core/src/timeline/types.ts`; `apps/editor/src/managers/timeline/timeline-manager.ts`                                           | Current implementation                                    |
| Touch, local saving, offline preparation | `apps/growth/content/help/README.en.md`                                                                                                         | [Guide](https://xprite.cc/help/)                       |
| `.piskel` project support                | No parser surfaced in targeted app/core source search                                                                                           | Do not promise native Piskel import                       |

## Migration editorial rules

Keep original `.piskel` and rendered reference. Pixelorama documents native import, so do not claim every alternative requires flattening. For Xprite use GIF or PNG sheet: rendered frames preserve visual output rather than reconstructing layers, names and project settings. A plain PNG sheet has no timing; specify dimensions, slicing order and delays. GIF has palette/transparency limits. Document any preservation result only after importing, saving and reopening representative files. Native extension recognition alone never warrants “full compatibility.”

## Stage 2 outline: Piskel vs Pixilart

**Proposed H1:** Piskel vs Pixilart: game sprites or community creation?

**Intent and gate:** expand only if the stage 1 Piskel article produces relevant search queries and actual editor use; site visits, registrations or brand popularity are not search-volume evidence. Record writing/research hours and attributable first edits. Draft target: 800–1100 English words, one decision table, one concrete project used for both editors.

- Opening decision: short self-contained sprite production versus drawing plus community publishing. Acknowledge both can animate; avoid claiming Piskel has no layers or Pixilart is only social.
- Table: current editor generation, project file, frame timing controls, onion skin, local project download, editable cloud storage, community routes, cost. Unknown cells remain unknown.
- Animation task: create a small multi-frame walk cycle, duplicate a frame, change timing, adjust a foreground layer, export. Capture steps and actual results, including error/recovery behavior. Do not invent elapsed times.
- Save versus publish: distinguish `.piskel`/`.pixil` editable source, local autosave, rendered GIF, public artwork and PRO sync. Test reopening local projects before claiming portability.
- Community task: inspect challenge and gallery requirements without publishing or messaging others. State account and moderation prerequisites only when current official terms support them.
- Migration: transfer PNG/GIF; neither project's native interchange is established. Preserve originals and separate layers if needed; document changed frame timing/colors rather than asserting lossless conversion.
- Recommendation: Piskel for the tested small-sprite workflow; Pixilart when community routes are the deciding need. Xprite gets a short conditional mention for touch/Aseprite exchange, with attributable editor CTA rather than taking over the comparison.
- FAQ candidates from actual queries: Can Pixilart open a Piskel file? Is Pixilart cloud storage free? Which saves editable animations? Keep answers narrowly supported.
- Before publication: resolve legacy/new Pixilart editor scope, canvas-limit conflict and PRO pricing. Device behavior requires device trials.

## Stage 2 outline: Piskel, Pixelorama and Xprite animation workflows

**Proposed H1:** Piskel, Pixelorama and Xprite: choosing an animation workflow

**Intent and gate:** use observed queries about animation complexity, sprite sheets, frame timing or Piskel migration. Do not commission another generic best-editor list. Draft target: 900–1200 words.

- Define the task: a short loop plus a separate action clip, foreground/background layers, one uneven pause, PNG game output and GIF preview.
- Build a compact comparison table of documented controls: frame organization, timing, onion skin, audio, native project, sprite-sheet export, browser/desktop operation. Label undocumented or untested fields.
- Piskel section: demonstrated frame tools and FPS workflow. Check whether uneven timing and multiple clips can be represented; do not infer absent functionality from a single panel.
- Pixelorama section: tags/audio and `.piskel` import. Inspect original versus imported layers, frame order, timing and colors; save `.pxo` and reopen. Treat documented Aseprite import limits separately from Piskel preservation.
- Xprite section: timeline tags, durations, touch modifiers and browser/local save. Import rendered sheet/GIF, rebuild only necessary metadata, then export; distinguish new-project capability from source-project preservation.
- Output checks: inspect actual PNG layout, frame count/order, transparency, GIF timing, scaling and any JSON metadata the selected export produces. Store artifacts with product version and settings; no timing/performance claims without measurement.
- Workflow recommendation: choose smallest tool that finishes the task; larger feature set alone does not imply faster production. Name rebuild cost when native import is unavailable.
- Follow-up FAQ and internal links: link to native-project migration, Aseprite browser editing and touch guide only where relevant. Use campaign attribution for editor entries.

## Outstanding work and refresh triggers

No search-volume, ranking difficulty, CPC or conversion forecast has been verified. No phone/iPad performance, pen precision, large animation, `.piskel` preservation or Aseprite round-trip experiment has been run. Recheck pricing and editor-generation changes before release and on relevant product updates; revisit compatibility whenever a source or parser changes. Track update effort in the same ROI ledger as article production.
