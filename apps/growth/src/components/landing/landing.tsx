import { FEATURES_PATH } from "$content/features";
import { SHOWCASE_FAQ_COPY } from "$content/showcase/faq";
import {
  LANDING_EDITOR_HREF,
  LANDING_SCREENSHOT_ROOT,
  landingCopy,
} from "$content/showcase/landing";
import type { FaqInlineContent } from "$content/site/faq";
import { localizedSiteHref, publicLanguage, PublicLanguage } from "$content/site/language";

import styles from "$/components/landing/landing.module.css";

/** Screenshots exist for English and Chinese; other languages reuse the English ones. */
function screenshotLanguage(language: string) {
  return publicLanguage(language) === PublicLanguage.SimplifiedChinese ? "zh-CN" : "en";
}
const SCREENSHOT_WIDTH = 2560;
const SCREENSHOT_HEIGHT = 1600;
const PHONE_WIDTH = 1170;
const PHONE_HEIGHT = 2532;
const APPEARANCES = ["light", "dark"] as const;
const RULER_STEP = 64;
const RULER_MARKS = 24;

function InlineContent({ content }: { content: readonly FaqInlineContent[] }) {
  return (
    <>
      {content.map((part, index) => {
        if (typeof part === "string") return part;
        if ("code" in part) return <code key={index}>{part.code}</code>;
        return (
          <a key={index} href={part.href}>
            {part.label}
          </a>
        );
      })}
    </>
  );
}

function Arrow() {
  return <span className={styles.arrow} aria-hidden="true" />;
}

function Ruler({ vertical = false }: { vertical?: boolean }) {
  return (
    <div className={vertical ? styles.rulerY : styles.rulerX} aria-hidden="true">
      {Array.from({ length: RULER_MARKS }, (_, index) => (
        <span key={index}>{index * RULER_STEP}</span>
      ))}
      <i className={styles.rulerMark} data-landing-ruler-mark={vertical ? "y" : "x"} />
    </div>
  );
}

