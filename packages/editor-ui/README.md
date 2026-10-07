# Editor UI

Private `@xprite/editor-ui` package for shared editor presentation. It depends on
`editor-core` model types/pure helpers and `@xprite/ui` primitives; it never
imports apps, their managers, persistence or platform adapters.

`/timeline` contains the editor's extracted layer-row artwork, flag hit areas,
tag-band layout, tag artwork and frame-header artwork. The editor keeps its
editing handlers, menus, history and drag state. The viewer uses read-only
components built on those same implementations. Read-only timelines virtualize
frame hit targets and render only the visible viewport.

`/appearance` is headless: the shared mode enum, storage key, light default and
system-mode resolution. App managers may use this entry without loading React
or importing presentation components.
