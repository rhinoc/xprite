import { Suspense, useEffect, useMemo, useRef, useState } from "react";

import { useSceneBounds } from "$/components/canvas/scene-bounds";
import { EditorDialog } from "$/components/dialogs/overlay";
import { tUi, useUiLanguage } from "$/i18n";
import {
  ExporterGroup,
  type ExporterRegistry,
  type ExporterContext,
  type ExporterChoice,
  type RegisteredExporter,
  type ExporterPanelProps,
} from "$/managers/files/exporter-registry";
import type { FilePreferences } from "$/managers/preferences/file-preferences";
import {
  Button,
  FontRole,
  Menu,
  MenuCheckType,
  type MenuItem,
  OverlayContentLayout,
  Text,
  TextVariant,
  Icon,
  focusDialogContainer,
  isDialogPopupTarget,
} from "@xprite/ui";
import { centerUiPixel, measureUiText, useUiAssets } from "@xprite/ui/assets";
import { RASTER_SCALE } from "@xprite/ui/canvas";
import { clientRect, dropdownArrowOffsetY, isImeKeyboardEvent } from "@xprite/ui/utils";

import styles from "$/components/dialogs/export-dialog/export-dialog.module.css";

export function preloadExportPanels() {
  return Promise.resolve();
}

const SELECTOR_HEIGHT = 42;
const CONTROL_HEIGHT = 30;
const CONTROL_GAP = 8;
const WINDOW_CHROME = { width: 24, height: 46 };
const FOCUSABLE = 'button:not(:disabled), input:not(:disabled), [tabindex="0"]';

export interface ExportDialogProps {
  registry: ExporterRegistry;
  context: ExporterContext;
  panels: ReadonlyMap<string, ReturnType<RegisteredExporter["createPanel"]>>;
  destination: string;
  onDestinationChange(destination: string): void;
  onModuleBusyChange(busy: boolean): void;
  onExported(id: string, options: unknown): void;
  execute(id: string, options: unknown): void;
  filePreferences: FilePreferences;
  busy: boolean;
  onClose(): void;
}

function MountedPanel({
  render,
  id,
  host,
  ...props
}: Omit<ExporterPanelProps, "context" | "onBusyChange" | "onExported" | "execute"> & {
  render: ReturnType<RegisteredExporter["createPanel"]>;
  id: string;
  host: ExportDialogProps;
}) {
  const current = useRef(host);
  current.current = host;
  const viewProps = useRef(props);
  viewProps.current = props;
  const callbacks = useMemo(
    () => ({
      onBusyChange: (busy: boolean) => current.current.onModuleBusyChange(busy),
      onExported: (options: unknown) => current.current.onExported(id, options),
      execute: (options: unknown) => current.current.execute(id, options),
      onChoiceChange: (choice: string) => viewProps.current.onChoiceChange(choice),
      onChoicesChange: (choices: readonly ExporterChoice[]) =>
        viewProps.current.onChoicesChange(choices),
      onLayoutSizeChange: (size: { width: number; height: number }) =>
        viewProps.current.onLayoutSizeChange(size),
      onClose: () => current.current.onClose(),
    }),
    [id],
  );
  return render({ ...props, ...callbacks });
}

