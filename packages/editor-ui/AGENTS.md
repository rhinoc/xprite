# Editor UI

Private business presentation shared by editor and viewer.

- Use `@xprite/ui` for primitives, skins and geometry.
- Editor model types and pure helpers may come from `editor-core`.
- Never import apps, their managers, adapters, settings stores or dialogs.
- Components consume data and callbacks. Editing/history/persistence stay in apps.
- Preserve the editor's existing painter geometry and interaction defaults when
  extracting code. Read-only surfaces disable editing actions explicitly.
- The `/appearance` entry is a headless presentation policy; app managers may
  consume it without importing React components.
- Follow root instructions: do not run builds or tests during development.
