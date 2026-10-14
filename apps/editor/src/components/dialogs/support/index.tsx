import {
  useCallback,
  useEffect,
  useId,
  useLayoutEffect,
  useRef,
  useState,
  type KeyboardEvent as ReactKeyboardEvent,
  type PointerEvent as ReactPointerEvent,
} from "react";

import { useSceneBounds } from "$/components/canvas/scene-bounds";
import { EditorDialog } from "$/components/dialogs/overlay";
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
  ControlFlow,
  defaultActionProps,
  Divider,
  OverlayContentLayout,
  Text,
  TextVariant,
  useUi,
} from "@xprite/ui";
import { UiPart } from "@xprite/ui/assets";
import { RASTER_SCALE } from "@xprite/ui/canvas";
import {
  borderSize,
  clientRect,
  clientToLocal,
  layoutSize,
  useElementSize,
} from "@xprite/ui/utils";

import styles from "$/components/dialogs/support/support.module.css";

const SUPPORT_WIDTH = 440;
const SUPPORT_MIN_HEIGHT = 240;
const SUPPORT_CHROME_HEIGHT = 46;
const SUPPORT_HEADING_HEIGHT = 18;
const SUPPORT_POPOVER_GAP = 4;
const SUPPORT_QR_SIZE = 168;
const FOCUSABLE = 'a[href],button:not(:disabled),[tabindex]:not([tabindex="-1"])';
const COARSE_POINTER_QUERY = "(any-pointer: coarse)";

/** Telemetry names one option per clickable entry; values are stable analytics identifiers. */
export type SupportOption = SupportChannel;