/** One modal owner; visited output panels keep their drafts until the window closes. */
export function ExportDialog(props: ExportDialogProps) {
  useUiLanguage();
  const scene = useSceneBounds();
  const uiAssets = useUiAssets();
  const [choiceIds, setChoiceIds] = useState<Record<string, string>>({});
  const [requests, setRequests] = useState<Record<string, { id: string }>>({});
  const [choices, setChoices] = useState<Record<string, readonly ExporterChoice[]>>(() =>
    Object.fromEntries(
      props.registry.entries.map((entry) => [entry.id, entry.initialChoices ?? []]),
    ),
  );
  const [sizes, setSizes] = useState<Record<string, { width: number; height: number }>>(() =>
    Object.fromEntries(props.registry.entries.map((entry) => [entry.id, entry.initialSize])),
  );
  useEffect(() => {
    let active = true;
    for (const entry of props.registry.entries) {
      if (!entry.resolveChoices) continue;
      void entry
        .resolveChoices(props.context)
        .then((items) => {
          if (active) setChoices((previous) => ({ ...previous, [entry.id]: items }));
        })
        .catch(() => {
          /* Keep unsupported formats disabled. */
        });
    }
    return () => {
      active = false;
    };
  }, [props.registry, props.context]);
  const [position, setPosition] = useState<{ x: number; y: number } | null>(null);
  const root = useRef<HTMLDivElement | null>(null);
  const current = useRef(props);
  current.current = props;
  useEffect(() => {
    const previous = document.activeElement instanceof HTMLElement ? document.activeElement : null;
    focusDialogContainer(root.current);
    const focus = (event: FocusEvent) => {
      if (
        !root.current?.contains(event.target as Node) &&
        !isDialogPopupTarget(root.current, event.target)
      )
        focusDialogContainer(root.current);
    };
    const key = (event: KeyboardEvent) => {
      if (isImeKeyboardEvent(event) || isDialogPopupTarget(root.current, event.target)) return;
      if (event.key === "Escape") {
        event.preventDefault();
        event.stopPropagation();
        current.current.onClose();
      }
      if (event.key !== "Tab") return;
      const nodes = [...(root.current?.querySelectorAll<HTMLElement>(FOCUSABLE) ?? [])].filter(
        (node) =>
          !node.closest("[hidden]") && clientRect(node).width > 0 && clientRect(node).height > 0,
      );
      const index = nodes.indexOf(document.activeElement as HTMLElement);
      if (
        !nodes.length ||
        index < 0 ||
        (event.shiftKey && index === 0) ||
        (!event.shiftKey && index === nodes.length - 1)
      ) {
        event.preventDefault();
        if (nodes.length) nodes[event.shiftKey ? nodes.length - 1 : 0].focus();
        else focusDialogContainer(root.current);
      }
    };
    document.addEventListener("focusin", focus);
    document.addEventListener("keydown", key);
    return () => {
      document.removeEventListener("focusin", focus);
      document.removeEventListener("keydown", key);
      if (previous?.isConnected) previous.focus({ preventScroll: true });
    };
  }, []);
  const selected = props.registry.get(props.destination);
  if (!selected) return null;
  const itemFor = (entry: RegisteredExporter, choice?: ExporterChoice): MenuItem => ({
    label: choice ? tUi(choice.label) : entry.label(),
    disabled: !entry.available(props.context) || choice?.disabled,
    checkType: MenuCheckType.Radio,
    checked:
      props.destination === entry.id &&
      (!choice || (choiceIds[entry.id] ?? choices[entry.id]?.[0]?.id) === choice.id),
    onSelect: () => {
      if (props.busy) return;
      if (choice) {
        setChoiceIds((previous) => ({ ...previous, [entry.id]: choice.id }));
        setRequests((previous) => ({ ...previous, [entry.id]: { id: choice.id } }));
      }
      props.onDestinationChange(entry.id);
    },
  });
  const entryItems = (entry: RegisteredExporter) =>
    choices[entry.id]?.length
      ? choices[entry.id].map((choice) => itemFor(entry, choice))
      : [itemFor(entry)];
  const groupLabels = {
    [ExporterGroup.Sheets]: tUi("ui.export.sheet.group"),
    [ExporterGroup.Crafts]: tUi("ui.export.games.crafts"),
  };
  const formatMenu: MenuItem[] = [
    ...props.registry.entries.filter((entry) => !entry.group).flatMap(entryItems),
    ...Object.values(ExporterGroup).flatMap((group) => {
      const children = props.registry.entries
        .filter((entry) => entry.group === group)
        .flatMap(entryItems);
      return children.length
        ? [{ label: groupLabels[group], separator: group === ExporterGroup.Sheets, children }]
        : [];
    }),
  ];
  const selectedLabel = choices[selected.id]?.find(
    (choice) => choice.id === (choiceIds[selected.id] ?? choices[selected.id]?.[0]?.id),
  )?.label;
  const selectedText = selectedLabel ? tUi(selectedLabel) : selected.label();
  const panel = (destination: string, render: ReturnType<RegisteredExporter["createPanel"]>) => {
    const active = props.destination === destination;
    const onLayoutSizeChange = (size: { width: number; height: number }) => {
      if (!active) return;
      setPosition(
        (previous) =>
          previous ?? {
            x: centerUiPixel(scene.x, scene.width, size.width + WINDOW_CHROME.width),
            y: centerUiPixel(
              scene.y,
              scene.height,
              size.height + SELECTOR_HEIGHT + WINDOW_CHROME.height,
            ),
          },
      );
      setSizes((previous) =>
        previous[destination].width === size.width && previous[destination].height === size.height
          ? previous
          : { ...previous, [destination]: size },
      );
    };
    return (
      <MountedPanel
        render={render}
        id={destination}
        host={props}
        active={active}
        busy={props.busy}
        filePreferences={props.filePreferences}
        choiceRequest={requests[destination]}
        onChoiceChange={(id) =>
          setChoiceIds((previous) =>
            previous[destination] === id ? previous : { ...previous, [destination]: id },
          )
        }
        onChoicesChange={(items) =>
          setChoices((previous) => ({ ...previous, [destination]: items }))
        }
        onLayoutSizeChange={onLayoutSizeChange}
        onClose={props.onClose}
      />
    );
  };
  const reportedSize = sizes[props.destination];
  const panelSize = {
    ...reportedSize,
    width:
      scene.width > 0
        ? Math.min(reportedSize.width, Math.max(1, scene.width - WINDOW_CHROME.width))
        : reportedSize.width,
  };
  const windowWidth = panelSize.width + WINDOW_CHROME.width;
  const windowHeight = panelSize.height + SELECTOR_HEIGHT + WINDOW_CHROME.height;
  const label = tUi("ui.export.format.selector");
  const labelWidth = measureUiText(label) + CONTROL_GAP;
  const arrowY = uiAssets
    ? dropdownArrowOffsetY(
        { y: 0, height: CONTROL_HEIGHT },
        uiAssets.style.parts.combobox_arrow_down.height * RASTER_SCALE,
        !!uiAssets.style.dimensions.combobox_arrow_centered,
      )
    : undefined;
  const bounds = {
    x: position?.x ?? centerUiPixel(scene.x, scene.width, windowWidth),
    y: position?.y ?? centerUiPixel(scene.y, scene.height, windowHeight),
    width: windowWidth,
    height: windowHeight,
  };
  return (
    <div
      className="xse-dialog-backdrop"
      onPointerDown={(event) => {
        if (event.target === event.currentTarget) event.preventDefault();
        event.stopPropagation();
      }}
      onClick={(event) => event.stopPropagation()}
      onWheel={(event) => event.stopPropagation()}
    >
      <EditorDialog
        open
        modal
        constrainToViewport
        resizable={false}
        title={tUi("ui.export")}
        bounds={bounds}
        onBoundsChange={({ x, y }) => setPosition({ x, y })}
        contentLayout={OverlayContentLayout.Flow}
        titlebarActions={
          selected.helpUrl
            ? ({ bounds: frame }) => (
                <Button
                  bounds={{ x: frame.x + frame.width - 44, y: frame.y + 6, width: 18, height: 22 }}
                  relativeTo={frame}
                  icon="window_help_icon"
                  part="window_button_normal"
                  hotPart="window_button_hot"
                  pushedPart="window_button_selected"
                  insetContent={false}
                  aria-label={tUi("ui.help.for", { value1: tUi("ui.export") })}
                  onClick={() => window.open(selected.helpUrl, "_blank", "noopener")}
                />
              )
            : undefined
        }
        onRootRef={(node) => {
          root.current = node;
        }}
        onOpenChange={(open) => {
          if (!open) props.onClose();
        }}
      >
        <div className={styles.body}>
          <div
            className={styles.selector}
            style={{ width: panelSize.width, height: SELECTOR_HEIGHT }}
          >
            <Text
              variant={TextVariant.Control}
              text={label}
              bounds={{ x: 0, y: 0, width: labelWidth, height: CONTROL_HEIGHT }}
            />
            <Menu
              label={label}
              items={formatMenu}
              renderTrigger={(trigger) => (
                <Button
                  {...trigger}
                  disabled={props.busy}
                  bounds={{
                    x: labelWidth,
                    y: 0,
                    width: panelSize.width - labelWidth,
                    height: CONTROL_HEIGHT,
                  }}
                  font={FontRole.Primary}
                >
                  <Text
                    variant={TextVariant.Control}
                    text={selectedText}
                    bounds={{
                      x: CONTROL_GAP,
                      y: 0,
                      width: panelSize.width - labelWidth - CONTROL_HEIGHT,
                      height: CONTROL_HEIGHT,
                    }}
                  />
                  <span className={styles.menuArrow} style={{ top: arrowY }}>
                    <Icon kind="combobox_arrow_down" scale={RASTER_SCALE} />
                  </span>
                </Button>
              )}
            />
          </div>
          {[...props.panels].map(([destination, render]) => (
            <section
              className={styles.panel}
              key={destination}
              hidden={destination !== props.destination}
            >
              <Suspense fallback={null}>{panel(destination, render)}</Suspense>
            </section>
          ))}
        </div>
      </EditorDialog>
    </div>
  );
}
