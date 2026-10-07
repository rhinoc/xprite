import type { RasterEditor } from "@xprite/editor-core";

interface DocumentOutputOwner {
  core: RasterEditor;
  key: string;
}

/** Export writes may finish independently; only the current owner receives app effects. */
export class DocumentOutputExportOperation {
  private connected = false;
  private revision = 0;
  private request: number | null = null;

  constructor(
    private readonly getOwner: () => DocumentOutputOwner,
    private readonly publishBusy: (busy: boolean) => void,
  ) {}

  get busy() {
    return this.request !== null;
  }

  connect = () => {
    this.connected = true;
    this.revision++;
    this.request = null;
    this.publishBusy(false);
    return () => {
      this.connected = false;
      this.revision++;
      this.request = null;
    };
  };

  async run<T>(
    owner: DocumentOutputOwner,
    exporting: (isCurrent: () => boolean) => Promise<T>,
    completed: ((result: T) => void) | undefined,
    reportError: (reason: unknown) => void,
  ) {
    const matchesOwner = () => {
      const current = this.getOwner();
      return current.core === owner.core && current.key === owner.key;
    };
    if (!this.connected || this.busy || !matchesOwner()) return;
    const request = ++this.revision;
    this.request = request;
    const isCurrent = () => this.connected && this.revision === request && matchesOwner();
    this.publishBusy(true);
    try {
      const result = await exporting(isCurrent);
      if (isCurrent()) completed?.(result);
    } catch (reason) {
      if (isCurrent()) reportError(reason);
    } finally {
      // A stale completion must never release a newer owner's lock.
      if (this.request === request) this.request = null;
      if (isCurrent()) this.publishBusy(false);
    }
  }
}
