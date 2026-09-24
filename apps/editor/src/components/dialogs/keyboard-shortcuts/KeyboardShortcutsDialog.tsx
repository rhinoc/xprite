import {
  useCallback,
  useEffect,
  useMemo,
  useRef,
  useState,
  type CSSProperties,
  type ReactNode,
} from "react";

import { tUi, tUiSource } from "$/i18n";
import {
  Button,
  Combobox,
  Dialog,
  Input,
  Scrollbar,
  Text,
  TextVariant,
  useUi,
  focusDialogContainer,
  isDialogPopupTarget,
} from "@xprite/ui";
import type { SurfaceBounds } from "@xprite/ui";
import { UiIcon, UiPart } from "@xprite/ui/assets";
import { DEFAULT_SURFACE_VIEWPORT, surfaceLayout } from "@xprite/ui/canvas";
import { isImeKeyboardEvent } from "@xprite/ui/utils";

import styles from "$/components/dialogs/keyboard-shortcuts/keyboard-shortcuts.module.css";

export interface KeyboardShortcutItem {
  definitionKey?: string;
  bindings?: readonly { value: string; label: string }[];
  label: string;
  shortcut: string;
  context: string;
  path?: string;
  depth?: number;
  group?: string;
  queryText?: string;
}

export interface KeyboardShortcutSection {
  id: string;
  label: string;
  items: readonly KeyboardShortcutItem[];
}

interface KeyboardShortcutAction {
  id: string;
  label: string;
  disabled?: boolean;
  onSelect?: () => void;
}

interface KeyboardShortcutsLabels {
  title?: string;
  search?: string;
  action?: string;
  key?: string;
  context?: string;
  confirm?: string;
  cancel?: string;
  fileActions?: string;
  list?: string;
  describeResults?: (count: number, query: string, section: string) => string;
}

export interface KeyboardShortcutsDialogProps {
  open: boolean;
  onOpenChange: (open: boolean) => void;
  sections: readonly KeyboardShortcutSection[];
  sceneBounds?: Pick<SurfaceBounds, "width" | "height">;
  actions?: readonly KeyboardShortcutAction[];
  labels?: KeyboardShortcutsLabels;
  initialSection?: string;
  suspendFocus?: boolean;
  message?: string;
  busy?: boolean;
  onConfirm?: () => void;
  onApply?: () => void;
  onEditBinding?: (item: KeyboardShortcutItem, replacing?: string) => void;
  onDeleteBinding?: (item: KeyboardShortcutItem, binding: string) => void;
  onResetItem?: (item: KeyboardShortcutItem) => void;
  renderItemOptions?: (item: KeyboardShortcutItem) => ReactNode;
}

interface ShortcutListProps {
  rows: readonly KeyboardShortcutItem[];
  bounds: SurfaceBounds;
  relativeTo: { x: number; y: number };
  selectedIndex: number;
  onSelectedIndexChange: (index: number) => void;
  scrollTop: number;
  onScrollTopChange: (value: number) => void;
  rowHeight?: number;
  searchResults?: boolean;
  labels: Required<Pick<KeyboardShortcutsLabels, "action" | "key" | "context" | "list">>;
}

