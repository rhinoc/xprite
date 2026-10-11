import { useToolLanguage } from "$/managers/locale/tool-language";
import type { PublicLanguage } from "@xprite/growth-content/language";
import type { ToolHelpContent } from "@xprite/growth-content/tools";
import {
  Disclosure,
  Panel,
  PanelDismissBehavior,
  PanelNoteColor,
  PanelVariant,
  RichText,
  ScrollArea,
} from "@xprite/ui";

import styles from "$/components/shared/tool-help.module.css";

/** A tool's help note: introduction, collapsible task sections and a closing paragraph. */
export function ToolHelp({
  id,
  content,
}: {
  id: string;
  content: Readonly<Record<PublicLanguage, ToolHelpContent>>;
}) {
  const { language } = useToolLanguage();
  const help = content[language];
  return (
    <Panel
      id={id}
      className={styles.help}
      aria-label={help.title}
      title={help.title}
      variant={PanelVariant.NoteWindow}
      noteColor={PanelNoteColor.Yellow}
      dismissBehavior={PanelDismissBehavior.Collapse}
    >
      <ScrollArea
        className={styles.body}
        scrollX={false}
        reserveScrollbarGutter
        aria-label={help.title}
        viewportProps={{ tabIndex: 0, "data-ui-scroll-region-focus": "true" }}
      >
        <RichText>
          <h2>{help.title}</h2>
          <p>{help.introduction}</p>
        </RichText>
        {help.sections.map((section) => (
          <Disclosure key={section.id} title={section.title}>
            <RichText id={section.id} className={styles.section}>
              <ol>
                {section.steps.map((step) => (
                  <li key={step}>{step}</li>
                ))}
              </ol>
              <p>{section.notes}</p>
            </RichText>
          </Disclosure>
        ))}
        <RichText>
          <p>{help.closing}</p>
        </RichText>
      </ScrollArea>
    </Panel>
  );
}
