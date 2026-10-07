import type { CSSProperties } from "react";

import { WorkspaceLink, WorkspaceLinkVariant } from "$/components/workspace/workspace-link";
import starIcon from "$assets/icons/xprite/github-star.svg?url";
import { measureUiText } from "@xprite/ui/assets";
import { UI_SCALE_X, UI_SCALE_Y } from "@xprite/ui/canvas";

import styles from "$/components/workspace/home-view-base/home-view-base.module.css";

const HOME_IDENTITY_ACTION_HEIGHT = 28;
const HOME_STAR_ICON_SIZE = 14;
const HOME_STAR_ICON_GAP = 4;

export interface HomeIdentityLabels {
  star: string;
  feedback: string;
}

export function HomeIdentity({
  labels,
  repositoryHref,
  onFeedback,
}: {
  labels: HomeIdentityLabels;
  repositoryHref: string;
  onFeedback?: () => void;
}) {
  const linkBounds = (text: string, leadingWidth = 0) => ({
    x: 0,
    y: 0,
    width: (measureUiText(text) + leadingWidth) * UI_SCALE_X,
    height: HOME_IDENTITY_ACTION_HEIGHT * UI_SCALE_Y,
  });
  const starStyle = {
    "--xse-home-star-mask": `url("${starIcon}")`,
    width: HOME_STAR_ICON_SIZE * UI_SCALE_X,
    height: HOME_STAR_ICON_SIZE * UI_SCALE_Y,
  } as CSSProperties;

  return (
    <aside className={styles.identity}>
      <nav className={styles.identityActions} aria-label={labels.feedback}>
        <WorkspaceLink
          layout="flow"
          bounds={linkBounds(labels.star, HOME_STAR_ICON_SIZE + HOME_STAR_ICON_GAP)}
          href={repositoryHref}
          variant={WorkspaceLinkVariant.Workspace}
          className={styles.starLink}
          leading={<span className={styles.starIcon} style={starStyle} aria-hidden="true" />}
          color="var(--ui-home-text)"
        >
          {labels.star}
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
