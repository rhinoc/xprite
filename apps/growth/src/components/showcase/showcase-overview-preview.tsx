import styles from "$/components/showcase/showcase.module.css";

const OVERVIEW_ASSET_ROOT = "/showcase/overview/";
const DESKTOP_OVERVIEW_SIZE = { width: 1600, height: 900 };
const PORTRAIT_OVERVIEW_SIZE = { width: 444, height: 576 };
const PORTRAIT_OVERVIEW_MEDIA = "(max-width: 700px) and (orientation: portrait)";

/** A frozen frame of the same scene that takes over after its models are ready. */
export function ShowcaseOverviewPreview({ alt }: { alt: string }) {
  return (
    <picture className={styles.overviewPoster}>
      <source
        media={PORTRAIT_OVERVIEW_MEDIA}
        srcSet={`${OVERVIEW_ASSET_ROOT}portrait.png`}
        {...PORTRAIT_OVERVIEW_SIZE}
      />
      <img
        className={styles.overviewPreview}
        src={`${OVERVIEW_ASSET_ROOT}desktop.png`}
        {...DESKTOP_OVERVIEW_SIZE}
        alt={alt}
        decoding="async"
        fetchPriority="high"
      />
    </picture>
  );
}
