import type { Ref } from "react";

import { ShowcaseDevice } from "$/managers/showcase/showcase-device";
import {
  SHOWCASE_BRAND_NAME,
  SHOWCASE_COPY,
  ShowcaseLanguage,
} from "$/managers/showcase/showcase-language";
import { RichText } from "@xprite/ui";

import styles from "$/components/showcase/showcase.module.css";

/** Static and interactive introductions use the same text and line boxes. */
export function ShowcaseIntro({
  language,
  started = false,
  device = ShowcaseDevice.Computer,
  deviceText = "",
  introRef,
  titleLineRef,
  subtitleRef,
}: {
  language: ShowcaseLanguage;
  started?: boolean;
  device?: ShowcaseDevice;
  deviceText?: string;
  introRef?: Ref<HTMLDivElement>;
  titleLineRef?: Ref<HTMLSpanElement>;
  subtitleRef?: Ref<HTMLSpanElement>;
}) {
  const copy = SHOWCASE_COPY[language];
  const titleEnd = copy.titleEnd[device];
  const deviceLetters = Array.from(titleEnd.device);
  const deviceGlyphs = Array.from(deviceText);
  const titleDescription = started
    ? `${titleEnd.prefix}${titleEnd.device}${titleEnd.suffix}`
    : copy.titleOverview;
  const deviceTitle = `${copy.titleLead} ${SHOWCASE_BRAND_NAME} ${titleDescription}`;
  return (
    <div ref={introRef} className={styles.intro} data-overview={!started}>
      <h1 className={styles.title} aria-label={deviceTitle}>
        <span ref={titleLineRef} className={styles.titleLine}>
          <span className={styles.titleLead} aria-hidden="true">
            {copy.titleLead}
          </span>
          <span
            className={styles.titleBrand}
            data-wordmark={SHOWCASE_BRAND_NAME}
            aria-hidden="true"
          >
            {SHOWCASE_BRAND_NAME}
          </span>
        </span>
        <span ref={subtitleRef} className={styles.titleEnd} aria-hidden="true">
          {started ? (
            <>
              {titleEnd.prefix}
              <span className={styles.deviceName}>
                {deviceLetters.map((letter, index) => (
                  <span key={index} className={styles.deviceLetter}>
                    <span className={styles.deviceMeasure}>{letter}</span>
                    <span className={styles.deviceWord}>{deviceGlyphs[index]}</span>
                  </span>
                ))}
              </span>
              {titleEnd.suffix}
            </>
          ) : (
            <span className={styles.overviewPrompt}>
              {copy.titleOverview}
              <span className={styles.overviewCursor}>_</span>
            </span>
          )}
        </span>
      </h1>
      <RichText className={styles.productDescription}>
        {copy.productDescription.map((phrase, index) => (
          <span key={phrase}>
            {index > 0 ? " " : ""}
            {phrase}
          </span>
        ))}
      </RichText>
    </div>
  );
}
