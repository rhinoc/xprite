import { useSceneBounds } from "$/components/canvas/scene-bounds";
import { FormDialog } from "$/components/dialogs/form-dialog";
import { EDITOR_EXTERNAL_LINKS } from "$/config/external-links";
import { currentUiLanguage, tUi } from "$/i18n";
import { HELP_LINKS, HelpLink } from "$/managers/shell/help";

const ABOUT_WIDTH = 400;
const ABOUT_HEIGHT = 376;
const ABOUT_CONTENT_INSET = 4;
const ABOUT_FRAME_INSET = 24;
const ABOUT_CLOSE_WIDTH = 120;
const ABOUT_CLOSE_HEIGHT = 34;

export function AboutDialog({
  open,
  onOpenChange,
  onOpenLink,
}: {
  open: boolean;
  onOpenChange: (open: boolean) => void;
  onOpenLink: (link: HelpLink) => void;
}) {
  const scene = useSceneBounds();
  const width = Math.min(ABOUT_WIDTH, scene.width);
  const contentWidth = width - ABOUT_FRAME_INSET;
  const closeLabel = tUi("ui.close");
  const field = (y: number) => ({
    x: ABOUT_CONTENT_INSET,
    y,
    width: contentWidth - ABOUT_CONTENT_INSET * 2,
    height: 22,
  });

  return (
    <FormDialog
      open={open}
      onOpenChange={onOpenChange}
      title={tUi("ui.about.xprite")}
      width={width}
      fields={[
        { key: "description", type: "label", label: tUi("ui.about.description") },
        {
          key: "author",
          type: "link",
          label: "rhinoc",
          onClick: () => onOpenLink(HelpLink.Author),
        },
        { key: "thanks", type: "label", label: tUi("ui.about.thanks") },
        { key: "inspiration", type: "label", label: tUi("ui.about.inspiration") },
        {
          key: "credits",
          type: "link",
          label: tUi("ui.about.credits"),
          onClick: () => onOpenLink(HelpLink.Credits),
        },
        {
          key: "license",
          type: "link",
          label: tUi("ui.about.license"),
          onClick: () => onOpenLink(HelpLink.License),
        },
        {
          key: "donate",
          type: "link",
          label: tUi("ui.support.ko.fi"),
          onClick: () => onOpenLink(HelpLink.Donate),
        },
        {
          key: "repository",
          type: "link",
          label: HELP_LINKS[HelpLink.Repository],
          onClick: () => onOpenLink(HelpLink.Repository),
        },
        {
          key: "website",
          type: "link",
          label: tUi("ui.about.website"),
          href: {
            "zh-CN": EDITOR_EXTERNAL_LINKS.xpriteAboutChinese,
            ja: EDITOR_EXTERNAL_LINKS.xpriteAboutJapanese,
            ko: EDITOR_EXTERNAL_LINKS.xpriteAboutKorean,
            ru: EDITOR_EXTERNAL_LINKS.xpriteAboutRussian,
            "pt-BR": EDITOR_EXTERNAL_LINKS.xpriteAboutPortuguese,
            es: EDITOR_EXTERNAL_LINKS.xpriteAboutSpanish,
            en: EDITOR_EXTERNAL_LINKS.xpriteAbout,
          }[currentUiLanguage()],
        },
      ]}
      layout={{
        height: ABOUT_HEIGHT,
        initialFocusAction: closeLabel,
        fields: {
          description: field(8),
          author: field(60),
          thanks: field(86),
          inspiration: field(108),
          credits: field(138),
          license: field(164),
          donate: field(190),
          repository: field(230),
          website: field(256),
        },
        separators: [
          { x: 0, y: 38, width: contentWidth, height: 18, text: tUi("ui.about.author") },
          { x: 0, y: 218, width: contentWidth, height: 4 },
        ],
        actions: {
          [closeLabel]: {
            x: Math.floor((contentWidth - ABOUT_CLOSE_WIDTH) / 2),
            y: 290,
            width: ABOUT_CLOSE_WIDTH,
            height: ABOUT_CLOSE_HEIGHT,
          },
        },
      }}
      actions={[{ label: closeLabel, onClick: () => onOpenChange(false) }]}
    />
  );
}
