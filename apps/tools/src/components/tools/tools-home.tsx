import { ToolFrame } from "$/components/shared/tool-frame";
import { useToolTranslation } from "$/managers/locale/tool-language";
import { useToolLanguage } from "$/managers/locale/tool-language";
import { DIRECTORY_TOOLS } from "$/managers/tools/tool-catalog";
import { localizedSiteHref } from "@xprite/growth-content/language";
import {
  ButtonVariant,
  Icon,
  IconKind,
  Button,
  Panel,
  PanelVariant,
  ScrollArea,
  SurfaceTone,
  PanelWindowChrome,
  IconSize,
  Tooltip,
} from "@xprite/ui";

import styles from "$/components/tools/tools-home.module.css";

const APPLICATIONS = {
  "/": {
    label: "Xprite",
    icon: IconKind.Application,
    description: "Draw and animate pixel art.",
    formats: ".aseprite · PNG · GIF",
  },
  "/tools/viewer/": {
    label: "Aseprite Viewer",
    icon: IconKind.Search,
    description: "Inspect layers and animation.",
    formats: ".ase · .aseprite",
  },
  "/tools/gif-to-sprite-sheet/": {
    label: "GIF to Sprite Sheet",
    icon: IconKind.Image,
    description: "Arrange animation frames.",
    formats: "GIF → PNG + JSON",
  },
  "/tools/animal-crossing-qr/": {
    label: "Animal Crossing Design Converter",
    icon: IconKind.Map,
    description: "Create island design QR codes.",
    formats: "PNG · Aseprite · QR",
  },
} as const;

export function ToolsHome() {
  const t = useToolTranslation();
  const { language } = useToolLanguage();

  return (
    <ToolFrame>
      <main aria-label={t("Applications")}>
        <Panel
          variant={PanelVariant.Window}
          title={t("Applications")}
          tone={SurfaceTone.Accent}
          windowChrome={PanelWindowChrome.Emphasized}
          className={styles.main}
          data-ui-window-priority="primary"
          data-ui-window-active="true"
          footer={<span>{t(`${DIRECTORY_TOOLS.length} applications`)}</span>}
        >
          <ScrollArea
            scrollX={false}
            reserveScrollbarGutter={false}
            className={styles.scrollArea}
            aria-label={t("Tools directory")}
          >
            <div className={styles.content}>
              <div className={styles.applications}>
                {DIRECTORY_TOOLS.map((tool) => {
                  const application = APPLICATIONS[tool.path];
                  return (
                    <Tooltip
                      key={tool.path}
                      text={`${t(application.description)}\n${t(application.formats)}`}
                      placement="auto"
                    >
                      <Button
                        variant={ButtonVariant.Tile}
                        slots={{ leading: <Icon kind={application.icon} size={IconSize.Large} /> }}
                        href={localizedSiteHref(tool.path, language)}
                        text={t(application.label)}
                      />
                    </Tooltip>
                  );
                })}
              </div>
            </div>
          </ScrollArea>
        </Panel>
      </main>
    </ToolFrame>
  );
}