function ShortcutList({
  rows,
  bounds,
  relativeTo,
  selectedIndex,
  onSelectedIndexChange,
  scrollTop,
  onScrollTopChange,
  rowHeight = 26,
  searchResults = false,
  labels,
}: ShortcutListProps) {
  const { style, translateSource } = useUi();
  const viewport = DEFAULT_SURFACE_VIEWPORT;
  const layout = surfaceLayout(bounds, viewport);
  const origin = {
    x: Math.floor((relativeTo.x * viewport.width) / viewport.sceneWidth),
    y: Math.floor((relativeTo.y * viewport.height) / viewport.sceneHeight),
  };
  const headerHeight = 32;
  const bodyHeight = bounds.height - headerHeight;
  const contentHeight = rows.length * rowHeight;
  const maxScroll = Math.max(0, contentHeight - bodyHeight);
  const currentScroll = Math.max(0, Math.min(maxScroll, scrollTop));
  const colors = style.colors;
  const visibleStart = Math.max(0, Math.floor(currentScroll / rowHeight));
  const visibleEnd = Math.min(rows.length, Math.ceil((currentScroll + bodyHeight) / rowHeight));
  const keyColumnX = Math.floor(bounds.width * 0.64);
  const contextColumnX = Math.floor(bounds.width * 0.82);
  const scaleX = layout.width / bounds.width;
  const scaleY = layout.height / bounds.height;

  return (
    <div
      className={styles.listInput}
      role="listbox"
      aria-label={translateSource(labels.list)}
      aria-activedescendant={
        selectedIndex >= 0 && selectedIndex < rows.length
          ? `shortcut-row-${selectedIndex}`
          : undefined
      }
      tabIndex={0}
      style={{
        left: layout.left - origin.x,
        top: layout.top - origin.y,
        width: layout.width,
        height: layout.height,
      }}
      onWheel={(event) => {
        event.stopPropagation();
        onScrollTopChange(Math.max(0, Math.min(maxScroll, currentScroll + event.deltaY)));
      }}
      onKeyDown={(event) => {
        if (!rows.length) return;
        let next = selectedIndex;
        if (event.key === "ArrowDown")
          next = Math.min(rows.length - 1, Math.max(0, selectedIndex + 1));
        else if (event.key === "ArrowUp") next = Math.max(0, selectedIndex - 1);
        else if (event.key === "Home") next = 0;
        else if (event.key === "End") next = rows.length - 1;
        else if (event.key === "PageDown")
          next = Math.min(rows.length - 1, selectedIndex + Math.floor(bodyHeight / rowHeight));
        else if (event.key === "PageUp")
          next = Math.max(0, selectedIndex - Math.floor(bodyHeight / rowHeight));
        else return;
        event.preventDefault();
        event.stopPropagation();
        onSelectedIndexChange(next);
        const top = next * rowHeight;
        if (top < currentScroll) onScrollTopChange(top);
        else if (top + rowHeight > currentScroll + bodyHeight)
          onScrollTopChange(top + rowHeight - bodyHeight);
      }}
    >
      <div
        className={styles.listArtwork}
        aria-hidden="true"
        style={{
          width: bounds.width,
          height: bounds.height,
          transform: `scale(${scaleX}, ${scaleY})`,
          background: colors.background,
        }}
      >
        <UiPart
          part="sunken_normal"
          scale={2}
          drawCenter
          fill={colors.background}
          className={styles.artworkPart}
          style={{ width: bounds.width, height: bounds.height }}
        />
        <div
          className={styles.listFace}
          style={{
            left: 2,
            top: 2,
            width: bounds.width - 4,
            height: bounds.height - 4,
            background: colors.listitem_normal_face,
          }}
        />
        <div
          className={styles.listHeader}
          style={{
            left: 2,
            top: 2,
            width: bounds.width - 4,
            height: headerHeight,
            background: colors.face,
          }}
        >
          <Text
            variant={TextVariant.PositionedPixel}
            text={translateSource(labels.action)}
            x={6}
            y={8}
            color={colors.text}
          />
          <Text
            variant={TextVariant.PositionedPixel}
            text={translateSource(labels.key)}
            x={keyColumnX - 2}
            y={8}
            color={colors.text}
          />
          <Text
            variant={TextVariant.PositionedPixel}
            text={translateSource(labels.context)}
            x={contextColumnX - 2}
            y={8}
            color={colors.text}
          />
        </div>
        <div
          className={styles.listHeaderBorder}
          style={{
            left: 2,
            top: headerHeight + 1,
            width: bounds.width - 4,
            background: colors.border ?? "#777",
          }}
        />
        <div
          className={styles.rowArtworkViewport}
          style={{ left: 3, top: headerHeight, width: bounds.width - 6, height: bodyHeight }}
        >
          {rows.slice(visibleStart, visibleEnd).map((row, offset) => {
            const index = visibleStart + offset;
            const selectedRow = index === selectedIndex;
            const rowColor = selectedRow
              ? colors.listitem_selected_text
              : colors.listitem_normal_text;
            return (
              <div
                key={`${index}:${row.label}:${row.shortcut}`}
                className={styles.rowArtwork}
                style={{
                  top: index * rowHeight - currentScroll,
                  width: bounds.width - 6,
                  height: rowHeight,
                  background: selectedRow ? colors.listitem_selected_face : undefined,
                }}
              >
                <div
                  className={styles.rowActionClip}
                  style={{ width: Math.max(0, keyColumnX - 8) }}
                >
                  {searchResults && row.group && (
                    <Text
                      variant={TextVariant.PositionedPixel}
                      text={translateSource(row.group)}
                      x={bounds.width - 132}
                      y={7}
                      color={selectedRow ? rowColor : colors.disabled}
                    />
                  )}
                  <Text
                    variant={TextVariant.PositionedPixel}
                    text={translateSource(row.label)}
                    x={4 + Math.min((row.depth ?? 0) * 16, 120)}
                    y={6}
                    color={rowColor}
                  />
                </div>
                <Text
                  variant={TextVariant.PositionedPixel}
                  text={row.shortcut}
                  x={keyColumnX - 3}
                  y={6}
                  color={rowColor}
                />
                {row.context && (
                  <Text
                    variant={TextVariant.PositionedPixel}
                    text={translateSource(row.context)}
                    x={contextColumnX - 3}
                    y={6}
                    color={rowColor}
                  />
                )}
              </div>
            );
          })}
        </div>
      </div>
      <div
        className={styles.rowHitArea}
        style={{
          top: headerHeight * (layout.height / bounds.height),
          height: Math.max(0, bodyHeight * (layout.height / bounds.height)),
        }}
      >
        {rows.slice(visibleStart, visibleEnd).map((row, offset) => {
          const index = visibleStart + offset;
          const y = index * rowHeight - currentScroll;
          return (
            <button
              id={`shortcut-row-${index}`}
              key={`${index}:${row.label}:${row.shortcut}`}
              type="button"
              role="option"
              aria-selected={index === selectedIndex}
              aria-label={`${translateSource(row.label)}, ${row.shortcut}${row.context ? `, ${translateSource(row.context)}` : ""}`}
              className={styles.rowHit}
              style={{
                top: y * (layout.height / bounds.height),
                height: rowHeight * (layout.height / bounds.height),
              }}
              onMouseEnter={() => onSelectedIndexChange(index)}
              onClick={() => onSelectedIndexChange(index)}
            />
          );
        })}
      </div>
    </div>
  );
}

