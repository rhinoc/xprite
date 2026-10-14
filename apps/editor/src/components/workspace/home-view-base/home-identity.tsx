import { WorkspaceLink, WorkspaceLinkVariant } from "$/components/workspace/workspace-link";
import { measureUiText } from "@xprite/ui/assets";
import { UI_SCALE_X, UI_SCALE_Y } from "@xprite/ui/canvas";

import styles from "$/components/workspace/home-view-base/home-view-base.module.css";

const HOME_IDENTITY_ACTION_HEIGHT = 14;

export interface HomeIdentityLabels {
  support: string;
  settings: string;
  feedback: string;
}

export function HomeIdentity({
  labels,
  onSupport,
  onSettings,
  onFeedback,
}: {
  labels: HomeIdentityLabels;
  onSupport?: () => void;
  onSettings?: () => void;
  onFeedback?: () => void;
}) {
  const linkBounds = (text: string) => ({
    x: 0,
    y: 0,
    width: measureUiText(text) * UI_SCALE_X,
    height: HOME_IDENTITY_ACTION_HEIGHT * UI_SCALE_Y,
  });

  return (
    <aside className={styles.identity}>
      <nav className={styles.identityActions} aria-label={labels.feedback}>
        <WorkspaceLink
          layout="flow"
          bounds={linkBounds(labels.support)}
          onClick={onSupport}
          disabled={!onSupport}
          variant={WorkspaceLinkVariant.Workspace}
          className={styles.starLink}
          color="var(--ui-home-text)"
        >
          {labels.support}
        </WorkspaceLink>
        <WorkspaceLink
          layout="flow"
          bounds={linkBounds(labels.settings)}
          onClick={onSettings}
          disabled={!onSettings}
          variant={WorkspaceLinkVariant.Workspace}
          className={styles.starLink}
          color="var(--ui-home-text)"
        >
          {labels.settings}
        </WorkspaceLink>
        <WorkspaceLink
          layout="flow"
          bounds={linkBounds(labels.feedback)}
          onClick={onFeedback}
          disabled={!onFeedback}
          variant={WorkspaceLinkVariant.Workspace}
          className={styles.starLink}
          color="var(--ui-home-text)"
        >
          {labels.feedback}
        </WorkspaceLink>
      </nav>
    </aside>
  );
}
