import { ToolFrame } from "$/components/shared/tool-frame";
import { DIRECTORY_TOOLS } from "$/managers/tools/tool-catalog";
import {
  Text,
  TextVariant,
  TextTone,
  ButtonVariant,
  Icon,
  IconKind,
  Button,
  Panel,
  PanelVariant,
  ScrollArea,
  SurfaceTone,
  PanelWindowChrome,
  StatusBar,
  StatusBarPlacement,
  IconSize,
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
    label: "Animal Crossing QR",
    icon: IconKind.Map,
    description: "Create island design QR codes.",
    formats: "PNG · Aseprite · QR",
  },
} as const;

export function ToolsHome() {
  return (
    <ToolFrame
      readme={
        <>
          <p>
            <strong>Applications</strong>
          </p>
          {DIRECTORY_TOOLS.map((tool) => (
            <p key={tool.path}>
              <strong>{APPLICATIONS[tool.path].label}</strong>
              <br />
              {APPLICATIONS[tool.path].description}
              <br />
              {APPLICATIONS[tool.path].formats}
            </p>
          ))}
        </>
      }
    >
      <main aria-label="Applications">
        <Panel
          variant={PanelVariant.Window}
          title="Applications"
          tone={SurfaceTone.Accent}
          windowChrome={PanelWindowChrome.Emphasized}
          className={styles.main}
          data-ui-window-priority="primary"
          data-ui-window-active="true"
          footer={<span>{`${DIRECTORY_TOOLS.length} applications`}</span>}
        >
          <StatusBar placement={StatusBarPlacement.Header}>
            <Text variant={TextVariant.Reading}>{`${DIRECTORY_TOOLS.length} applications`}</Text>
            <Text variant={TextVariant.Reading} tone={TextTone.Muted}>
              Free · on your device
            </Text>
          </StatusBar>
          <ScrollArea
            scrollX={false}
            reserveScrollbarGutter={false}
            className={styles.scrollArea}
            aria-label="Tools directory"
          >
            <div className={styles.content}>
              <div className={styles.applications}>
                {DIRECTORY_TOOLS.map((tool) => {
                  const application = APPLICATIONS[tool.path];
                  return (
                    <Button
                      variant={ButtonVariant.Tile}
                      slots={{ leading: <Icon kind={application.icon} size={IconSize.Large} /> }}
                      key={tool.path}
                      href={tool.path}
                      text={application.label}
                    />
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
