import { SHOWCASE_FAQ_COPY } from "$content/showcase/faq";
import type { SHOWCASE_HERO_COPY } from "$content/showcase/index";

import { Disclosure, Panel, PanelNoteColor, PanelVariant, RichText, ScrollArea } from "@xprite/ui";

import styles from "$/components/showcase/showcase-faq.module.css";

const FAQ_ACCORDION_NAME = "showcase-faq";

type FaqInlineContent = string | { code: string } | { label: string; href: string };

function FaqAnswer({ content }: { content: readonly FaqInlineContent[] }) {
  return (
    <RichText>
      <p>
        {content.map((part, index) => {
          if (typeof part === "string") return part;
          if ("code" in part) return <code key={index}>{part.code}</code>;
          return (
            <a key={index} href={part.href}>
              {part.label}
            </a>
          );
        })}
      </p>
    </RichText>
  );
}

export function ShowcaseFaq({ language }: { language: keyof typeof SHOWCASE_HERO_COPY }) {
  const copy = SHOWCASE_FAQ_COPY[language];
  return (
    <section id="faq" data-showcase-faq aria-labelledby="faq-title">
      <Panel
        className={styles.faq}
        variant={PanelVariant.Note}
        noteColor={PanelNoteColor.Yellow}
        aria-label={copy.title}
        data-showcase-note
      >
        <RichText className={styles.title}>
          <h2 id="faq-title">{copy.title}</h2>
        </RichText>
        <ScrollArea
          className={styles.questions}
          scrollX={false}
          reserveScrollbarGutter
          aria-label={copy.title}
          viewportProps={{ tabIndex: 0, "data-ui-scroll-region-focus": "true" }}
        >
          {copy.questions.map((item) => (
            <Disclosure key={item.id} name={FAQ_ACCORDION_NAME} title={item.question}>
              <FaqAnswer content={item.answer} />
            </Disclosure>
          ))}
        </ScrollArea>
        <div className={styles.guide}>
          <FaqAnswer content={copy.guide} />
        </div>
      </Panel>
    </section>
  );
}