const DEFAULT_LABELS: Required<Omit<KeyboardShortcutsLabels, "describeResults">> = {
  title: "Keyboard Shortcuts",
  search: "Search keyboard shortcuts",
  action: "Action",
  key: "Key",
  context: "Context",
  confirm: "OK",
  cancel: "Cancel",
  fileActions: "Shortcut file actions",
  list: "Keyboard shortcuts",
};

/** Aseprite-styled, data-driven shortcut browser. The host supplies its shortcut catalog and actions. */
export function KeyboardShortcutsDialog({
  open,
  onOpenChange,
  sections,
  sceneBounds,
  actions = [],
  labels: suppliedLabels,
  initialSection,
  suspendFocus = false,
  message,
  busy = false,
  onConfirm,
  onApply,
  onEditBinding,
  onDeleteBinding,
  onResetItem,
  renderItemOptions,
}: KeyboardShortcutsDialogProps) {
  const labels = { ...DEFAULT_LABELS, ...suppliedLabels };
  const { style, translateSource } = useUi();
  const host = useRef<HTMLDivElement>(null);
  const focusSuspended = useRef(suspendFocus);
  focusSuspended.current = suspendFocus;
  const [position, setPosition] = useState<SurfaceBounds | null>(null);
  const firstSection = sections.find((section) => section.id === initialSection) ?? sections[0];
  const [sectionId, setSectionId] = useState(firstSection?.id ?? "");
  const [searchDraft, setSearchDraft] = useState("");
  const [query, setQuery] = useState("");
  const [selected, setSelected] = useState(0);
  const [scrollTop, setScrollTop] = useState(0);
  const [bindingIndex, setBindingIndex] = useState(0);
  const [hotSection, setHotSection] = useState<string | null>(null);
  const searchState = useRef({ searchDraft, query });
  searchState.current = { searchDraft, query };

  const sceneWidth = sceneBounds?.width ?? DEFAULT_SURFACE_VIEWPORT.sceneWidth;
  const sceneHeight = sceneBounds?.height ?? DEFAULT_SURFACE_VIEWPORT.sceneHeight;
  const defaultWidth = Math.min(1024, Math.max(720, sceneWidth - 24));
  const defaultHeight = Math.min(744, Math.max(520, sceneHeight - 24));
  const bounds = position ?? { x: 0, y: 0, width: defaultWidth, height: defaultHeight };
  const width = bounds.width - 24;
  const height = bounds.height - 46;
  const leftWidth = Math.max(184, Math.round(width * 0.205));
  const listX = leftWidth + 10;
  const listWidth = Math.max(300, width - listX);
  const listY = 0;
  const searchBounds = { x: 0, y: 0, width: leftWidth, height: 32 };
  const sectionBounds = { x: 0, y: 40, width: leftWidth, height: Math.min(440, height - 164) };
  const currentSection = sections.find((section) => section.id === sectionId) ?? firstSection;
  const rawRows = currentSection?.items ?? [];
  const searchRows = useMemo(() => {
    if (!query.trim()) return [];
    const term = query.trim().toLocaleLowerCase();
    const prioritized = [...sections].sort(
      (a, b) => Number(b.id === sectionId) - Number(a.id === sectionId),
    );
    const found = new Set<string>();
    return prioritized.flatMap((section) =>
      section.items
        .filter((row) => {
          const matches =
            `${translateSource(row.label)} ${row.shortcut} ${translateSource(row.context)} ${row.path ?? ""} ${row.queryText ?? ""}`
              .toLocaleLowerCase()
              .includes(term);
          if (!matches) return false;
          const identity = row.definitionKey ?? `${row.label}:${row.shortcut}:${row.context}`;
          if (found.has(identity)) return false;
          found.add(identity);
          return true;
        })
        .map((row) => ({ ...row, group: section.label })),
    );
  }, [query, sections, sectionId, translateSource]);
  const visibleRows = query.trim() ? searchRows : rawRows;
  const selectedItem = visibleRows[selected];
  const itemOptions = selectedItem && renderItemOptions?.(selectedItem);
  const listHeight = height - (onEditBinding ? 100 : 58) - (itemOptions ? 104 : 0);
  const selectedBinding = selectedItem?.bindings?.[bindingIndex] ?? selectedItem?.bindings?.[0];
  useEffect(() => setBindingIndex(0), [selectedItem?.definitionKey]);
  const colors = style.colors;
  const hostStyle = {
    "--ui-shortcuts-focus-ring": colors.focus ?? colors.selected ?? colors.text,
  } as CSSProperties;
  const sectionLabel = currentSection?.label ?? "";
  const describeResults =
    suppliedLabels?.describeResults ??
    ((count: number, search: string, label: string) =>
      search
        ? tUi("ui.matching.shortcuts", { value1: count })
        : tUi("ui.shortcuts.in", { value1: count, value2: tUiSource(label) }));
  const focusDialog = useCallback(() => focusDialogContainer(host.current), []);

  useEffect(() => {
    if (!open) {
      setPosition(null);
      setSearchDraft("");
      setQuery("");
      setSelected(0);
      setScrollTop(0);
      setSectionId(firstSection?.id ?? "");
      return;
    }
    if (suspendFocus) return;
    const timer = window.setTimeout(focusDialog, 0);
    return () => window.clearTimeout(timer);
  }, [open, firstSection?.id, focusDialog, suspendFocus]);

  useEffect(() => {
    const timer = window.setTimeout(() => {
      setQuery(searchDraft);
      setSelected(0);
      setScrollTop(0);
    }, 250);
    return () => window.clearTimeout(timer);
  }, [searchDraft]);

  useEffect(() => {
    if (!open || suspendFocus) return;
    const previous = document.activeElement instanceof HTMLElement ? document.activeElement : null;
    const root = host.current;
    const focus = (event: FocusEvent) => {
      if (!root?.contains(event.target as Node) && !isDialogPopupTarget(root, event.target))
        focusDialog();
    };
    const key = (event: KeyboardEvent) => {
      if (isImeKeyboardEvent(event)) return;
      if (isDialogPopupTarget(root, event.target)) return;
      const { searchDraft: draft, query: currentQuery } = searchState.current;
      if (event.key === "Escape" && (draft || currentQuery)) {
        event.preventDefault();
        event.stopPropagation();
        setSearchDraft("");
        setQuery("");
        setSelected(0);
        setScrollTop(0);
        focusDialog();
        return;
      }
      if (event.key !== "Tab") return;
      const nodes = [
        ...(root?.querySelectorAll<HTMLElement>(
          'button:not(:disabled), input:not(:disabled), [role="listbox"][tabindex="0"]',
        ) ?? []),
      ];
      const index = nodes.indexOf(document.activeElement as HTMLElement);
      if (
        nodes.length &&
        (index < 0 ||
          (event.shiftKey && index === 0) ||
          (!event.shiftKey && index === nodes.length - 1))
      ) {
        event.preventDefault();
        nodes[event.shiftKey ? nodes.length - 1 : 0].focus();
      }
    };
    document.addEventListener("focusin", focus);
    document.addEventListener("keydown", key, true);
    return () => {
      document.removeEventListener("focusin", focus);
      document.removeEventListener("keydown", key, true);
      if (!focusSuspended.current && previous?.isConnected) previous.focus({ preventScroll: true });
    };
  }, [open, focusDialog, suspendFocus]);

  if (!open) return null;

  return (
    <div
      ref={host}
      className={styles.host}
      style={hostStyle}
      onPointerDown={(event) => {
        if (event.target === event.currentTarget) event.preventDefault();
        event.stopPropagation();
      }}
      onClick={(event) => event.stopPropagation()}
      onWheel={(event) => event.stopPropagation()}
      onKeyDownCapture={(event) => {
        if (
          isImeKeyboardEvent(event.nativeEvent) ||
          isDialogPopupTarget(host.current, event.target)
        )
          return;
        if (!suspendFocus && event.key === "Escape" && (searchDraft || query)) {
          event.preventDefault();
          event.stopPropagation();
          setSearchDraft("");
          setQuery("");
          setScrollTop(0);
          setSelected(0);
          focusDialog();
        }
      }}
    >
      <Dialog
        open
        centerOnOpen={!position}
        onOpenChange={onOpenChange}
        title={labels.title}
        bounds={position ?? undefined}
        defaultBounds={{ x: 0, y: 0, width: defaultWidth, height: defaultHeight }}
        onBoundsChange={setPosition}
        resizable
        modal
        autoFocus={false}
        constrainToViewport
        sceneBounds={sceneBounds}
      >
        {({ clientBounds: client, viewport }) => {
          const scaleX = viewport.width / viewport.sceneWidth;
          const scaleY = viewport.height / viewport.sceneHeight;
          const searchEntryBounds = {
            x: client.x + searchBounds.x,
            y: client.y + searchBounds.y,
            width: searchBounds.width,
            height: searchBounds.height,
          };
          const bodyBounds = {
            x: client.x + listX,
            y: client.y + listY,
            width: listWidth,
            height: listHeight,
          };
          return (
            <>
              <div
                className={styles.dialogArtwork}
                aria-hidden="true"
                style={{
                  width,
                  height,
                  transform: `scale(${scaleX}, ${scaleY})`,
                }}
              >
                <UiPart
                  part="sunken_normal"
                  scale={2}
                  drawCenter
                  fill={colors.window_face}
                  className={styles.artworkPart}
                  style={{
                    left: sectionBounds.x,
                    top: sectionBounds.y,
                    width: sectionBounds.width,
                    height: sectionBounds.height,
                    background: colors.window_face,
                  }}
                />
                <div
                  className={styles.sectionListFace}
                  style={{
                    left: sectionBounds.x + 2,
                    top: sectionBounds.y + 2,
                    width: sectionBounds.width - 4,
                    height: sectionBounds.height - 4,
                    background: colors.listitem_normal_face,
                  }}
                />
                {sections.map((section, index) => {
                  const selectedSection = !query.trim() && sectionId === section.id;
                  const sectionInk = selectedSection
                    ? colors.listitem_selected_text
                    : hotSection === section.id
                      ? colors.menuitem_hot_text
                      : colors.listitem_normal_text;
                  return (
                    <div
                      key={section.id}
                      className={styles.sectionArtwork}
                      style={{
                        left: sectionBounds.x + 3,
                        top: sectionBounds.y + 3 + index * 28,
                        width: sectionBounds.width - 6,
                        height: 27,
                        background: selectedSection
                          ? colors.listitem_selected_face
                          : hotSection === section.id
                            ? colors.menuitem_hot_face
                            : colors.listitem_normal_face,
                      }}
                    >
                      <Text
                        variant={TextVariant.PositionedPixel}
                        text={translateSource(section.label)}
                        x={6}
                        y={7}
                        color={sectionInk}
                      />
                    </div>
                  );
                })}
                {actions.map((action, index) => (
                  <div
                    key={action.id}
                    className={styles.actionArtwork}
                    style={{
                      left: 0,
                      top: sectionBounds.y + sectionBounds.height + 12 + index * 38,
                      width: leftWidth,
                      height: 32,
                    }}
                  >
                    <UiPart
                      part="button_normal"
                      scale={2}
                      drawCenter
                      fill={colors.button_face}
                      className={styles.artworkPart}
                      style={{ width: leftWidth, height: 32, background: colors.button_face }}
                    />
                    <span className={styles.actionArtworkLabel}>
                      <Text variant={TextVariant.Inline} scale={2} ink={colors.disabled}>
                        {translateSource(action.label)}
                      </Text>
                    </span>
                  </div>
                ))}
                <div
                  className={styles.footerDivider}
                  style={{
                    left: 0,
                    top: height - 50,
                    width,
                    height: 2,
                    background: colors.border ?? "#777",
                  }}
                />
              </div>
              <Input
                bounds={searchEntryBounds}
                relativeTo={client}
                value={searchDraft}
                leading={<UiIcon part="icon_search" scale={2} color="currentColor" />}
                size={24}
                aria-label={labels.search}
                autoComplete="off"
                spellCheck={false}
                onValueChange={setSearchDraft}
                onKeyDown={(event) => {
                  if (isImeKeyboardEvent(event.nativeEvent)) return;
                  if (!suspendFocus && event.key === "Escape" && (searchDraft || query)) {
                    event.preventDefault();
                    event.stopPropagation();
                    setSearchDraft("");
                    setQuery("");
                  }
                }}
              />
              {sections.map((section, index) => {
                const buttonBounds = {
                  x: client.x + 2,
                  y: client.y + 43 + index * 28,
                  width: leftWidth - 4,
                  height: 27,
                };
                return (
                  <button
                    key={section.id}
                    type="button"
                    aria-label={translateSource(section.label)}
                    aria-pressed={!query.trim() && sectionId === section.id}
                    className={styles.sectionHit}
                    style={{
                      left: ((buttonBounds.x - client.x) * viewport.width) / viewport.sceneWidth,
                      top: ((buttonBounds.y - client.y) * viewport.height) / viewport.sceneHeight,
                      width: (buttonBounds.width * viewport.width) / viewport.sceneWidth,
                      height: (buttonBounds.height * viewport.height) / viewport.sceneHeight,
                    }}
                    onMouseEnter={() => setHotSection(section.id)}
                    onMouseLeave={() => setHotSection(null)}
                    onClick={() => {
                      setSectionId(section.id);
                      setQuery("");
                      setSearchDraft("");
                      setSelected(0);
                      setScrollTop(0);
                    }}
                  />
                );
              })}
              {actions.length > 0 && (
                <div className={styles.actions} aria-label={translateSource(labels.fileActions)}>
                  {actions.map((action, index) => (
                    <button
                      key={action.id}
                      type="button"
                      disabled={action.disabled || busy}
                      aria-label={translateSource(action.label)}
                      className={styles.actionHit}
                      style={{
                        left: 0,
                        top:
                          ((sectionBounds.y + sectionBounds.height + 12 + index * 38) *
                            viewport.height) /
                          viewport.sceneHeight,
                        width: (leftWidth * viewport.width) / viewport.sceneWidth,
                        height: (32 * viewport.height) / viewport.sceneHeight,
                      }}
                      onClick={action.onSelect}
                    />
                  ))}
                </div>
              )}
              <ShortcutList
                rows={visibleRows}
                bounds={bodyBounds}
                relativeTo={client}
                selectedIndex={selected}
                onSelectedIndexChange={setSelected}
                scrollTop={scrollTop}
                onScrollTopChange={setScrollTop}
                rowHeight={26}
                searchResults={!!query.trim()}
                labels={labels}
              />
              <Scrollbar
                bounds={{
                  x: bodyBounds.x + bodyBounds.width - 18,
                  y: bodyBounds.y + 3,
                  width: 16,
                  height: bodyBounds.height - 6,
                }}
                relativeTo={client}
                contentSize={visibleRows.length * 26}
                visibleSize={listHeight - 32}
                value={scrollTop}
                onValueChange={setScrollTop}
                variant="mini"
                aria-label={tUi("ui.scroll", { value1: translateSource(labels.list) })}
              />
              {itemOptions && (
                <div
                  className={styles.itemOptions}
                  style={{
                    left: listX * scaleX,
                    top: (listHeight + 8) * scaleY,
                    width: listWidth * scaleX,
                    height: 88 * scaleY,
                  }}
                >
                  {itemOptions}
                </div>
              )}
              {onEditBinding && (
                <>
                  <Combobox
                    bounds={{ x: bodyBounds.x, y: client.y + height - 86, width: 170, height: 32 }}
                    relativeTo={client}
                    aria-label="Shortcut"
                    value={selectedBinding?.value ?? ""}
                    options={
                      selectedItem?.bindings?.length
                        ? selectedItem.bindings
                        : [{ value: "", label: "None" }]
                    }
                    disabled={!selectedItem?.bindings?.length}
                    onValueChange={(value) =>
                      setBindingIndex(
                        selectedItem?.bindings?.findIndex((binding) => binding.value === value) ??
                          0,
                      )
                    }
                  />
                  {[
                    {
                      text: "Add",
                      disabled: !selectedItem?.definitionKey,
                      run: () => selectedItem && onEditBinding(selectedItem),
                    },
                    {
                      text: "Change",
                      disabled: !selectedBinding,
                      run: () =>
                        selectedItem &&
                        selectedBinding &&
                        onEditBinding(selectedItem, selectedBinding.value),
                    },
                    {
                      text: "Delete",
                      disabled: !selectedBinding,
                      run: () =>
                        selectedItem &&
                        selectedBinding &&
                        onDeleteBinding?.(selectedItem, selectedBinding.value),
                    },
                    {
                      text: "Reset",
                      disabled: !selectedItem?.definitionKey,
                      run: () => selectedItem && onResetItem?.(selectedItem),
                    },
                  ].map((action, index) => (
                    <Button
                      key={action.text}
                      bounds={{
                        x: bodyBounds.x + 178 + index * 82,
                        y: client.y + height - 86,
                        width: 76,
                        height: 32,
                      }}
                      relativeTo={client}
                      text={action.text}
                      disabled={action.disabled}
                      onClick={action.run}
                    />
                  ))}
                </>
              )}
              {message && (
                <div
                  className={styles.statusMessage}
                  role="status"
                  style={{
                    left: listX * scaleX,
                    top: (height - 40) * scaleY,
                    width: Math.max(0, listWidth - 255) * scaleX,
                  }}
                >
                  <Text variant={TextVariant.Inline}>{translateSource(message)}</Text>
                </div>
              )}
              {onApply && (
                <Button
                  bounds={{
                    x: client.x + width - 242,
                    y: client.y + height - 42,
                    width: 76,
                    height: 32,
                  }}
                  relativeTo={client}
                  text="Apply"
                  disabled={busy}
                  onClick={onApply}
                />
              )}
              <Button
                bounds={{
                  x: client.x + width - 160,
                  y: client.y + height - 42,
                  width: 76,
                  height: 32,
                }}
                relativeTo={client}
                text={labels.confirm}
                disabled={busy}
                part="button_normal"
                hotPart="button_hot"
                pushedPart="button_selected"
                onClick={() => {
                  onConfirm?.();
                  onOpenChange(false);
                }}
              />
              <Button
                bounds={{
                  x: client.x + width - 78,
                  y: client.y + height - 42,
                  width: 76,
                  height: 32,
                }}
                relativeTo={client}
                text={labels.cancel}
                part="button_normal"
                hotPart="button_hot"
                pushedPart="button_selected"
                onClick={() => onOpenChange(false)}
              />
              <div className={styles.announcement} aria-live="polite">
                {describeResults(visibleRows.length, query, sectionLabel)}
              </div>
            </>
          );
        }}
      </Dialog>
    </div>
  );
}
