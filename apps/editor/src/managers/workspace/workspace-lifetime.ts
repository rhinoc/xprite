import type { DocumentWorkspace } from "$/managers/workspace/document-workspace";

/** Serializes workspace ownership and persistence for one application root. */
export class WorkspaceLifetime {
  private active: { workspace: DocumentWorkspace; initialization: Promise<void> } | null = null;
  private disposal: Promise<void> = Promise.resolve();

  initialize(workspace: DocumentWorkspace): Promise<void> {
    if (this.active?.workspace === workspace) return this.active.initialization;
    this.retire();
    const active = { workspace, initialization: Promise.resolve() };
    this.active = active;
    active.initialization = this.disposal.then(() => {
      if (this.active === active) return workspace.initialize();
    });
    return active.initialization;
  }

  retire(workspace = this.active?.workspace): Promise<void> {
    if (!this.active || this.active.workspace !== workspace) return this.disposal;
    const active = this.active;
    this.active = null;
    const previous = this.disposal;
    const disposal = active.workspace.dispose();
    this.disposal = Promise.all([previous, disposal]).then(() => {});
    return this.disposal;
  }
}
