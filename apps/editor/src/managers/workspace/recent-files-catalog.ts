import type { PreferenceStoragePort } from "$/managers/ports/platform";
import type { ClosedProjectEntry } from "$/managers/workspace/workspace-recovery";
import type { RecentImageItem } from "@xprite/editor-core/session";

const RECENT_FILES_CATALOG_KEY = "xse.workspace.recent-files-catalog.v1";

interface RecentFilesCatalogState {
  identityRecentIds: Record<string, string>;
  dismissedProjectIds: string[];
  pinnedRecentIds: string[];
}

export interface RecentFileEntry {
  id: string;
  name: string;
  width: number;
  height: number;
  pinned?: boolean;
}

/** Resolves storage identities and presents every saved source through one recent-files view. */
export class RecentFilesCatalog {
  private readonly identityRecentIds = new Map<string, string>();
  private readonly dismissedProjectIds = new Set<string>();
  private readonly pinnedRecentIds: string[] = [];

  constructor(private readonly storage: PreferenceStoragePort) {
    try {
      const saved = JSON.parse(
        storage.getItem(RECENT_FILES_CATALOG_KEY) ?? "null",
      ) as Partial<RecentFilesCatalogState> | null;
      if (saved?.identityRecentIds && typeof saved.identityRecentIds === "object") {
        for (const [identity, recentId] of Object.entries(saved.identityRecentIds))
          if (identity && typeof recentId === "string" && recentId)
            this.identityRecentIds.set(identity, recentId);
      }
      if (Array.isArray(saved?.dismissedProjectIds))
        for (const projectId of saved.dismissedProjectIds)
          if (typeof projectId === "string" && projectId) this.dismissedProjectIds.add(projectId);
      if (Array.isArray(saved?.pinnedRecentIds))
        for (const recentId of saved.pinnedRecentIds)
          if (typeof recentId === "string" && recentId && !this.pinnedRecentIds.includes(recentId))
            this.pinnedRecentIds.push(recentId);
    } catch {
      // Recents remain usable in memory if preference storage is unavailable.
    }
  }

  recentIdForProject(projectId: string): string | null {
    return this.resolveIdentity(projectId);
  }

  resolveIdentity(identity: string): string | null {
    return this.identityRecentIds.get(identity) ?? null;
  }

  isProjectDismissed(projectId: string): boolean {
    return this.dismissedProjectIds.has(projectId);
  }

  linkIdentity(identity: string, recentId: string) {
    if (!identity || !recentId) return;
    this.identityRecentIds.set(identity, recentId);
    this.persist();
  }

  linkProject(projectId: string | null, recentId: string | null) {
    if (!projectId || !recentId) return;
    this.identityRecentIds.set(projectId, recentId);
    this.dismissedProjectIds.delete(projectId);
    const projectRecentId = `local-project:${projectId}`;
    const pinnedProjectIndex = this.pinnedRecentIds.indexOf(projectRecentId);
    if (pinnedProjectIndex >= 0 && recentId !== projectRecentId) {
      const pinnedRecentIndex = this.pinnedRecentIds.indexOf(recentId);
      if (pinnedRecentIndex >= 0) this.pinnedRecentIds.splice(pinnedProjectIndex, 1);
      else this.pinnedRecentIds[pinnedProjectIndex] = recentId;
    }
    this.persist();
  }

  dismissProjects(projectIds: readonly string[]) {
    for (const projectId of projectIds) if (projectId) this.dismissedProjectIds.add(projectId);
    this.persist();
  }

  setPinned(recentId: string, pinned: boolean): boolean {
    if (!recentId) return false;
    const index = this.pinnedRecentIds.indexOf(recentId);
    if (pinned) {
      if (index >= 0) return false;
      this.pinnedRecentIds.push(recentId);
    } else {
      if (index < 0) return false;
      this.pinnedRecentIds.splice(index, 1);
    }
    this.persist();
    return true;
  }

  clearPinned() {
    if (this.pinnedRecentIds.length === 0) return;
    this.pinnedRecentIds.length = 0;
    this.persist();
  }

  forgetBrowserCopy(recentIds: readonly string[], projectIds: readonly string[]) {
    const removedRecents = new Set(recentIds);
    const removedProjects = new Set(projectIds);
    for (const [identity, recentId] of this.identityRecentIds)
      if (removedProjects.has(identity) || removedRecents.has(recentId))
        this.identityRecentIds.delete(identity);
    for (const projectId of projectIds) {
      this.dismissedProjectIds.add(projectId);
      removedRecents.add(`local-project:${projectId}`);
    }
    for (let index = this.pinnedRecentIds.length - 1; index >= 0; index--)
      if (removedRecents.has(this.pinnedRecentIds[index])) this.pinnedRecentIds.splice(index, 1);
    this.persist();
  }

  list(
    imageRecents: readonly RecentImageItem[],
    projects: readonly ClosedProjectEntry[],
    limit: number,
  ): RecentFileEntry[] {
    const recentIds = new Set(imageRecents.map((item) => item.id));
    const browserProjects = projects
      .filter((project) => !this.dismissedProjectIds.has(project.id))
      .filter((project) => !recentIds.has(this.recentIdForProject(project.id) ?? project.id))
      .map((project) => ({
        id: `local-project:${project.id}`,
        name: project.name,
        width: project.width,
        height: project.height,
      }));
    const pinnedOrder = new Map(
      this.pinnedRecentIds.map((id, index): [string, number] => [id, index]),
    );
    return [...imageRecents, ...browserProjects]
      .map((entry) => ({ ...entry, pinned: pinnedOrder.has(entry.id) }))
      .sort((left, right) => {
        const leftOrder = pinnedOrder.get(left.id);
        const rightOrder = pinnedOrder.get(right.id);
        if (leftOrder !== undefined && rightOrder !== undefined) return leftOrder - rightOrder;
        if (leftOrder !== undefined) return -1;
        if (rightOrder !== undefined) return 1;
        return 0;
      })
      .slice(0, Math.max(0, limit));
  }

  private persist() {
    try {
      this.storage.setItem(
        RECENT_FILES_CATALOG_KEY,
        JSON.stringify({
          identityRecentIds: Object.fromEntries(this.identityRecentIds),
          dismissedProjectIds: [...this.dismissedProjectIds],
          pinnedRecentIds: [...this.pinnedRecentIds],
        } satisfies RecentFilesCatalogState),
      );
    } catch {
      // Keep the current catalog useful even when preferences cannot be persisted.
    }
  }
}
