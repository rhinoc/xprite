import { useId, type CSSProperties } from "react";

import { ToolArtworkKind, useToolArtwork } from "$/components/shared/tool-artwork";
import { useToolTranslation } from "$/managers/locale/tool-language";
import { TOOL_EXAMPLES, type PublicTool } from "$/managers/tools/tool-catalog";
import {
  FontRole,
  ContentAlign,
  ContentLayout,
  ContentPadding,
  SurfaceTone,
  Text,
  TextVariant,
  Button,
  ControlFlow,
  PixelImage,
  PixelImageFit,
  Panel,
  PanelVariant,
  UiColorScheme,
  Icon,
  useUiColorScheme,
} from "@xprite/ui";

import styles from "$/components/shared/tool-frame.module.css";

const EXAMPLE_CONTENT_PADDING = 20;
const EXAMPLE_IMAGE_SIZE = { width: 256, height: 160 };
const OPEN_CURSOR_SCALE = 3;

enum EntryCursorPosition {
  FromLeft = "from-left",
  FromAbove = "from-above",
  FromBelow = "from-below",
}
const CURSOR_COLORS = {
  [EntryCursorPosition.FromLeft]: "#ff4b69",
  [EntryCursorPosition.FromAbove]: "#04b8a8",
  [EntryCursorPosition.FromBelow]: "#9862ff",
} as const;
const COLOR_CHANNEL_OFFSETS = [1, 3, 5] as const;
const COLOR_RADIX = 16;
const COLOR_CHANNEL_MAXIMUM = 255;
const COLOR_CHANNEL_DIGITS = 2;

function cursorColorMatrix(color: string, colorScheme: UiColorScheme) {
  const [red, green, blue] = COLOR_CHANNEL_OFFSETS.map(
    (offset) =>
      Number.parseInt(color.slice(offset, offset + COLOR_CHANNEL_DIGITS), COLOR_RADIX) /
      COLOR_CHANNEL_MAXIMUM,
  );
  // The dark cursor atlas reverses black and white. Tint its white pixels
  // while keeping the black pixels black, matching the light cursor's shape.
  return colorScheme === UiColorScheme.Dark
    ? `${red} 0 0 0 0 0 ${green} 0 0 0 0 0 ${blue} 0 0 0 0 0 1 0`
    : `${1 - red} 0 0 0 ${red} 0 ${1 - green} 0 0 ${green} 0 0 ${1 - blue} 0 ${blue} 0 0 0 1 0`;
}

function FileEntryCues({ busy }: { busy: boolean }) {
  const prefix = useId();
  const colorScheme = useUiColorScheme();
  return (
    <span
      className={styles.entryCues}
      aria-hidden="true"
      hidden={busy}
      style={
        {
          "--tool-cursor-outline": colorScheme === UiColorScheme.Dark ? "black" : "white",
        } as CSSProperties
      }
    >
      <svg className={styles.cursorFilters} aria-hidden="true" focusable="false">
        <defs>
          {Object.values(EntryCursorPosition).map((position) => (
            <filter id={`${prefix}-${position}`} key={position} colorInterpolationFilters="sRGB">
              <feColorMatrix
                type="matrix"
                values={cursorColorMatrix(CURSOR_COLORS[position], colorScheme)}
              />
            </filter>
          ))}
        </defs>
      </svg>
      {Object.values(EntryCursorPosition).map((position) => (
        <span
          className={styles.entryCursor}
          data-position={position}
          key={position}
          style={
            {
              "--tool-cursor-filter": `url("#${prefix}-${position}")`,
            } as CSSProperties
          }
        >
          <Icon kind="cursor_normal" scale={OPEN_CURSOR_SCALE} className={styles.cursorArrow} />
        </span>
      ))}
    </span>
  );
}

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
  const t = useToolTranslation();

  const artwork = useToolArtwork();
  const example = TOOL_EXAMPLES[tool.path];
  const openAction = (
    <ControlFlow className={styles.emptyActions}>
      <Button
        slots={{}}
        text={t(tool.openLabel)}
        font={FontRole.Primary}
        disabled={busy}
        onClick={onChooseFile}
      />
    </ControlFlow>
  );
  return (
    <div className={styles.emptyStage}>
      <div className={styles.emptyContent}>
        <div className={styles.entryWindow}>
          <Panel
            collapsible={false}
            emphasized
            tone={SurfaceTone.Info}
            contentPadding={ContentPadding.Spacious}
            contentLayout={ContentLayout.Fill}
            variant={PanelVariant.Dialog}
            title={t(tool.label)}
            className={styles.introduction}
            data-ui-window-priority="primary"
            data-ui-window-active="true"
          >
            <div className={styles.fileDrop}>
              {openAction}
              <p className={styles.dropHint}>
                <Text variant={TextVariant.Reading} wrap>
                  {t(busy ? "Opening…" : tool.dropLabel)}
                </Text>
              </p>
            </div>
          </Panel>
          <FileEntryCues busy={busy} />
        </div>
        <Panel
          emphasized
          tone={SurfaceTone.Success}
          contentLayout={ContentLayout.Column}
          contentAlign={ContentAlign.Center}
          contentPadding={EXAMPLE_CONTENT_PADDING}
          variant={PanelVariant.Document}
          title={t(example.name)}
          className={styles.examples}
          data-ui-window-active="false"
          aria-label={t("Try example")}
          collapsible
        >
          <div className={styles.exampleArtwork}>
            <PixelImage
              src={artwork(ToolArtworkKind.Example, tool.path, example.preview)}
              alt={t(example.alt)}
              width={example.width}
              height={example.height}
              fit={PixelImageFit.Contain}
              initialBox={EXAMPLE_IMAGE_SIZE}
            />
          </div>
          <Button
            slots={{}}
            text={t("Open example")}
            font={FontRole.Primary}
            disabled={busy}
            onClick={() => void onExample()}
          />
        </Panel>
      </div>
    </div>
  );
}
