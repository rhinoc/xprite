import { ToolArtworkKind, useToolArtwork } from "$/components/shared/tool-artwork";
import { TOOL_EXAMPLES, type PublicTool } from "$/managers/tools/tool-catalog";
import {
  ContentAlign,
  ContentLayout,
  ContentPadding,
  SurfaceTone,
  PanelWindowChrome,
  Text,
  TextVariant,
  TextTone,
  Button,
  ControlFlow,
  PixelImage,
  PixelImageFit,
  Panel,
  PanelVariant,
  PanelWindowKind,
} from "@xprite/ui";

import styles from "$/components/shared/tool-frame.module.css";

const EXAMPLE_CONTENT_PADDING = 20;
const EXAMPLE_IMAGE_SIZE = { width: 256, height: 160 };

/** File selection and a real sample sit side by side in the tool window. */
export function FileToolEmptyState({
  tool,
  busy,
  onChooseFile,
  onExample,
}: {
  tool: PublicTool;
  busy: boolean;
  onChooseFile(): void;
  onExample(): Promise<void>;
}) {
  const artwork = useToolArtwork();
  const example = TOOL_EXAMPLES[tool.path];
  return (
    <div className={styles.emptyStage}>
      <div className={styles.emptyContent}>
        <Panel
          windowChrome={PanelWindowChrome.Emphasized}
          tone={SurfaceTone.Informative}
          contentPadding={ContentPadding.Spacious}
          variant={PanelVariant.Window}
          title={tool.openLabel}
          windowKind={PanelWindowKind.Dialog}
          className={styles.introduction}
          data-ui-window-priority="primary"
          data-ui-window-active="true"
        >
          <h1 className={styles.headline}>
            <Text variant={TextVariant.Reading} wrap>
              {tool.fileLabel}
            </Text>
          </h1>
          <div className={styles.fileDrop}>
            <p className={styles.dropHint}>
              <Text variant={TextVariant.Reading} wrap>
                {busy ? "Opening…" : tool.dropLabel}
              </Text>
            </p>
            <ControlFlow className={styles.emptyActions}>
              <Button
                slots={{}}
                text={tool.openLabel}
                font="default"
                disabled={busy}
                onClick={onChooseFile}
              />
            </ControlFlow>
          </div>
          <p className={styles.fileTypes}>
            <Text
              variant={TextVariant.Reading}
              tone={TextTone.Muted}
              wrap
            >{`Accepted files: ${tool.accept
              .split(",")
              .filter((type) => type.startsWith("."))
              .join(" · ")}`}</Text>
          </p>
        </Panel>
        <Panel
          windowChrome={PanelWindowChrome.Emphasized}
          tone={SurfaceTone.Positive}
          contentLayout={ContentLayout.Column}
          contentAlign={ContentAlign.Center}
          contentPadding={EXAMPLE_CONTENT_PADDING}
          variant={PanelVariant.Window}
          title={example.name}
          className={styles.examples}
          data-ui-window-active="false"
          aria-label="Try example"
          collapsible
        >
          <div className={styles.exampleArtwork}>
            <PixelImage
              src={artwork(ToolArtworkKind.Example, tool.path, example.preview)}
              alt={example.alt}
              width={example.width}
              height={example.height}
              fit={PixelImageFit.Contain}
              initialBox={EXAMPLE_IMAGE_SIZE}
            />
          </div>
          <Button
            slots={{}}
            text="Open example"
            font="default"
            disabled={busy}
            onClick={() => void onExample()}
          />
        </Panel>
      </div>
    </div>
  );
}
