# Tools application

This package contains independent browser tools. The feature directory belongs to growth at `/features/`. The read-only Aseprite viewer
is served at `/tools/viewer/`; the GIF converter is served at `/tools/gif-to-sprite-sheet/`.

- Components use public tool manager APIs, `@xprite/ui` controls and the shared
  `@xprite/editor-ui` timeline and layer presentation.
- Managers own inspection and playback state and declare browser ports.
- Adapters implement those ports. Reuse `editor-core` codecs and rendering.
- Do not import `apps/editor` code or mount its UI. Do not write editor preferences,
  recents, recovery data or workspace state from the viewer.
- Continue editing transfers the original file through a short-lived, isolated
  browser record that the editor consumes only on an explicit transfer URL.
- Scope styles with CSS Modules. Keep application entry points and deployment
  integration separate from the editor.
- Use the editor's saved appearance only as an initial value when no public-desktop
  preference exists. The system menu shares appearance and background
  preferences through `@xprite/site-shell`; it must not write editor preferences.
- Follow root instructions: do not run builds or tests during development.
- `ToolFrame` owns the tool switcher and page chrome; `FileToolShell` owns file
  selection, drag/drop, the empty-state introduction and example previews. Tool pages provide content and action slots to these shared shells.
- `ToolFrame` keeps the menubar and tool desktop together in one `100dvh` first
  screen, followed by the footer. Keep this geometry in empty and loaded states
  on desktop and mobile. Fit example artwork to the available space; scroll
  overflowing help and settings inside their own themed regions.
- Every tool (fuse beads, pixelate, GIF sprite sheet, Animal Crossing QR, viewer) is a flow tool and
  passes `flow` to `FileToolShell`: upload, default result, optional adjust, export. The shell
  provides the drop-zone stage, the shared adjust panel (WindowShade, same docked layout on
  desktop and phone, only once there is a result), the export sheet, File ▸ Export… and
  Ctrl/Cmd+E. `ToolFrame` provides the Export button through `ToolActionBarProvider`; the stage
  window renders it with `<ToolStageFooter />` as its last child (empty drop stage and result
  window alike). Mac OS 8 style, no bar: a standard default `Button` (`part="button_focused"`,
  text + 16px, `minimumWidth={59}`, 20px tall, ring drawn outside the box) at the window's
  bottom right, 12px from the right and bottom edges and at least 12px under the content. The shell
  renders it only once there is a result: the empty drop stage has no Export button, and File ▸
  Export… and Ctrl/Cmd+E are disabled/no-ops until then. The export sheet (`ToolExportSheet`) is a
  standard Mac OS 8 dialog: prompt, Format popup (PNG/PDF), Cancel and the ringed default Export
  button at the bottom right; `flow.exportFormats` supplies the formats. The
  adjust panel is a separate window below the stage window; a tool with no real settings (the viewer)
  omits `flow.adjust` and gets no panel.
- Flow tools share one visual language: the stage window is `ToolResultWindow` (the app's Tabs when
  there is more than one tab, then the active pane, then `ToolStageFooter`); canvas tabs use
  `ToolCanvasPane` (zoom controls float bottom right, status top left, never scrolls), list tabs
  (stats, palette, timeline, details) use `ToolListPane`/`ToolDetails`. Result-side details live in
  tabs, never in the adjust panel. Adjust content is built from `ToolGroup` (a titled group box)
  holding `ToolField` rows that sit side by side and wrap: no window inside a window.
- "Edit more" (`flow.editMore`) is a plain standard-width Mac OS 8 `Button` (not the default ring)
  immediately left of Export, 16px box to box (12px to the default button's ring), shown only
  with a result, with File ▸ Edit more in the menu. It opens the tool's result in the editor as a
  NEW project through `openInEditor` (`adapters/editor/open-in-editor.ts`): the file is staged in
  the short-lived `xprite.viewer-transfer` IndexedDB record and the page navigates to
  `/editor#viewer-import=<token>`; the editor takes the record and opens a new document next to
  the projects it already restores, so nothing is replaced. Each tool hands over its natural
  result: pixelate the pixelated PNG (with its palette), GIF the original GIF (frames become the
  timeline), beads the pattern as one pixel per bead, Animal Crossing the converted design, the
  viewer the original project file (layers and tags kept).
- The shared, data-only registry lives in `@xprite/growth-content/tools`. Add tools
  there for directory, navigation and discovery; keep tool runtime code here.
