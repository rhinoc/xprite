import { useToolLanguage } from "$/managers/locale/tool-language";
import { VIEWER_EXPORT_HELP, ViewerHelpSection } from "@xprite/growth-content/tools";
import {
  Disclosure,
  Panel,
  PanelDismissBehavior,
  PanelNoteColor,
  PanelVariant,
  RichText,
  ScrollArea,
} from "@xprite/ui";

import styles from "$/components/viewer/viewer-help.module.css";

export function ViewerHelp() {
  const { language } = useToolLanguage();
  const help = VIEWER_EXPORT_HELP[language];
  return (
    <Panel
      id={ViewerHelpSection.Overview}
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
          <p>{help.editing}</p>
        </RichText>
      </ScrollArea>
    </Panel>
  );
}