function useCoarsePointer() {
  const [coarse, setCoarse] = useState(
    () => typeof window !== "undefined" && window.matchMedia?.(COARSE_POINTER_QUERY).matches,
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
  const { style: uiStyle } = useUi();
  const body = useRef<HTMLDivElement>(null);
  const trigger = useRef<HTMLButtonElement>(null);
  const popover = useRef<HTMLDivElement>(null);
  const bodySize = useElementSize(body);
  const coarsePointer = useCoarsePointer();
  const popoverId = useId();
  const [qrOpen, setQrOpen] = useState(false);
  const [qrPosition, setQrPosition] = useState<{ left: number; top: number } | null>(null);
  const [disclosure] = useState(() => new HoverDisclosure(setQrOpen));
  const lastPointerType = useRef("");
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
  const close = useCallback(() => onOpenChange(false), [onOpenChange]);

  // First focus lands on the primary donation option; focus never leaves the open dialog.
  useEffect(() => {
    if (!open) return;
    const root = body.current;
    const previous = document.activeElement instanceof HTMLElement ? document.activeElement : null;
    if (!coarsePointer) root?.querySelector<HTMLElement>("[data-support-primary]")?.focus();
    const keepFocus = (event: FocusEvent) => {
      if (
        root &&
        event.target instanceof Node &&
        !root.closest('[role="dialog"]')?.contains(event.target)
      )
        root.querySelector<HTMLElement>(FOCUSABLE)?.focus({ preventScroll: true });
    };
    document.addEventListener("focusin", keepFocus);
    return () => {
      document.removeEventListener("focusin", keepFocus);
      if (previous?.isConnected) previous.focus({ preventScroll: true });
    };
  }, [open, coarsePointer]);

  // Place the QR card under the WeChat button, or above it when the dialog has no room below.
  useLayoutEffect(() => {
    if (!qrOpen) {
      setQrPosition(null);
      return;
    }
    const root = body.current;
    const anchor = trigger.current;
    const cardElement = popover.current;
    if (!root || !anchor || !cardElement) return;
    const anchorRect = clientRect(anchor);
    const anchorTop = clientToLocal(root, { x: anchorRect.left, y: anchorRect.top });
    const anchorBottom = clientToLocal(root, { x: anchorRect.right, y: anchorRect.bottom });
    const card = borderSize(cardElement);
    const area = layoutSize(root);
    const left = Math.round(
      Math.min(
        Math.max(0, (anchorTop.x + anchorBottom.x - card.width) / 2),
        Math.max(0, area.width - card.width),
      ),
    );
    // Prefer just below the trigger; slide up to stay inside the dialog body when it is short.
    const below = anchorBottom.y + SUPPORT_POPOVER_GAP;
    const top = Math.max(0, Math.min(below, area.height - card.height));
    setQrPosition({ left, top: Math.round(top) });
  }, [qrOpen, bodySize.width, bodySize.height]);

  // A tap outside the trigger and card dismisses a touch-opened QR card.
  useEffect(() => {
    if (!qrOpen) return;
    const dismiss = (event: PointerEvent) => {
      const target = event.target instanceof Node ? event.target : null;
      if (target && (trigger.current?.contains(target) || popover.current?.contains(target)))
        return;
      disclosure.close();
    };
    document.addEventListener("pointerdown", dismiss, true);
    return () => document.removeEventListener("pointerdown", dismiss, true);
  }, [qrOpen, disclosure]);

  useEffect(() => {
    if (!open) disclosure.close();
  }, [open, disclosure]);

  const onKeyDown = (event: ReactKeyboardEvent<HTMLDivElement>) => {
    if (event.key === "Escape" && qrOpen) {
      // The QR card closes first; a second Escape closes the dialog.
      event.preventDefault();
      event.stopPropagation();
      disclosure.close();
      trigger.current?.focus();
      return;
    }
    if (event.key !== "Tab") return;
    const nodes = [...(body.current?.querySelectorAll<HTMLElement>(FOCUSABLE) ?? [])];
    if (!nodes.length) return;
    const index = nodes.indexOf(document.activeElement as HTMLElement);
    if (event.shiftKey && index <= 0) {
      event.preventDefault();
      nodes[nodes.length - 1]?.focus();
    } else if (!event.shiftKey && index === nodes.length - 1) {
      event.preventDefault();
      nodes[0]?.focus();
    }
  };

  const hover = {
    onPointerEnter: (event: ReactPointerEvent) => disclosure.pointerEnter(event.pointerType),
    onPointerLeave: (event: ReactPointerEvent) => disclosure.pointerLeave(event.pointerType),
  };
  const heading = (text: string) => (
    <Divider
      text={text}
      pixelSize={{
        width: Math.max(1, Math.floor(bodySize.width) - 16) / RASTER_SCALE,
        height: SUPPORT_HEADING_HEIGHT / RASTER_SCALE,
      }}
    />
  );

  const donation = (channel: DonationChannel, primary: boolean) => {
    const iconScale = 2;
    const className = primary ? styles.primary : styles.secondary;
    const marker = primary ? { "data-support-primary": "" } : {};
    if (channel === SupportChannel.KoFi)
      return (
        <Button
          key={channel}
          {...marker}
          {...SUPPORT_EXTERNAL_LINK_PROPS}
          href={SUPPORT_KOFI_HREF}
          className={className}
          aria-label={tUi("ui.support.new.tab", { name: tUi("ui.support.ko.fi") })}
          onClick={() => onOption(SupportChannel.KoFi)}
          slots={{ leading: <SupportIcon channel={SupportChannel.KoFi} scale={iconScale} /> }}
        >
          {tUi("ui.support.ko.fi")}
        </Button>
      );
    return (
      <div key={channel} className={styles.wechat} {...hover}>
        <Button
          {...marker}
          buttonRef={trigger}
          className={className}
          aria-expanded={qrOpen}
          aria-controls={qrOpen ? popoverId : undefined}
          aria-haspopup="dialog"
          aria-label={tUi("ui.support.wechat.show")}
          onPointerDown={(event) => {
            lastPointerType.current = event.pointerType;
          }}
          onFocus={(event) => {
            if (event.currentTarget.matches(":focus-visible")) disclosure.focus();
          }}
          onBlur={(event) => {
            if (!popover.current?.contains(event.relatedTarget as Node | null)) disclosure.blur();
          }}
          onClick={() => {
            const wasOpen = disclosure.open;
            disclosure.activate(
              lastPointerType.current === "touch" || (coarsePointer && !lastPointerType.current),
            );
            lastPointerType.current = "";
            if (!wasOpen && disclosure.open) onOption(SupportChannel.WeChat);
          }}
          slots={{ leading: <SupportIcon channel={SupportChannel.WeChat} scale={iconScale} /> }}
        >
          {tUi("ui.support.wechat")}
        </Button>
      </div>
    );
  };

  const [primaryDonation, secondaryDonation] = supportDonationOrder(language);
  return (
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
      <div
        ref={body}
        className={styles.body}
        onKeyDown={onKeyDown}
        data-coarse-pointer={coarsePointer || undefined}
      >
        <Text variant={TextVariant.Inline} scale={RASTER_SCALE} wrap>
          {tUi("ui.support.intro")}
        </Text>
        <section className={styles.section} aria-label={tUi("ui.donate")}>
          {heading(tUi("ui.donate"))}
          <div className={styles.donations}>
            {donation(primaryDonation!, true)}
            {donation(secondaryDonation!, false)}
          </div>
        </section>
        <section className={styles.section} aria-label={tUi("ui.support.follow")}>
          {heading(tUi("ui.support.follow"))}
          <Button
            {...SUPPORT_EXTERNAL_LINK_PROPS}
            href={getEditorHomeAbout().repositoryHref}
            className={styles.star}
            aria-label={tUi("ui.support.new.tab", { name: tUi("ui.home.star.on.github") })}
            onClick={() => onOption(SupportChannel.GitHub)}
            slots={{ leading: <SupportIcon channel={SupportChannel.GitHub} /> }}
          >
            {tUi("ui.home.star.on.github")}
          </Button>
          <div className={styles.socials}>
            {supportSocialLinks(language).map((link) => (
              <Button
                key={link.channel}
                {...SUPPORT_EXTERNAL_LINK_PROPS}
                href={link.href}
                className={styles.social}
                data-support-channel={link.channel}
                aria-label={tUi("ui.support.new.tab", { name: tUi(link.label) })}
                onClick={() => onOption(link.channel)}
                slots={{ leading: <SupportIcon channel={link.channel} /> }}
              >
                {tUi(link.label)}
              </Button>
            ))}
          </div>
        </section>
        <ControlFlow className={styles.actions}>
          <Button text={tUi("ui.close")} {...defaultActionProps()} onClick={close} />
        </ControlFlow>
        {qrOpen && (
          <div
            ref={popover}
            id={popoverId}
            role="dialog"
            aria-label={tUi("ui.support.wechat.qr")}
            className={styles.qr}
            style={
              qrPosition
                ? {
                    left: qrPosition.left,
                    top: qrPosition.top,
                    background: uiStyle.colors.menuitem_normal_face,
                  }
                : { left: 0, top: 0, visibility: "hidden" }
            }
            {...hover}
          >
            <UiPart part="menu" scale={RASTER_SCALE} className={styles.qrFrame} />
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
        )}
      </div>
    </EditorDialog>
  );
}
