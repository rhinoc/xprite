import {
  useEffect,
  useRef,
  useState,
  type PointerEvent as ReactPointerEvent,
  type ReactNode,
} from "react";

import { useSceneBounds } from "$/components/canvas/scene-bounds";
import { EditorDialog, EditorPopover } from "$/components/dialogs/overlay";
import { HoverDisclosure } from "$/components/dialogs/support/hover-disclosure";
import { SupportIcon } from "$/components/dialogs/support/support-icons";
import {
  SUPPORT_EXTERNAL_LINK_PROPS,
  SUPPORT_KOFI_HREF,
  SupportChannel,
  supportDonationOrder,
  supportSocialLinks,
  type DonationChannel,
} from "$/components/dialogs/support/support-links";
import { getEditorHomeAbout } from "$/components/workspace/home-view/about";
import { tUi, useUiLanguage } from "$/i18n";
import wechatQr from "$assets/support/wechat-qr.webp?url";
import {
  Button,
  Divider,
  OverlayContentLayout,
  Text,
  TextVariant,
  type SurfaceBounds,
} from "@xprite/ui";
import { RASTER_SCALE } from "@xprite/ui/canvas";
import { measurePopoverAnchor } from "@xprite/ui/popover";
import { useElementSize } from "@xprite/ui/utils";

import styles from "$/components/dialogs/support/support.module.css";

const SUPPORT_WIDTH = 440;
const SUPPORT_MIN_HEIGHT = 200;
const SUPPORT_CHROME_HEIGHT = 46;
const SUPPORT_QR_SIZE = 168;
const SUPPORT_HEADING_HEIGHT = 18;
/** Popup content: the code plus one caption line, inside the theme's popup insets. */
const SUPPORT_QR_POPUP = { width: SUPPORT_QR_SIZE + 24, height: SUPPORT_QR_SIZE + 52 };
/** Touch captions ("Long-press to save or scan") may wrap onto a second line. */
const SUPPORT_QR_TOUCH_EXTRA_HEIGHT = 20;
const FOCUSABLE = 'a[href],button:not(:disabled),[tabindex]:not([tabindex="-1"])';
const COARSE_POINTER_QUERY = "(any-pointer: coarse)";

/** Telemetry names one option per clickable entry; values are stable analytics identifiers. */
export type SupportOption = SupportChannel;

function useCoarsePointer() {
  const [coarse, setCoarse] = useState(
    () => typeof window !== "undefined" && !!window.matchMedia?.(COARSE_POINTER_QUERY).matches,
  );
  useEffect(() => {
    const query = window.matchMedia?.(COARSE_POINTER_QUERY);
    if (!query) return;
    const update = () => setCoarse(query.matches);
    query.addEventListener("change", update);
    return () => query.removeEventListener("change", update);
  }, []);
  return coarse;
}

