# Tools application

This package contains independent browser tools. The directory is served at `/tools/`. The read-only Aseprite viewer
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
  preference exists. The user-requested system menu shares appearance and background
  preferences through `@xprite/site-shell`; it must not write editor preferences.
- Follow root instructions: do not run builds or tests during development.

- `ToolFrame` owns the tool switcher and page chrome; `FileToolShell` owns file
  selection, drag/drop, the empty-state introduction and example previews. Tool
  pages provide their actual content and action slots, not a duplicate shell.
- The shared, data-only registry lives in `@xprite/growth-content/tools`. Add tools
  there for directory, navigation and discovery; keep tool runtime code here.
