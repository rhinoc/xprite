/** The current section belongs to this page's contents navigation. */
export class DocumentContentsManager {
  private activeHref: string | undefined;
  private readonly listeners = new Set<() => void>();

  constructor(readonly hrefs: readonly string[]) {
    this.activeHref = hrefs[0];
  }

  readonly getSnapshot = () => this.activeHref;
  readonly getServerSnapshot = () => this.hrefs[0];
  readonly subscribe = (listener: () => void) => {
    this.listeners.add(listener);
    return () => this.listeners.delete(listener);
  };

  setActiveHref(href: string) {
    if (href === this.activeHref) return;
    this.activeHref = href;
    for (const listener of this.listeners) listener();
  }
}