export function SupportDialog({
  open,
  onOpenChange,
  onOption,
}: {
  open: boolean;
  onOpenChange: (open: boolean) => void;
  onOption: (option: SupportOption) => void;
}) {
  const language = useUiLanguage();
  const scene = useSceneBounds();
  const body = useRef<HTMLDivElement>(null);
  const trigger = useRef<HTMLButtonElement>(null);
  const bodySize = useElementSize(body);
  const coarsePointer = useCoarsePointer();
  const [qrOpen, setQrOpen] = useState(false);
  const [anchor, setAnchor] = useState<SurfaceBounds | null>(null);
  const [disclosure] = useState(() => new HoverDisclosure(setQrOpen));
  const pointer = useRef({ type: "", wasOpen: false });
  useEffect(() => () => disclosure.dispose(), [disclosure]);

  const width = Math.max(1, Math.min(SUPPORT_WIDTH, scene.width || SUPPORT_WIDTH));
  const height = Math.max(
    SUPPORT_MIN_HEIGHT,
    Math.min(SUPPORT_CHROME_HEIGHT + Math.ceil(bodySize.height), scene.height || Infinity),
  );
  const bounds = {
    x: Math.max(0, Math.round((scene.width - width) / 2)),
    y: Math.max(0, Math.round((scene.height - height) / 2)),
    width,
    height,
  };
  const close = () => onOpenChange(false);

  // First focus lands on the primary donation option; focus never leaves the dialog and its popup.
  useEffect(() => {
    if (!open) return;
    const root = body.current;
    const previous = document.activeElement instanceof HTMLElement ? document.activeElement : null;
    if (!coarsePointer) root?.querySelector<HTMLElement>("[data-support-primary]")?.focus();
    const keepFocus = (event: FocusEvent) => {
      const target = event.target instanceof Element ? event.target : null;
      if (!root || !target || root.closest('[role="dialog"]')?.contains(target)) return;
      if (target.closest("[data-support-qr]")) return;
      root.querySelector<HTMLElement>(FOCUSABLE)?.focus({ preventScroll: true });
    };
    document.addEventListener("focusin", keepFocus);
    return () => {
      document.removeEventListener("focusin", keepFocus);
      if (previous?.isConnected) previous.focus({ preventScroll: true });
    };
  }, [open, coarsePointer]);

  // The shared popup is placed in scene coordinates just below the WeChat button.
  useEffect(() => {
    if (qrOpen && trigger.current) setAnchor(measurePopoverAnchor(trigger.current).bounds);
  }, [qrOpen, bodySize.width, bodySize.height]);

  useEffect(() => {
    if (!open) disclosure.close();
  }, [open, disclosure]);

  const hover = {
    onPointerEnter: (event: ReactPointerEvent) => disclosure.pointerEnter(event.pointerType),
    onPointerLeave: (event: ReactPointerEvent) => disclosure.pointerLeave(event.pointerType),
  };
  // Section captions use the same themed separator as the About and form dialogs.
  const heading = (text: string) => (
    <Divider
      text={text}
      pixelSize={{
        width: Math.max(1, Math.floor(bodySize.width) - 16) / RASTER_SCALE,
        height: SUPPORT_HEADING_HEIGHT / RASTER_SCALE,
      }}
    />
  );
  const link = (channel: SupportChannel, href: string, label: string, primary = false) => (
    <Button
      key={channel}
      {...SUPPORT_EXTERNAL_LINK_PROPS}
      {...(primary ? { "data-support-primary": "" } : {})}
      href={href}
      data-support-channel={channel}
      aria-label={tUi("ui.support.new.tab", { name: label })}
      onClick={() => onOption(channel)}
      slots={{ leading: <SupportIcon channel={channel} /> }}
    >
      {label}
    </Button>
  );
  const donation = (channel: DonationChannel, primary: boolean): ReactNode => {
    if (channel === SupportChannel.KoFi)
      return link(channel, SUPPORT_KOFI_HREF, tUi("ui.support.ko.fi"), primary);
    return (
      <div key={channel} className={styles.trigger} {...hover}>
        <Button
          {...(primary ? { "data-support-primary": "" } : {})}
          buttonRef={trigger}
          data-support-channel={channel}
          aria-expanded={qrOpen}
          aria-haspopup="dialog"
          aria-label={tUi("ui.support.wechat.show")}
          onPointerDown={(event) => {
            pointer.current = { type: event.pointerType, wasOpen: disclosure.open };
          }}
          onFocus={(event) => {
            if (event.currentTarget.matches(":focus-visible")) disclosure.focus();
          }}
          onBlur={() => disclosure.blur()}
          onClick={() => {
            const { type, wasOpen } = pointer.current;
            pointer.current = { type: "", wasOpen: false };
            const touch = type === "touch" || (coarsePointer && !type);
            // The popup closes itself on the tap's pointerdown; that tap must not reopen it.
            if (touch && wasOpen) {
              disclosure.close();
              return;
            }
            const opening = !disclosure.open;
            disclosure.activate(touch);
            if (opening && disclosure.open) onOption(SupportChannel.WeChat);
          }}
          slots={{ leading: <SupportIcon channel={SupportChannel.WeChat} /> }}
        >
          {tUi("ui.support.wechat")}
        </Button>
      </div>
    );
  };

  const [primaryDonation, secondaryDonation] = supportDonationOrder(language);
  const repositoryHref = getEditorHomeAbout().repositoryHref;
  const popupBounds = anchor && {
    x: Math.round(anchor.x + (anchor.width - SUPPORT_QR_POPUP.width) / 2),
    y: anchor.y + anchor.height,
    width: SUPPORT_QR_POPUP.width,
    height: SUPPORT_QR_POPUP.height + (coarsePointer ? SUPPORT_QR_TOUCH_EXTRA_HEIGHT : 0),
  };
  return (
    <>
      <EditorDialog
        open={open}
        modal
        resizable={false}
        autoFocus={false}
        constrainToViewport
        title={tUi("ui.support.title")}
        bounds={bounds}
        contentLayout={OverlayContentLayout.Flow}
        onOpenChange={(next) => {
          if (!next) close();
        }}
      >
        <div ref={body} className={styles.body} data-coarse-pointer={coarsePointer || undefined}>
          <Text variant={TextVariant.Inline} scale={RASTER_SCALE} wrap>
            {tUi("ui.support.intro")}
          </Text>
          <section className={styles.section} aria-label={tUi("ui.donate")}>
            {heading(tUi("ui.donate"))}
            {donation(primaryDonation!, true)}
            {donation(secondaryDonation!, false)}
          </section>
          <section className={styles.section} aria-label={tUi("ui.support.follow")}>
            {heading(tUi("ui.support.follow"))}
            {link(SupportChannel.GitHub, repositoryHref, tUi("ui.home.star.on.github"))}
            <div className={styles.socials}>
              {supportSocialLinks(language).map((social) =>
                link(social.channel, social.href, tUi(social.label)),
              )}
            </div>
          </section>
        </div>
      </EditorDialog>
      {qrOpen && popupBounds && (
        <EditorPopover
          open
          onOpenChange={(next) => {
            if (!next) disclosure.close();
          }}
          label={tUi("ui.support.wechat.qr")}
          bounds={popupBounds}
          autoFocus={false}
          showCloseButton={false}
          contentLayout={OverlayContentLayout.Flow}
          scrollX={false}
          scrollY={false}
        >
          <div className={styles.qr} data-support-qr="" {...hover}>
            <img
              className={styles.qrImage}
              src={wechatQr}
              alt={tUi("ui.support.wechat.qr")}
              width={SUPPORT_QR_SIZE}
              height={SUPPORT_QR_SIZE}
              decoding="async"
            />
            <Text variant={TextVariant.Inline} scale={RASTER_SCALE} wrap>
              {tUi(coarsePointer ? "ui.support.wechat.long.press" : "ui.support.wechat.scan")}
            </Text>
          </div>
        </EditorPopover>
      )}
    </>
  );
}