/** The About page body: server-rendered, readable and usable without JavaScript. */
export function Landing({ language }: { language: string }) {
  const copy = landingCopy(language);
  const faq = SHOWCASE_FAQ_COPY[publicLanguage(language)];
  const capture = screenshotLanguage(language);
  return (
    <div className={styles.landing} data-landing lang={language}>
      <div className={styles.screen}>
        <section className={styles.hero} data-landing-hero aria-labelledby="landing-title">
          <canvas className={styles.paint} data-landing-paint aria-hidden="true" />
          <div className={styles.rulerCorner} aria-hidden="true" />
          <Ruler />
          <Ruler vertical />
          <div className={styles.heroInner}>
            <div className={styles.heroText}>
              <p className={styles.status}>
                {copy.status.map((item) =>
                  item.href ? (
                    <a key={item.label} href={item.href} rel="noopener">
                      {item.label} ↗
                    </a>
                  ) : (
                    <span key={item.label}>{item.label}</span>
                  ),
                )}
              </p>
              <h1 id="landing-title" className={styles.title}>
                {copy.titleLead}{" "}
                <span className={styles.selection}>
                  {copy.titleSelection}
                  <i aria-hidden="true" />
                  <i aria-hidden="true" />
                  <i aria-hidden="true" />
                  <i aria-hidden="true" />
                </span>
              </h1>
              <p className={styles.lead}>{copy.lead}</p>
              <div className={styles.actions}>
                <a className={styles.primary} href={LANDING_EDITOR_HREF}>
                  {copy.openEditor}
                  <Arrow />
                </a>
                <a className={styles.secondary} href={localizedSiteHref(FEATURES_PATH, language)}>
                  {copy.features}
                </a>
              </div>
            </div>
            <div className={styles.devices}>
              {/* Both appearances ship; the page appearance (not the system setting) picks one. */}
              <figure className={styles.shot}>
                {APPEARANCES.map((appearance) => (
                  <img
                    key={appearance}
                    data-landing-shot={appearance}
                    src={`${LANDING_SCREENSHOT_ROOT}/editor-${capture}-${appearance}.webp`}
                    width={SCREENSHOT_WIDTH}
                    height={SCREENSHOT_HEIGHT}
                    alt={appearance === "light" ? copy.screenshotAlt : ""}
                    decoding="async"
                    fetchPriority={appearance === "light" ? "high" : "low"}
                  />
                ))}
              </figure>
              <figure className={styles.phone}>
                {APPEARANCES.map((appearance) => (
                  <img
                    key={appearance}
                    data-landing-shot={appearance}
                    src={`${LANDING_SCREENSHOT_ROOT}/phone-${capture}-${appearance}.webp`}
                    width={PHONE_WIDTH}
                    height={PHONE_HEIGHT}
                    alt={appearance === "light" ? copy.phoneAlt : ""}
                    decoding="async"
                  />
                ))}
              </figure>
            </div>
          </div>
        </section>

        <section
          className={styles.facts}
          aria-label={copy.facts.map((fact) => fact.key).join(", ")}
        >
          {copy.facts.map((fact, index) => (
            <div key={fact.key}>
              <p className={styles.factKey}>
                {String(index + 1).padStart(2, "0")} / {fact.key}
              </p>
              <p className={styles.factValue}>{fact.value}</p>
              <p className={styles.factText}>{fact.text}</p>
            </div>
          ))}
        </section>
      </div>

      <section className={styles.section} aria-labelledby="landing-features">
        <div className={styles.sectionHead}>
          <h2 id="landing-features">{copy.featuresTitle}</h2>
          <p>{copy.featuresLead}</p>
        </div>
        <div className={styles.featureList}>
          <p className={styles.featureListTitle}>
            <span>{copy.features}</span>
            <span>{copy.featureList.length}</span>
          </p>
          <ul>
            {copy.featureList.map((feature) => (
              <li key={feature.slug}>
                <a className={styles.feature} href={feature.href}>
                  <span className={styles.featureTitle}>{feature.title}</span>
                  <span className={styles.featureText}>{feature.description}</span>
                  <span className={styles.featureMeta}>{feature.shortcut}</span>
                </a>
              </li>
            ))}
          </ul>
        </div>
      </section>

      <section className={styles.section} aria-labelledby="landing-tools">
        <div className={styles.sectionHead}>
          <h2 id="landing-tools">{copy.toolsTitle}</h2>
          <p>{copy.toolsLead}</p>
        </div>
        <ul className={styles.tools}>
          {copy.toolList.map((tool) => (
            <li key={tool.href}>
              <a className={styles.tool} href={tool.href}>
                <span className={styles.toolName}>{tool.label}</span>
                <span className={styles.io}>{tool.input}</span>
                <Arrow />
                <span className={styles.io}>{tool.output}</span>
              </a>
            </li>
          ))}
        </ul>
      </section>

      <section className={styles.gallery} aria-labelledby="landing-gallery">
        <div className={styles.sectionHead}>
          <h2 id="landing-gallery">{copy.galleryTitle}</h2>
          <p>{copy.galleryLead}</p>
        </div>
        <div className={styles.tiles}>
          {copy.gallery.map((tile) => (
            <figure key={tile.src} className={styles.tile}>
              <img
                className={styles.pixelArt}
                src={tile.src}
                width={tile.width}
                height={tile.height}
                alt={tile.alt}
                decoding="async"
              />
              <figcaption>{tile.tag}</figcaption>
            </figure>
          ))}
        </div>
      </section>

      <div className={styles.finale}>
        <section id="faq" className={styles.section} aria-labelledby="faq-title">
          <div className={styles.sectionHead}>
            <h2 id="faq-title">{faq.title}</h2>
            <p>
              <InlineContent content={faq.guide} />
            </p>
          </div>
          <div className={styles.faq}>
            {faq.questions.map((item) => (
              <details key={item.id} name="landing-faq">
                <summary>{item.question}</summary>
                <p>
                  <InlineContent content={item.answer} />
                </p>
              </details>
            ))}
          </div>
        </section>

        <section className={styles.closing} aria-labelledby="landing-closing">
          <h2 id="landing-closing">{copy.closingTitle}</h2>
          <a className={styles.primary} href={LANDING_EDITOR_HREF}>
            {copy.openEditor}
            <Arrow />
          </a>
        </section>
      </div>
    </div>
  );
}
